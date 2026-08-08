import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("Cloudflare Worker searches independently every ten minutes", async () => {
  const [worker, viteConfig, route] = await Promise.all([
    readFile(new URL("worker/index.ts", root), "utf8"),
    readFile(new URL("vite.config.ts", root), "utf8"),
    readFile(new URL("app/api/news/refresh/route.ts", root), "utf8"),
  ]);

  assert.match(viteConfig, /triggers:\s*\{\s*crons:\s*\["\*\/10 \* \* \* \*"\]\s*\}/);
  assert.match(worker, /async scheduled\(/);
  assert.match(worker, /x-dashboard-cron/);
  assert.match(worker, /handler\.fetch\(request, env, ctx\)/);
  assert.match(route, /REFRESH_INTERVAL_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000/);
  assert.match(route, /searchLatestNews\(\)/);
});

test("browser only reads snapshots and never starts a news search", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");

  assert.match(page, /SNAPSHOT_POLL_INTERVAL_MS\s*=\s*60\s*\*\s*1000/);
  assert.match(page, /fetch\("\/api\/news\/refresh",\s*\{\s*method:\s*"GET"/);
  assert.doesNotMatch(page, /method:\s*"POST"/);
  assert.match(page, /window\.setInterval\(loadLatestSnapshot,\s*SNAPSHOT_POLL_INTERVAL_MS\)/);
  assert.match(page, /window\.clearInterval\(refreshTimer\)/);
});

test("refresh failures preserve the last successful dashboard snapshot", async () => {
  const [route, database] = await Promise.all([
    readFile(new URL("app/api/news/refresh/route.ts", root), "utf8"),
    readFile(new URL("db/dashboard-snapshot.ts", root), "utf8"),
  ]);

  assert.match(route, /const previous = stored\?\.snapshot \?\? fallbackSnapshot/);
  assert.match(route, /自動搜尋失敗，已保留上一版資料/);
  assert.match(database, /ON CONFLICT\(id\) DO UPDATE/);
});
