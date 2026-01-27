import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { sha1 } from "./lib/http-cache";
import { createLogger } from "./lib/logger";
import { SOURCE_CONFIGS } from "../src/lib/source-config";
import { isCategory } from "../src/lib/categories";

type ValidationError = { path: string; message: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isHttpOrRootRelativeUrl(value: string): boolean {
  // cover 允许被“本地缓存封面”替换为 /covers/... 这类根相对路径（运行时会按 base path 组装）
  return isHttpUrl(value) || value.startsWith("/");
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

async function readJsonFile<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw) as T;
}

function pushError(errors: ValidationError[], path: string, message: string) {
  errors.push({ path, message });
}

function validatePosts(json: unknown, errors: ValidationError[]) {
  if (!Array.isArray(json)) {
    pushError(errors, "posts", "posts.json 不是数组");
    return;
  }

  const allowedSources = new Set(SOURCE_CONFIGS.map((s) => s.id));
  const ids = new Set<string>();
  const urls = new Set<string>();
  let lastTime = Infinity;

  for (let i = 0; i < json.length; i += 1) {
    const p = json[i] as any;
    const base = `posts[${i}]`;
    if (!p || typeof p !== "object") {
      pushError(errors, base, "条目不是对象");
      continue;
    }

    const id = p.id;
    if (!isNonEmptyString(id)) pushError(errors, `${base}.id`, "id 缺失或为空");
    else if (ids.has(id)) pushError(errors, `${base}.id`, `id 重复: ${id}`);
    else ids.add(id);

    if (!isNonEmptyString(p.title)) pushError(errors, `${base}.title`, "title 缺失或为空");
    if (!isNonEmptyString(p.url) || !isHttpUrl(p.url)) {
      pushError(errors, `${base}.url`, "url 缺失或不是 http(s)");
    } else {
      const urlKey = p.url.toLowerCase();
      if (urls.has(urlKey)) pushError(errors, `${base}.url`, `url 重复: ${p.url}`);
      else urls.add(urlKey);

      if (isNonEmptyString(id)) {
        const expectedId = sha1(p.url);
        if (id !== expectedId)
          pushError(errors, `${base}.id`, `id 与 sha1(url) 不一致: ${id} vs ${expectedId}`);
      }
    }

    if (!isNonEmptyString(p.publishedAt)) pushError(errors, `${base}.publishedAt`, "publishedAt 缺失或为空");
    else {
      const t = Date.parse(p.publishedAt);
      if (!Number.isFinite(t)) pushError(errors, `${base}.publishedAt`, "publishedAt 不是可解析的时间");
      else {
        // 排序建议：不强制阻断，但发现明显乱序时给出错误（通常意味着去重/排序逻辑出问题）
        if (t > lastTime + 1_000) pushError(errors, `${base}.publishedAt`, "列表疑似未按时间倒序排列");
        lastTime = t;
      }
    }

    if (!isNonEmptyString(p.category) || !isCategory(p.category))
      pushError(errors, `${base}.category`, "category 缺失或非法");

    if (!Array.isArray(p.tags) || !p.tags.every((x: unknown) => typeof x === "string")) {
      pushError(errors, `${base}.tags`, "tags 缺失或不是 string[]");
    }

    if (!isNonEmptyString(p.sourceId)) pushError(errors, `${base}.sourceId`, "sourceId 缺失或为空");
    else if (!allowedSources.has(p.sourceId))
      pushError(errors, `${base}.sourceId`, `未知来源: ${p.sourceId}`);

    if (!isNonEmptyString(p.sourceName)) pushError(errors, `${base}.sourceName`, "sourceName 缺失或为空");
    if (!isNonEmptyString(p.sourceUrl) || !isHttpUrl(p.sourceUrl))
      pushError(errors, `${base}.sourceUrl`, "sourceUrl 缺失或不是 http(s)");

    if (p.cover != null && (!isNonEmptyString(p.cover) || !isHttpOrRootRelativeUrl(p.cover))) {
      pushError(errors, `${base}.cover`, "cover 存在但不是有效 URL（需为 http(s) 或以 / 开头的根相对路径）");
    }
  }
}

