import fs from "node:fs/promises";
import path from "node:path";
import { searchLatestNews } from "../lib/news-monitor.ts";

const root = process.cwd();
const templatePath = path.join(root, "app", "artifact-data.json");
const workDirectory = path.join(root, "work");
const outputPath = path.join(workDirectory, "latest-artifact.json");

const artifact = JSON.parse(await fs.readFile(templatePath, "utf8"));
const snapshot = await searchLatestNews();

artifact.snapshot = snapshot;
if (artifact.manifest) artifact.manifest.generatedAt = snapshot.generatedAt;

await fs.mkdir(workDirectory, { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(artifact, null, 2));

process.env.DASHBOARD_ARTIFACT_PATH = path.relative(root, outputPath);
await import(`./build-static.mjs?generated=${Date.now()}`);
