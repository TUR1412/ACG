import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { envNonNegativeInt } from "../lib/env";
import { createLogger } from "../lib/logger";
import { fetchTextWithCache, stripAndTruncate, writeJsonFile, type HttpCache } from "../lib/http-cache";
import { extractCoverFromHtml, extractPreviewFromHtml, isProbablyNonCoverImageUrl } from "../lib/html";
import type { Post } from "../../src/lib/types";
import { pool } from "./concurrency";

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function contentTypeToExt(contentType: string | null): string | null {
  if (!contentType) return null;
  const ct = contentType.toLowerCase();
  if (ct.includes("image/webp")) return "webp";
  if (ct.includes("image/avif")) return "avif";
  if (ct.includes("image/png")) return "png";
  if (ct.includes("image/gif")) return "gif";
  if (ct.includes("image/svg+xml")) return "svg";
  if (ct.includes("image/jpeg")) return "jpg";
  return null;
}

function toWeservThumbUrl(params: { url: string; width: number; host: string }): string {
  const { url, width, host } = params;
  const encoded = encodeURIComponent(url);
  // output=webp：显著减小体积；fit=cover：保持“杂志封面”观感统一
  return `https://${host}/?url=${encoded}&w=${width}&fit=cover&n=-1&output=webp`;
}

async function fetchBytes(params: {
  url: string;
  timeoutMs: number;
  headers?: Record<string, string>;
}): Promise<
  | { ok: true; status: number; bytes: Buffer; contentType: string | null }
  | { ok: false; status: number; error: string }
> {
  const { url, timeoutMs, headers } = params;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    const contentType = res.headers.get("content-type");
    const ab = await res.arrayBuffer();
    const bytes = Buffer.from(ab);
    return { ok: true, status: res.status, bytes, contentType };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, error: message };
  } finally {
    clearTimeout(timer);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function cacheCoverThumbnails(params: {
  posts: Post[];
  root: string;
  verbose: boolean;
}): Promise<{ attempted: number; cached: number; max: number }> {
  const { posts, root, verbose } = params;
  const log = createLogger({ verbose });

  // 目标：让“首页/最近”尽量都能稳定显示封面（不依赖热链），同时控制体积与抓取压力。
  const max = envNonNegativeInt("ACG_COVER_CACHE_MAX", 260);
  const width = envNonNegativeInt("ACG_COVER_CACHE_WIDTH", 960);
  const timeoutMs = envNonNegativeInt("ACG_COVER_CACHE_TIMEOUT_MS", 20_000);
  const maxBytes = envNonNegativeInt("ACG_COVER_CACHE_MAX_BYTES", 2_800_000);
  const concurrency = envNonNegativeInt("ACG_COVER_CACHE_CONCURRENCY", 6);

  const outDir = resolve(root, "public", "covers");

  // ⚠️ 关键：历史数据会从已部署站点回读并合并。
  // 上一次部署里如果把 cover 写成了本地路径（/covers/...），本次 Actions 的工作目录里并没有这些文件。
  // 为避免“posts.json 指向不存在的本地文件”，这里先把旧的本地 cover 还原回原图，再按本次缓存结果重新写回。
  for (const p of posts) {
    if (!p.cover || typeof p.cover !== "string") continue;
    if (!p.cover.startsWith("/covers/")) continue;
    const localPath = resolve(outDir, p.cover.slice("/covers/".length));
    if (existsSync(localPath)) continue;
    p.cover = p.coverOriginal && isHttpUrl(p.coverOriginal) ? p.coverOriginal : undefined;
  }

  if (max <= 0) return { attempted: 0, cached: 0, max };

  await mkdir(outDir, { recursive: true });

  const candidates = posts
    .filter((p) => typeof p.cover === "string" && isHttpUrl(p.cover))
    .slice()
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, max);

  let attempted = 0;
  let cached = 0;

  const commonHeaders = {
    accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "user-agent": "Mozilla/5.0 (ACG-FeedBot/0.1; +https://github.com/TUR1412/ACG)"
  };

  const knownExts = ["webp", "avif", "jpg", "png", "gif", "svg"] as const;

  await pool(candidates, concurrency, async (post) => {
    const original = post.cover;
    if (!original) return;
    attempted += 1;

    // 复用本地已有文件（本地开发多次 sync 时可省流量）
    for (const ext of knownExts) {
      const existingPath = resolve(outDir, `${post.id}.${ext}`);
      if (!existsSync(existingPath)) continue;
      post.coverOriginal = post.coverOriginal ?? original;
      post.cover = `/covers/${post.id}.${ext}`;
      cached += 1;
      return;
    }

    const tries: { kind: "proxy" | "direct"; url: string }[] = [
      { kind: "proxy", url: toWeservThumbUrl({ url: original, width, host: "images.weserv.nl" }) },
      { kind: "proxy", url: toWeservThumbUrl({ url: original, width, host: "wsrv.nl" }) }
    ];

    if (original.startsWith("http://")) {
      tries.push({ kind: "direct", url: `https://${original.slice("http://".length)}` });
    }
    tries.push({ kind: "direct", url: original });

    for (const attempt of tries) {
      const res = await fetchBytes({
        url: attempt.url,
        timeoutMs,
        headers: attempt.kind === "direct" ? { ...commonHeaders, referer: post.url } : commonHeaders
      });
      if (!res.ok) {
        log.debug(`[COVER:CACHE:ERR] ${post.sourceId} ${post.id} ${attempt.kind} ${res.error}`);
        continue;
      }

      const ext = contentTypeToExt(res.contentType);
      if (!ext) {
        log.debug(`[COVER:CACHE:SKIP] ${post.sourceId} ${post.id} non-image ${res.contentType ?? "-"}`);
        continue;
      }
      if (res.bytes.length <= 0 || res.bytes.length > maxBytes) {
        log.debug(`[COVER:CACHE:SKIP] ${post.sourceId} ${post.id} bytes=${res.bytes.length}`);
        continue;
      }

      const outPath = resolve(outDir, `${post.id}.${ext}`);
      await writeFile(outPath, res.bytes);
      post.coverOriginal = post.coverOriginal ?? original;
      post.cover = `/covers/${post.id}.${ext}`;
      cached += 1;
      log.debug(`[COVER:CACHE:OK] ${post.sourceId} ${post.id} -> ${post.cover}`);
      return;
    }

    log.debug(`[COVER:CACHE:MISS] ${post.sourceId} ${post.id}`);
  });

  return { attempted, cached, max };
}

