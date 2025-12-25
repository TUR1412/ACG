import { readdir, stat } from "node:fs/promises";
import { resolve, posix } from "node:path";

type Budget = {
  jsKb: number;
  cssKb: number;
  htmlKb: number;
  dataGzKb: number;
  coversMb: number;
  totalMb: number;
};

function toInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function bytesToKb(bytes: number): number {
  return Math.round(bytes / 1024);
}

function bytesToMb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

async function walkFiles(dir: string): Promise<Array<{ path: string; size: number }>> {
  const out: Array<{ path: string; size: number }> = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = resolve(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walkFiles(full)));
      continue;
    }
    if (!e.isFile()) continue;
    const st = await stat(full);
    out.push({ path: full, size: st.size });
  }
  return out;
}

function normalizePathForReport(root: string, fullPath: string): string {
  const rel = fullPath.slice(root.length).replace(/^[\\/]+/, "");
  return rel.split("\\").join("/");
}

function isUnder(rel: string, prefix: string): boolean {
  const p = rel.startsWith("/") ? rel.slice(1) : rel;
  const pre = prefix.startsWith("/") ? prefix.slice(1) : prefix;
  return p === pre || p.startsWith(`${pre}/`);
}

async function main() {
  const root = process.cwd();
  const dist = resolve(root, "dist");

  const budget: Budget = {
    jsKb: toInt(process.env.ACG_BUDGET_JS_KB, 450),
    cssKb: toInt(process.env.ACG_BUDGET_CSS_KB, 650),
    htmlKb: toInt(process.env.ACG_BUDGET_HTML_KB, 900),
    dataGzKb: toInt(process.env.ACG_BUDGET_DATA_GZ_KB, 4500),
    coversMb: toInt(process.env.ACG_BUDGET_COVERS_MB, 160),
    totalMb: toInt(process.env.ACG_BUDGET_TOTAL_MB, 220)
  };

  const files = await walkFiles(dist);
  const report = files
    .map((f) => ({ rel: normalizePathForReport(dist, f.path), size: f.size }))
    .sort((a, b) => b.size - a.size);

  let jsBytes = 0;
  let cssBytes = 0;
  let htmlBytes = 0;
  let dataGzBytes = 0;
  let coversBytes = 0;
  let totalBytes = 0;

  for (const f of report) {
    totalBytes += f.size;
    const rel = f.rel;
    const ext = posix.extname(rel).toLowerCase();

    if (isUnder(rel, "covers")) coversBytes += f.size;
    if (isUnder(rel, "data") && rel.endsWith(".gz")) dataGzBytes += f.size;
    if (ext === ".js" || ext === ".mjs") jsBytes += f.size;
    if (ext === ".css") cssBytes += f.size;
    if (ext === ".html" || ext === ".xml" || ext === ".json") htmlBytes += f.size;
  }

  console.log(`[BUDGET] dist=${bytesToMb(totalBytes)}MB files=${report.length}`);
  console.log(`[BUDGET] js=${bytesToKb(jsBytes)}KB (limit ${budget.jsKb}KB)`);
  console.log(`[BUDGET] css=${bytesToKb(cssBytes)}KB (limit ${budget.cssKb}KB)`);
  console.log(`[BUDGET] html/xml/json=${bytesToKb(htmlBytes)}KB (limit ${budget.htmlKb}KB)`);
  console.log(`[BUDGET] data.gz=${bytesToKb(dataGzBytes)}KB (limit ${budget.dataGzKb}KB)`);
  console.log(`[BUDGET] covers=${bytesToMb(coversBytes)}MB (limit ${budget.coversMb}MB)`);

  const top = report.slice(0, 12);
  if (top.length > 0) {
    console.log("[BUDGET] top files:");
    for (const f of top) console.log(`- ${f.rel} (${bytesToKb(f.size)}KB)`);
  }

  const failures: string[] = [];
  const jsKb = bytesToKb(jsBytes);
  const cssKb = bytesToKb(cssBytes);
  const htmlKb = bytesToKb(htmlBytes);
  const dataGzKb = bytesToKb(dataGzBytes);
  const coversMb = bytesToMb(coversBytes);
  const totalMb = bytesToMb(totalBytes);

  if (budget.jsKb > 0 && jsKb > budget.jsKb) failures.push(`JS 超标: ${jsKb}KB > ${budget.jsKb}KB`);
  if (budget.cssKb > 0 && cssKb > budget.cssKb) failures.push(`CSS 超标: ${cssKb}KB > ${budget.cssKb}KB`);
  if (budget.htmlKb > 0 && htmlKb > budget.htmlKb) failures.push(`HTML/XML/JSON 超标: ${htmlKb}KB > ${budget.htmlKb}KB`);
  if (budget.dataGzKb > 0 && dataGzKb > budget.dataGzKb) failures.push(`data.gz 超标: ${dataGzKb}KB > ${budget.dataGzKb}KB`);
  if (budget.coversMb > 0 && coversMb > budget.coversMb) failures.push(`covers 超标: ${coversMb}MB > ${budget.coversMb}MB`);
  if (budget.totalMb > 0 && totalMb > budget.totalMb) failures.push(`dist 总体积超标: ${totalMb}MB > ${budget.totalMb}MB`);

  if (failures.length > 0) {
    console.error(`[BUDGET] 失败：共 ${failures.length} 项`);
    for (const f of failures) console.error(`- ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(msg);
  process.exitCode = 1;
});