function validateStatus(json: unknown, errors: ValidationError[]) {
  if (!json || typeof json !== "object") {
    pushError(errors, "status", "status.json 不是对象");
    return;
  }

  const s = json as any;
  if (s.generatedAt != null && !isNonEmptyString(s.generatedAt))
    pushError(errors, "status.generatedAt", "generatedAt 类型非法");
  if (toNumber(s.durationMs) == null) pushError(errors, "status.durationMs", "durationMs 缺失或不是数字");
  if (!Array.isArray(s.sources)) {
    pushError(errors, "status.sources", "sources 缺失或不是数组");
    return;
  }

  const configured = new Set(SOURCE_CONFIGS.map((it) => it.id));
  const seen = new Set<string>();

  for (let i = 0; i < s.sources.length; i += 1) {
    const it = s.sources[i] as any;
    const base = `status.sources[${i}]`;
    if (!it || typeof it !== "object") {
      pushError(errors, base, "source status 不是对象");
      continue;
    }

    if (!isNonEmptyString(it.id)) pushError(errors, `${base}.id`, "id 缺失或为空");
    else {
      seen.add(it.id);
      if (!configured.has(it.id)) pushError(errors, `${base}.id`, `存在未配置的来源 id: ${it.id}`);
    }

    if (!isNonEmptyString(it.name)) pushError(errors, `${base}.name`, "name 缺失或为空");
    if (!isNonEmptyString(it.kind)) pushError(errors, `${base}.kind`, "kind 缺失或为空");
    if (!isNonEmptyString(it.url) || !isHttpUrl(it.url))
      pushError(errors, `${base}.url`, "url 缺失或不是 http(s)");

    if (typeof it.ok !== "boolean") pushError(errors, `${base}.ok`, "ok 缺失或不是 boolean");
    if (toNumber(it.itemCount) == null) pushError(errors, `${base}.itemCount`, "itemCount 缺失或不是数字");
    if (toNumber(it.durationMs) == null) pushError(errors, `${base}.durationMs`, "durationMs 缺失或不是数字");

    const usedOk = it.used === "fetched" || it.used === "cached" || it.used === "fallback";
    if (!usedOk) pushError(errors, `${base}.used`, "used 非法（应为 fetched/cached/fallback）");

    if (it.httpStatus != null && toNumber(it.httpStatus) == null)
      pushError(errors, `${base}.httpStatus`, "httpStatus 不是数字");
    if (it.attempts != null && toNumber(it.attempts) == null)
      pushError(errors, `${base}.attempts`, "attempts 不是数字");
    if (it.waitMs != null && toNumber(it.waitMs) == null)
      pushError(errors, `${base}.waitMs`, "waitMs 不是数字");
    if (it.rawItemCount != null && toNumber(it.rawItemCount) == null)
      pushError(errors, `${base}.rawItemCount`, "rawItemCount 不是数字");
    if (it.filteredItemCount != null && toNumber(it.filteredItemCount) == null)
      pushError(errors, `${base}.filteredItemCount`, "filteredItemCount 不是数字");
    if (it.newItemCount != null && toNumber(it.newItemCount) == null)
      pushError(errors, `${base}.newItemCount`, "newItemCount 不是数字");
    if (it.visibleItemCount != null && toNumber(it.visibleItemCount) == null)
      pushError(errors, `${base}.visibleItemCount`, "visibleItemCount 不是数字");
    if (it.consecutiveFails != null && toNumber(it.consecutiveFails) == null)
      pushError(errors, `${base}.consecutiveFails`, "consecutiveFails 不是数字");
    if (it.latestPublishedAt != null) {
      if (!isNonEmptyString(it.latestPublishedAt))
        pushError(errors, `${base}.latestPublishedAt`, "latestPublishedAt 类型非法");
      else if (!Number.isFinite(Date.parse(it.latestPublishedAt)))
        pushError(errors, `${base}.latestPublishedAt`, "latestPublishedAt 不是可解析的时间");
    }
    if (it.error != null && !isNonEmptyString(it.error)) pushError(errors, `${base}.error`, "error 类型非法");
  }

  for (const id of configured) {
    if (!seen.has(id)) pushError(errors, "status.sources", `缺少来源状态: ${id}`);
  }
}

