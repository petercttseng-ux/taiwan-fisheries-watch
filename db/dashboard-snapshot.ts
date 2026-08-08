import { env } from "cloudflare:workers";
import type { DashboardSnapshot } from "../lib/news-monitor";

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS dashboard_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  generated_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`;

type SnapshotRow = { payload: string; updated_at: number };

function database() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function readDashboardSnapshot() {
  const db = database();
  await db.prepare(CREATE_TABLE).run();
  const row = await db.prepare("SELECT payload, updated_at FROM dashboard_snapshots WHERE id = ? LIMIT 1").bind("current").first<SnapshotRow>();
  if (!row) return null;
  return { snapshot: JSON.parse(row.payload) as DashboardSnapshot, updatedAt: row.updated_at };
}

export async function writeDashboardSnapshot(snapshot: DashboardSnapshot) {
  const db = database();
  const updatedAt = Date.now();
  await db.prepare(CREATE_TABLE).run();
  await db.prepare(`INSERT INTO dashboard_snapshots (id, generated_at, payload, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET generated_at = excluded.generated_at, payload = excluded.payload, updated_at = excluded.updated_at`)
    .bind("current", snapshot.generatedAt, JSON.stringify(snapshot), updatedAt)
    .run();
  return updatedAt;
}
