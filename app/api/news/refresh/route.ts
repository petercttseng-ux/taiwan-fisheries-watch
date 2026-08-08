import artifact from "../../../artifact-data.json";
import { readDashboardSnapshot, writeDashboardSnapshot } from "../../../../db/dashboard-snapshot";
import { searchLatestNews, type DashboardSnapshot } from "../../../../lib/news-monitor";

export const dynamic = "force-dynamic";

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const CRON_EXPRESSION = "*/10 * * * *";
const fallbackSnapshot = artifact.snapshot as DashboardSnapshot;

function nextScheduledRun(now = Date.now()) {
  return Math.ceil((now + 1) / REFRESH_INTERVAL_MS) * REFRESH_INTERVAL_MS;
}

function response(
  snapshot: DashboardSnapshot,
  refreshed: boolean,
  persistence: "d1" | "fallback",
  updatedAt: number | null,
  warning?: string,
  status = 200,
) {
  return Response.json(
    {
      snapshot,
      refreshed,
      persistence,
      schedule: {
        intervalMinutes: 10,
        nextRunAt: new Date(nextScheduledRun()).toISOString(),
        lastSuccessAt: updatedAt ? new Date(updatedAt).toISOString() : null,
        healthy: persistence === "d1" && !warning,
      },
      ...(warning ? { warning } : {}),
    },
    { status, headers: { "cache-control": "no-store" } },
  );
}

async function storedSnapshot() {
  try {
    return { stored: await readDashboardSnapshot(), persistence: "d1" as const };
  } catch {
    return { stored: null, persistence: "fallback" as const };
  }
}

export async function GET() {
  const { stored, persistence } = await storedSnapshot();
  return response(stored?.snapshot ?? fallbackSnapshot, false, persistence, stored?.updatedAt ?? null);
}

export async function POST(request: Request) {
  if (request.headers.get("x-dashboard-cron") !== CRON_EXPRESSION) {
    return Response.json(
      { error: "搜尋由後端排程執行；前端只能讀取最新快照。" },
      { status: 405, headers: { allow: "GET", "cache-control": "no-store" } },
    );
  }

  const { stored, persistence } = await storedSnapshot();
  if (stored && Date.now() - stored.updatedAt < REFRESH_INTERVAL_MS) {
    return response(stored.snapshot, false, persistence, stored.updatedAt);
  }

  try {
    const snapshot = await searchLatestNews();
    const updatedAt = await writeDashboardSnapshot(snapshot);
    return response(snapshot, true, "d1", updatedAt);
  } catch (error) {
    const previous = stored?.snapshot ?? fallbackSnapshot;
    return response(
      previous,
      false,
      persistence,
      stored?.updatedAt ?? null,
      error instanceof Error ? error.message : "自動搜尋失敗，已保留上一版資料",
      502,
    );
  }
}
