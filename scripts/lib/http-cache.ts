import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

export type HttpCacheEntry = {
  etag?: string;
  lastModified?: string;
  lastOkAt?: string;
  /** 文章页补图：最近一次“未能解析出封面”的时间（用于避免每小时重复轰炸同一页面） */
  coverMissAt?: string;
  /** 文章页补图：最近一次“成功解析封面”的时间 */
  coverOkAt?: string;
  /** 文章页预览：最近一次“未能解析出可用预览”的时间 */
  previewMissAt?: string;
  /** 文章页预览：最近一次“成功解析预览”的时间 */
  previewOkAt?: string;
};

export type HttpCache = Record<string, HttpCacheEntry>;

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (ACG-FeedBot/0.1; +https://github.com/TUR1412/ACG)";

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const raw = JSON.stringify(data, null, 2) + "\n";
  await writeFile(filePath, raw, "utf-8");
}

export function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

export function stripAndTruncate(text: string, maxLen: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLen) return compact;
  return compact.slice(0, Math.max(0, maxLen - 1)).trimEnd() + "…";
}

export type FetchResult =
  | { ok: true; status: number; text: string; fromCache: false; headers: Headers }
  | { ok: true; status: 304; text: ""; fromCache: true; headers: Headers }
  | { ok: false; status?: number; error: string };

export async function fetchTextWithCache(params: {
  url: string;
  cache: HttpCache;
  cachePath: string;
  timeoutMs: number;
  verbose: boolean;
  force?: boolean;
  persistCache?: boolean;
}): Promise<FetchResult> {
  const { url, cache, cachePath, timeoutMs, verbose } = params;
  const force = params.force ?? false;
  const persistCache = params.persistCache ?? true;
  const entry = cache[url] ?? {};

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      "user-agent": DEFAULT_USER_AGENT,
      "accept-language": "ja,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    };
    if (!force) {
      if (entry.etag) headers["if-none-match"] = entry.etag;
      if (entry.lastModified) headers["if-modified-since"] = entry.lastModified;
    }

    const res = await fetch(url, { headers, signal: controller.signal, redirect: "follow" });
    if (res.status === 304) {
      if (verbose) console.log(`[304] ${url}`);
      return { ok: true, status: 304 as const, text: "", fromCache: true, headers: res.headers };
    }

    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }

    const text = await res.text();
    const next: HttpCacheEntry = {
      etag: res.headers.get("etag") ?? entry.etag,
      lastModified: res.headers.get("last-modified") ?? entry.lastModified,
      lastOkAt: new Date().toISOString()
    };
    cache[url] = next;
    if (persistCache) await writeJsonFile(cachePath, cache);
    return { ok: true, status: res.status, text, fromCache: false, headers: res.headers };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export function cacheFilePath(rootDir: string): string {
  return join(rootDir, ".cache", "http.json");
}
