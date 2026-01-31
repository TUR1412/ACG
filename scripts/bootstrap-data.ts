import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { createLogger } from "./lib/logger";

const STUB_GENERATED_AT = "1970-01-01T00:00:00.000Z";

type EnsureResult = "created" | "skipped";

type Target = {
  path: string;
  data: unknown;
  gzip?: boolean;
};

async function ensureDirForFile(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}

async function ensureJsonFile(filePath: string, data: unknown): Promise<EnsureResult> {
  if (existsSync(filePath)) return "skipped";
  await ensureDirForFile(filePath);
  const raw = JSON.stringify(data) + "\n";
  await writeFile(filePath, raw, "utf-8");
  return "created";
}

async function ensureGzipFromJsonFile(jsonPath: string): Promise<EnsureResult> {
  const gzPath = `${jsonPath}.gz`;
  if (existsSync(gzPath)) return "skipped";
  if (!existsSync(jsonPath)) return "skipped";

  await ensureDirForFile(gzPath);
  const raw = await readFile(jsonPath);
  const gz = gzipSync(raw, { level: 9 });
  await writeFile(gzPath, gz);
  return "created";
}

async function ensurePublicJsonAndGzip(filePath: string, data: unknown): Promise<EnsureResult[]> {
  const results: EnsureResult[] = [];
  results.push(await ensureJsonFile(filePath, data));
  results.push(await ensureGzipFromJsonFile(filePath));
  return results;
}

async function main() {
  const log = createLogger();
  const root = process.cwd();

  const posts: unknown[] = [];
  const status = { generatedAt: null, durationMs: 0, sources: [] as unknown[] };
  const statusHistory = { v: 1, generatedAt: null, entries: [] as unknown[] };
  const searchPackV1 = { v: 1, generatedAt: STUB_GENERATED_AT, posts: [], index: [] };
  const searchPackV2 = { v: 2, generatedAt: STUB_GENERATED_AT, posts: [], index: [] };

  const targets: Target[] = [
    // SSR 读取（Astro build 时 readGenerated* 会读取这里）
    { path: resolve(root, "src", "data", "generated", "posts.json"), data: posts },
    { path: resolve(root, "src", "data", "generated", "status.json"), data: status },
    { path: resolve(root, "src", "data", "generated", "status-history.v1.json"), data: statusHistory },
    { path: resolve(root, "src", "data", "generated", "search-pack.v1.json"), data: searchPackV1 },
    { path: resolve(root, "src", "data", "generated", "search-pack.v2.json"), data: searchPackV2 },

    // Runtime fetch（浏览器端会请求 /data/*.json 与 /data/*.json.gz）
    { path: resolve(root, "public", "data", "posts.json"), data: posts, gzip: true },
    { path: resolve(root, "public", "data", "status.json"), data: status, gzip: true },
    { path: resolve(root, "public", "data", "status-history.v1.json"), data: statusHistory, gzip: true },
    { path: resolve(root, "public", "data", "search-pack.v1.json"), data: searchPackV1, gzip: true },
    { path: resolve(root, "public", "data", "search-pack.v2.json"), data: searchPackV2, gzip: true }
  ];

  const created: string[] = [];
  const skipped: string[] = [];

  for (const t of targets) {
    if (t.gzip) {
      const results = await ensurePublicJsonAndGzip(t.path, t.data);
      if (results.includes("created")) created.push(t.path);
      else skipped.push(t.path);
      continue;
    }

    const r = await ensureJsonFile(t.path, t.data);
    if (r === "created") created.push(t.path);
    else skipped.push(t.path);
  }

  if (created.length > 0) {
    log.info(`[BOOTSTRAP] created ${created.length} file(s):`);
    for (const p of created) log.info(`- ${p}`);
  } else {
    log.info("[BOOTSTRAP] no files created");
  }

  log.info(`[BOOTSTRAP] skipped ${skipped.length} existing file(s)`);
}

void main().catch((err) => {
  const log = createLogger();
  log.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