function validateSearchPack(json: unknown, errors: ValidationError[]) {
  if (!json || typeof json !== "object") {
    pushError(errors, "searchPack", "search-pack.v1.json 不是对象");
    return;
  }

  const it = json as any;
  const v = typeof it.v === "number" ? it.v : 0;
  if (v !== 1) pushError(errors, "searchPack.v", "search pack 版本非法（应为 1）");

  const posts = it.posts;
  const index = it.index;
  if (!Array.isArray(posts)) pushError(errors, "searchPack.posts", "posts 缺失或不是数组");
  if (!Array.isArray(index)) pushError(errors, "searchPack.index", "index 缺失或不是数组");

  const postLen = Array.isArray(posts) ? posts.length : 0;
  const idxLen = Array.isArray(index) ? index.length : 0;
  if (postLen <= 0) pushError(errors, "searchPack.posts", "posts 为空");
  if (idxLen <= 0) pushError(errors, "searchPack.index", "index 为空");
  if (postLen > 0 && idxLen > 0 && postLen !== idxLen) {
    pushError(errors, "searchPack.index", `index 数量与 posts 不一致: ${idxLen} vs ${postLen}`);
  }

  // 轻量结构抽检：避免过度阻塞（全量遍历会增加 CI 耗时）
  const samples = Array.isArray(index) ? (index as unknown[]).slice(0, 24) : [];
  for (let i = 0; i < samples.length; i += 1) {
    const row = samples[i] as any;
    const base = `searchPack.index[${i}]`;
    if (!row || typeof row !== "object") {
      pushError(errors, base, "条目不是对象");
      continue;
    }
    const ii = typeof row.i === "number" ? row.i : NaN;
    if (!Number.isFinite(ii)) pushError(errors, `${base}.i`, "i 缺失或不是数字");
    else if (postLen > 0 && (ii < 0 || ii >= postLen)) pushError(errors, `${base}.i`, "i 越界");

    if (!isNonEmptyString(row.hay)) pushError(errors, `${base}.hay`, "hay 缺失或为空");
    if (!Array.isArray(row.tags) || !row.tags.every((x: unknown) => typeof x === "string")) {
      pushError(errors, `${base}.tags`, "tags 缺失或不是 string[]");
    }
    if (!isNonEmptyString(row.sourceName)) pushError(errors, `${base}.sourceName`, "sourceName 缺失或为空");
    if (!isNonEmptyString(row.sourceId)) pushError(errors, `${base}.sourceId`, "sourceId 缺失或为空");
    if (!isNonEmptyString(row.sourceIdNorm))
      pushError(errors, `${base}.sourceIdNorm`, "sourceIdNorm 缺失或为空");
    if (!isNonEmptyString(row.category)) pushError(errors, `${base}.category`, "category 缺失或为空");
    if (row.publishedAtMs != null && toNumber(row.publishedAtMs) == null) {
      pushError(errors, `${base}.publishedAtMs`, "publishedAtMs 类型非法（应为 number|null）");
    }
  }
}

function validateSearchPackV2(json: unknown, errors: ValidationError[]) {
  if (!json || typeof json !== "object") {
    pushError(errors, "searchPackV2", "search-pack.v2.json 不是对象");
    return;
  }

  const it = json as any;
  const v = typeof it.v === "number" ? it.v : 0;
  if (v !== 2) pushError(errors, "searchPackV2.v", "search pack v2 版本非法（应为 2）");

  const posts = it.posts;
  const index = it.index;
  if (!Array.isArray(posts)) pushError(errors, "searchPackV2.posts", "posts 缺失或不是数组");
  if (!Array.isArray(index)) pushError(errors, "searchPackV2.index", "index 缺失或不是数组");

  const postLen = Array.isArray(posts) ? posts.length : 0;
  const idxLen = Array.isArray(index) ? index.length : 0;
  if (postLen <= 0) pushError(errors, "searchPackV2.posts", "posts 为空");
  if (idxLen <= 0) pushError(errors, "searchPackV2.index", "index 为空");
  if (postLen > 0 && idxLen > 0 && postLen !== idxLen) {
    pushError(errors, "searchPackV2.index", `index 数量与 posts 不一致: ${idxLen} vs ${postLen}`);
  }

  // 轻量结构抽检：避免过度阻塞（全量遍历会增加 CI 耗时）
  const samples = Array.isArray(index) ? (index as unknown[]).slice(0, 24) : [];
  for (let i = 0; i < samples.length; i += 1) {
    const row = samples[i] as any;
    const base = `searchPackV2.index[${i}]`;
    if (!row || typeof row !== "object") {
      pushError(errors, base, "条目不是对象");
      continue;
    }
    const ii = typeof row.i === "number" ? row.i : NaN;
    if (!Number.isFinite(ii)) pushError(errors, `${base}.i`, "i 缺失或不是数字");
    else if (postLen > 0 && (ii < 0 || ii >= postLen)) pushError(errors, `${base}.i`, "i 越界");

    if (!isNonEmptyString(row.hay)) pushError(errors, `${base}.hay`, "hay 缺失或为空");
    if (!Array.isArray(row.tags) || !row.tags.every((x: unknown) => typeof x === "string")) {
      pushError(errors, `${base}.tags`, "tags 缺失或不是 string[]");
    }
    if (!isNonEmptyString(row.sourceName)) pushError(errors, `${base}.sourceName`, "sourceName 缺失或为空");
    if (!isNonEmptyString(row.sourceId)) pushError(errors, `${base}.sourceId`, "sourceId 缺失或为空");
    if (!isNonEmptyString(row.sourceIdNorm))
      pushError(errors, `${base}.sourceIdNorm`, "sourceIdNorm 缺失或为空");
    if (!isNonEmptyString(row.category)) pushError(errors, `${base}.category`, "category 缺失或为空");
    if (row.publishedAtMs != null && toNumber(row.publishedAtMs) == null) {
      pushError(errors, `${base}.publishedAtMs`, "publishedAtMs 类型非法（应为 number|null）");
    }
  }
}

