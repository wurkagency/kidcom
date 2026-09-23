// Performance budget for the built web app (run after `npm run build`):
// what a phone downloads before the first screen, and in total, gzipped.
// Fails (exit 1) when a budget is exceeded, printing what grew.
import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const dist = path.resolve(import.meta.dirname, "../apps/web/dist");
const BUDGET_KB = {
  entryJs: 200, // index + runtime: blocks the first screen
  totalJs: 480, // every lazy screen chunk together
  totalCss: 40,
  largestLazyChunk: 60,
};

const assets = readdirSync(path.join(dist, "assets")).map((file) => {
  const bytes = readFileSync(path.join(dist, "assets", file));
  return { file, gz: gzipSync(bytes).length / 1024 };
});
const html = readFileSync(path.join(dist, "index.html"), "utf8");
const entryFiles = new Set([...html.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g)].map((m) => m[1]));

const js = assets.filter((a) => a.file.endsWith(".js"));
const measured = {
  entryJs: js.filter((a) => entryFiles.has(a.file)).reduce((s, a) => s + a.gz, 0),
  totalJs: js.reduce((s, a) => s + a.gz, 0),
  totalCss: assets.filter((a) => a.file.endsWith(".css")).reduce((s, a) => s + a.gz, 0),
  largestLazyChunk: Math.max(...js.filter((a) => !entryFiles.has(a.file)).map((a) => a.gz)),
};

let failed = false;
for (const [key, limit] of Object.entries(BUDGET_KB)) {
  const value = measured[key];
  const ok = value <= limit;
  failed ||= !ok;
  console.log(`${ok ? "✓" : "✖"} ${key.padEnd(17)} ${value.toFixed(1).padStart(7)} KB gz  (budget ${limit} KB)`);
}
if (failed) {
  console.log("\nLargest JS chunks:");
  for (const a of js.sort((x, y) => y.gz - x.gz).slice(0, 8)) console.log(`  ${a.gz.toFixed(1).padStart(7)} KB  ${a.file}`);
  process.exit(1);
}