export async function enrichCoversFromArticlePages(params: {
  posts: Post[];
  cache: HttpCache;
  cachePath: string;
  verbose: boolean;
  persistCache: boolean;
}): Promise<{ attempted: number; enriched: number; maxTotal: number }> {
  const { posts, cache, cachePath, verbose, persistCache } = params;
  const log = createLogger({ verbose });

  // 偏激进默认值：优先让“最新可见内容”尽量都有封面。
  // 仍可通过环境变量一键调回保守/关闭（设为 0）。
  const maxTotal = envNonNegativeInt("ACG_COVER_ENRICH_MAX", 320);
  const maxPerSource = envNonNegativeInt("ACG_COVER_ENRICH_PER_SOURCE_MAX", 200);
  const delayMs = envNonNegativeInt("ACG_COVER_ENRICH_DELAY_MS", 0);
  const missTtlHours = envNonNegativeInt("ACG_COVER_ENRICH_MISS_TTL_HOURS", 72);
  const missTtlMs = missTtlHours * 60 * 60 * 1000;

  // 预览策略：只要摘要缺失或过短，就尝试从文章页抓取 og:description / meta description / 首段落。
  const previewMinLen = envNonNegativeInt("ACG_PREVIEW_MIN_LEN", 90);
  const previewMaxLen = envNonNegativeInt("ACG_PREVIEW_MAX_LEN", 420);
  const previewMissTtlHours = envNonNegativeInt("ACG_PREVIEW_MISS_TTL_HOURS", 24);
  const previewMissTtlMs = previewMissTtlHours * 60 * 60 * 1000;

  const candidates = posts
    .filter((p) => {
      const wantCover = !p.cover || isProbablyNonCoverImageUrl(p.cover);
      const wantPreview = !p.preview && (!p.summary || p.summary.length < previewMinLen);
      return wantCover || wantPreview;
    })
    .slice()
    .sort((a, b) => {
      const aWantCover = !a.cover || (a.cover ? isProbablyNonCoverImageUrl(a.cover) : false);
      const bWantCover = !b.cover || (b.cover ? isProbablyNonCoverImageUrl(b.cover) : false);
      if (aWantCover !== bWantCover) return aWantCover ? -1 : 1;
      const at = new Date(a.publishedAt).getTime();
      const bt = new Date(b.publishedAt).getTime();
      if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return bt - at;
      return b.publishedAt.localeCompare(a.publishedAt);
    });

  const perSource = new Map<string, number>();
  let attempted = 0;
  let enriched = 0;

  for (const post of candidates) {
    if (maxTotal <= 0) break;
    if (attempted >= maxTotal) break;
    const used = perSource.get(post.sourceId) ?? 0;
    if (used >= maxPerSource) continue;

    const wantCover = !post.cover || (post.cover ? isProbablyNonCoverImageUrl(post.cover) : false);
    const wantPreview = !post.preview && (!post.summary || post.summary.length < previewMinLen);

    const entry = cache[post.url] ?? {};
    const coverMissAt = entry.coverMissAt;
    const previewMissAt = entry.previewMissAt;

    const coverRecentMiss = (() => {
      if (!wantCover) return false;
      if (missTtlMs <= 0) return false;
      if (!coverMissAt) return false;
      const age = Date.now() - new Date(coverMissAt).getTime();
      return Number.isFinite(age) && age >= 0 && age < missTtlMs;
    })();

    const previewRecentMiss = (() => {
      if (!wantPreview) return false;
      if (previewMissTtlMs <= 0) return false;
      if (!previewMissAt) return false;
      const age = Date.now() - new Date(previewMissAt).getTime();
      return Number.isFinite(age) && age >= 0 && age < previewMissTtlMs;
    })();

    // 如果当前“需要做的事情”都在 TTL 内刚失败过，就跳过，避免每小时轰炸同一页面。
    if ((wantCover ? coverRecentMiss : true) && (wantPreview ? previewRecentMiss : true)) {
      log.debug(`[ENRICH:SKIP] ${post.sourceId} ${post.url} recent-miss`);
      continue;
    }

    perSource.set(post.sourceId, used + 1);
    attempted += 1;

    if (delayMs > 0) await sleep(delayMs);

    const res = await fetchTextWithCache({
      url: post.url,
      cache,
      cachePath,
      timeoutMs: 25_000,
      verbose,
      force: true,
      persistCache
    });

    if (!res.ok) {
      log.debug(`[ENRICH:ERR] ${post.sourceId} ${post.url} ${res.error}`);
      continue;
    }

    // cover：尽量补齐 og:image / twitter:image
    if (wantCover) {
      const cover = extractCoverFromHtml({ html: res.text, baseUrl: post.url });
      if (!cover) {
        log.debug(`[COVER:MISS] ${post.sourceId} ${post.url}`);
        const next = cache[post.url] ?? {};
        next.coverMissAt = new Date().toISOString();
        cache[post.url] = next;
        if (persistCache) await writeJsonFile(cachePath, cache);
      } else {
        post.cover = cover;
        enriched += 1;
        log.debug(`[COVER:OK] ${post.sourceId} ${post.url}`);

        const next = cache[post.url] ?? {};
        next.coverOkAt = new Date().toISOString();
        if (next.coverMissAt) delete next.coverMissAt;
        cache[post.url] = next;
        if (persistCache) await writeJsonFile(cachePath, cache);
      }
    }

    // preview：尽量补齐 og:description / meta description / 首段落（严格截断，不是全文）
    if (wantPreview) {
      const preview = extractPreviewFromHtml({ html: res.text, baseUrl: post.url, maxLen: previewMaxLen });
      if (!preview) {
        log.debug(`[PREVIEW:MISS] ${post.sourceId} ${post.url}`);
        const next = cache[post.url] ?? {};
        next.previewMissAt = new Date().toISOString();
        cache[post.url] = next;
        if (persistCache) await writeJsonFile(cachePath, cache);
      } else {
        post.preview = stripAndTruncate(preview, previewMaxLen);
        log.debug(`[PREVIEW:OK] ${post.sourceId} ${post.url}`);

        const next = cache[post.url] ?? {};
        next.previewOkAt = new Date().toISOString();
        if (next.previewMissAt) delete next.previewMissAt;
        cache[post.url] = next;
        if (persistCache) await writeJsonFile(cachePath, cache);
      }
    }
  }

  return { attempted, enriched, maxTotal };
}