function validateStatusHistory(json: unknown, errors: ValidationError[]) {
  if (!json || typeof json !== "object") {
    pushError(errors, "statusHistory", "status-history.v1.json 不是对象");
    return;
  }

  const it = json as any;
  const v = typeof it.v === "number" ? it.v : 0;
  if (v !== 1) pushError(errors, "statusHistory.v", "status-history 版本非法（应为 1）");
  if (it.generatedAt != null && !isNonEmptyString(it.generatedAt))
    pushError(errors, "statusHistory.generatedAt", "generatedAt 类型非法");

  const entries = it.entries;
  if (!Array.isArray(entries)) {
    pushError(errors, "statusHistory.entries", "entries 缺失或不是数组");
    return;
  }
  if (entries.length <= 0) pushError(errors, "statusHistory.entries", "entries 为空");

  const samples = entries.slice(Math.max(0, entries.length - 36));
  let last = "";
  for (let i = 0; i < samples.length; i += 1) {
    const row = samples[i] as any;
    const base = `statusHistory.entries[${Math.max(0, entries.length - 36) + i}]`;
    if (!row || typeof row !== "object") {
      pushError(errors, base, "条目不是对象");
      continue;
    }

    if (!isNonEmptyString(row.generatedAt))
      pushError(errors, `${base}.generatedAt`, "generatedAt 缺失或为空");
    else {
      const t = Date.parse(row.generatedAt);
      if (!Number.isFinite(t)) pushError(errors, `${base}.generatedAt`, "generatedAt 不是可解析的时间");
      if (last && row.generatedAt < last)
        pushError(errors, `${base}.generatedAt`, "entries 疑似未按时间升序排列");
      last = row.generatedAt;
    }

    const mustNums: Array<[string, unknown]> = [
      ["durationMs", row.durationMs],
      ["totalSources", row.totalSources],
      ["okSources", row.okSources],
      ["errSources", row.errSources],
      ["totalItems", row.totalItems],
      ["totalNewItems", row.totalNewItems],
      ["flakySources", row.flakySources],
      ["staleSources", row.staleSources],
      ["parseEmpty", row.parseEmpty],
      ["parseDrop", row.parseDrop]
    ];
    for (const [k, v] of mustNums) {
      if (toNumber(v) == null) pushError(errors, `${base}.${k}`, `${k} 缺失或不是数字`);
    }
  }
}

