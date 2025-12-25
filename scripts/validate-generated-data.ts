import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
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
    if (!isNonEmptyString(p.url) || !isHttpUrl(p.url)) pushError(errors, `${base}.url`, "url 缺失或不是 http(s)");

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

    if (!isNonEmptyString(p.category) || !isCategory(p.category)) pushError(errors, `${base}.category`, "category 缺失或非法");

    if (!Array.isArray(p.tags) || !p.tags.every((x: unknown) => typeof x === "string")) {
      pushError(errors, `${base}.tags`, "tags 缺失或不是 string[]");
    }

    if (!isNonEmptyString(p.sourceId)) pushError(errors, `${base}.sourceId`, "sourceId 缺失或为空");
    else if (!allowedSources.has(p.sourceId)) pushError(errors, `${base}.sourceId`, `未知来源: ${p.sourceId}`);

    if (!isNonEmptyString(p.sourceName)) pushError(errors, `${base}.sourceName`, "sourceName 缺失或为空");
    if (!isNonEmptyString(p.sourceUrl) || !isHttpUrl(p.sourceUrl)) pushError(errors, `${base}.sourceUrl`, "sourceUrl 缺失或不是 http(s)");

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
  if (s.generatedAt != null && !isNonEmptyString(s.generatedAt)) pushError(errors, "status.generatedAt", "generatedAt 类型非法");
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
    if (!isNonEmptyString(it.url) || !isHttpUrl(it.url)) pushError(errors, `${base}.url`, "url 缺失或不是 http(s)");

    if (typeof it.ok !== "boolean") pushError(errors, `${base}.ok`, "ok 缺失或不是 boolean");
    if (toNumber(it.itemCount) == null) pushError(errors, `${base}.itemCount`, "itemCount 缺失或不是数字");
    if (toNumber(it.durationMs) == null) pushError(errors, `${base}.durationMs`, "durationMs 缺失或不是数字");

    const usedOk = it.used === "fetched" || it.used === "cached" || it.used === "fallback";
    if (!usedOk) pushError(errors, `${base}.used`, "used 非法（应为 fetched/cached/fallback）");

    if (it.httpStatus != null && toNumber(it.httpStatus) == null) pushError(errors, `${base}.httpStatus`, "httpStatus 不是数字");
    if (it.error != null && !isNonEmptyString(it.error)) pushError(errors, `${base}.error`, "error 类型非法");
  }

  for (const id of configured) {
    if (!seen.has(id)) pushError(errors, "status.sources", `缺少来源状态: ${id}`);
  }
}

async function main() {
  const root = process.cwd();

  const srcPosts = resolve(root, "src", "data", "generated", "posts.json");
  const srcStatus = resolve(root, "src", "data", "generated", "status.json");
  const publicPosts = resolve(root, "public", "data", "posts.json");
  const publicStatus = resolve(root, "public", "data", "status.json");

  const mustExist = [srcPosts, srcStatus, publicPosts, publicStatus];
  const missing = mustExist.filter((p) => !existsSync(p));
  if (missing.length > 0) {
    console.error("[VALIDATE] 缺少生成文件：");
    for (const p of missing) console.error(`- ${p}`);
    process.exitCode = 1;
    return;
  }

  const errors: ValidationError[] = [];

  const postsJson = await readJsonFile<unknown>(srcPosts);
  const statusJson = await readJsonFile<unknown>(srcStatus);
  validatePosts(postsJson, errors);
  validateStatus(statusJson, errors);

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

  if (errors.length > 0) {
    console.error(`[VALIDATE] 失败：共 ${errors.length} 个问题`);
    for (const e of errors.slice(0, 60)) console.error(`- ${e.path}: ${e.message}`);
    if (errors.length > 60) console.error(`- ... 以及其他 ${errors.length - 60} 个问题`);
    process.exitCode = 1;
    return;
  }

  const count = Array.isArray(postsJson) ? postsJson.length : 0;
  console.log(`[VALIDATE] OK posts=${count} sources=${SOURCE_CONFIGS.length}`);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(msg);
  process.exitCode = 1;
});
