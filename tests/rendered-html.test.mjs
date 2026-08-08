import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("production output contains the fisheries monitoring dashboard", async () => {
  const assetsRoot = new URL("../dist/client/assets/", import.meta.url);
  const assetNames = await readdir(assetsRoot);
  const pageAsset = assetNames.find((name) => /^page-.*\.js$/.test(name));
  assert.ok(pageAsset, "dashboard page asset was not emitted");
  const page = await readFile(new URL(pageAsset, assetsRoot), "utf8");

  assert.match(page, /每 10 分鐘自動搜尋/);
  assert.match(page, /最後成功更新/);
  assert.match(page, /後端排程正常/);
  assert.doesNotMatch(page, /codex-preview|react-loading-skeleton/i);
});