async function main() {
  const log = createLogger();
  const root = process.cwd();

  const srcPosts = resolve(root, "src", "data", "generated", "posts.json");
  const srcStatus = resolve(root, "src", "data", "generated", "status.json");
  const srcStatusHistory = resolve(root, "src", "data", "generated", "status-history.v1.json");
  const srcSearchPack = resolve(root, "src", "data", "generated", "search-pack.v1.json");
  const srcSearchPackV2 = resolve(root, "src", "data", "generated", "search-pack.v2.json");
  const publicPosts = resolve(root, "public", "data", "posts.json");
  const publicStatus = resolve(root, "public", "data", "status.json");
  const publicStatusHistory = resolve(root, "public", "data", "status-history.v1.json");
  const publicSearchPack = resolve(root, "public", "data", "search-pack.v1.json");
  const publicSearchPackV2 = resolve(root, "public", "data", "search-pack.v2.json");

  const mustExist = [
    srcPosts,
    srcStatus,
    srcStatusHistory,
    srcSearchPack,
    srcSearchPackV2,
    publicPosts,
    publicStatus,
    publicStatusHistory,
    publicSearchPack,
    publicSearchPackV2
  ];
  const missing = mustExist.filter((p) => !existsSync(p));
  if (missing.length > 0) {
    const lines = ["[VALIDATE] 缺少生成文件：", ...missing.map((p) => `- ${p}`)];
    log.error(lines.join("\n"));
    process.exitCode = 1;
    return;
  }

  const errors: ValidationError[] = [];

  const postsJson = await readJsonFile<unknown>(srcPosts);
  const statusJson = await readJsonFile<unknown>(srcStatus);
  const statusHistoryJson = await readJsonFile<unknown>(srcStatusHistory);
  const searchPackJson = await readJsonFile<unknown>(srcSearchPack);
  const searchPackV2Json = await readJsonFile<unknown>(srcSearchPackV2);
  validatePosts(postsJson, errors);
  validateStatus(statusJson, errors);
  validateSearchPack(searchPackJson, errors);
  validateStatusHistory(statusHistoryJson, errors);
  validateSearchPackV2(searchPackV2Json, errors);

  // 额外一致性检查：public 与 src 侧条目数量应一致（不做深比较，避免成本过高）
  try {
    const pubPosts = await readJsonFile<unknown>(publicPosts);
    const a = Array.isArray(postsJson) ? postsJson.length : -1;
    const b = Array.isArray(pubPosts) ? pubPosts.length : -1;
    if (a >= 0 && b >= 0 && a !== b) {
      pushError(errors, "public/data/posts.json", `public posts 数量与 src 不一致: ${b} vs ${a}`);
    }
  } catch {
    pushError(errors, "public/data/posts.json", "public posts.json 无法解析");
  }

  try {
    const pubStatus = await readJsonFile<unknown>(publicStatus);
    if (!pubStatus || typeof pubStatus !== "object") {
      pushError(errors, "public/data/status.json", "public status.json 不是对象");
    }
  } catch {
    pushError(errors, "public/data/status.json", "public status.json 无法解析");
  }

  try {
    const pubHistory = await readJsonFile<unknown>(publicStatusHistory);
    if (!pubHistory || typeof pubHistory !== "object") {
      pushError(errors, "public/data/status-history.v1.json", "public status-history.v1.json 不是对象");
    } else {
      const v = typeof (pubHistory as any).v === "number" ? (pubHistory as any).v : 0;
      if (v !== 1)
        pushError(errors, "public/data/status-history.v1.json", "public status-history 版本非法（应为 1）");
    }
  } catch {
    pushError(errors, "public/data/status-history.v1.json", "public status-history.v1.json 无法解析");
  }

  try {
    const pubPack = await readJsonFile<unknown>(publicSearchPack);
    if (!pubPack || typeof pubPack !== "object") {
      pushError(errors, "public/data/search-pack.v1.json", "public search pack 不是对象");
    } else {
      const a =
        searchPackJson && typeof searchPackJson === "object" && Array.isArray((searchPackJson as any).posts)
          ? (searchPackJson as any).posts.length
          : -1;
      const b = Array.isArray((pubPack as any).posts) ? (pubPack as any).posts.length : -1;
      if (a >= 0 && b >= 0 && a !== b) {
        pushError(
          errors,
          "public/data/search-pack.v1.json",
          `public search pack posts 数量与 src 不一致: ${b} vs ${a}`
        );
      }
    }
  } catch {
    pushError(errors, "public/data/search-pack.v1.json", "public search pack 无法解析");
  }

  try {
    const pubPack = await readJsonFile<unknown>(publicSearchPackV2);
    if (!pubPack || typeof pubPack !== "object") {
      pushError(errors, "public/data/search-pack.v2.json", "public search pack v2 不是对象");
    } else {
      const a =
        searchPackV2Json &&
        typeof searchPackV2Json === "object" &&
        Array.isArray((searchPackV2Json as any).posts)
          ? (searchPackV2Json as any).posts.length
          : -1;
      const b = Array.isArray((pubPack as any).posts) ? (pubPack as any).posts.length : -1;
      if (a >= 0 && b >= 0 && a !== b) {
        pushError(
          errors,
          "public/data/search-pack.v2.json",
          `public search pack v2 posts 数量与 src 不一致: ${b} vs ${a}`
        );
      }
    }
  } catch {
    pushError(errors, "public/data/search-pack.v2.json", "public search pack v2 无法解析");
  }

  if (errors.length > 0) {
    const lines: string[] = [];
    lines.push(`[VALIDATE] 失败：共 ${errors.length} 个问题`);
    for (const e of errors.slice(0, 60)) lines.push(`- ${e.path}: ${e.message}`);
    if (errors.length > 60) lines.push(`- ... 以及其他 ${errors.length - 60} 个问题`);
    log.error(lines.join("\n"));
    process.exitCode = 1;
    return;
  }

  const count = Array.isArray(postsJson) ? postsJson.length : 0;
  log.info(`[VALIDATE] OK posts=${count} sources=${SOURCE_CONFIGS.length}`);
}

main().catch((err) => {
  const log = createLogger();
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  log.error(msg);
  process.exitCode = 1;
});
