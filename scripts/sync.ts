import { dirname, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { parseSourceToItems, SOURCES } from "./sources/index";
import { parseArgs } from "./lib/args";
import {
  cacheFilePath,
  fetchTextWithCache,
  normalizeUrl,
  readJsonFile,
  sha1,
  stripAndTruncate,
  writeJsonFile,
  type HttpCache
} from "./lib/http-cache";
import { extractCoverFromHtml, extractPreviewFromHtml, isProbablyNonCoverImageUrl } from "./lib/html";
import type { Source } from "./sources/types";
import type { SourceLang } from "../src/lib/source-config";
import type { Post, SourceStatus, StatusHistoryEntry, StatusHistoryV1, SyncStatus } from "../src/lib/types";
import { buildSearchPack, buildSearchPackV2 } from "../src/lib/search/pack";
import { deriveTags } from "./lib/tagger";
import { readTranslateCache, translateTextCached, type TranslateCache } from "./lib/translate";

function hasJapaneseKana(text: string): boolean {
  // Hiragana + Katakana。仅靠汉字无法区分中/日，所以用 kana 作为“强证据”。     
  return /[\u3041-\u30ff]/.test(text);
}

async function translatePosts(params: {
  posts: Post[];
  cache: TranslateCache;
  cachePath: string;
  verbose: boolean;
  persistCache: boolean;
}): Promise<{ translated: number; attempted: number }> {
  const { posts, cache, cachePath, verbose, persistCache } = params;

  const timeoutMs = parseNonNegativeInt(process.env.ACG_TRANSLATE_TIMEOUT_MS, 18_000);
  const maxPosts = parseNonNegativeInt(process.env.ACG_TRANSLATE_MAX_POSTS, 220);

  const sourceLangById = new Map<string, SourceLang>();
  for (const s of SOURCES) sourceLangById.set(s.id, s.lang ?? "unknown");

  const needsTranslate = (post: Post): boolean => {
    const sourceLang = sourceLangById.get(post.sourceId) ?? "unknown";
    const shouldTranslateToZh = sourceLang !== "zh";
    const shouldTranslateToJa = sourceLang !== "ja";

    if (post.title) {
      if (shouldTranslateToZh && !post.titleZh) return true;
      if (shouldTranslateToJa && !post.titleJa && !hasJapaneseKana(post.title)) return true;
    }

    if (post.summary) {
      if (shouldTranslateToZh && !post.summaryZh) return true;
      if (shouldTranslateToJa && !post.summaryJa && !hasJapaneseKana(post.summary)) return true;
    }

    if (post.preview) {
      if (shouldTranslateToZh && !post.previewZh) return true;
      if (shouldTranslateToJa && !post.previewJa && !hasJapaneseKana(post.preview)) return true;
    }

    return false;
  };

  const candidates = posts.filter(needsTranslate);
  const limit = Math.min(Math.max(0, maxPosts), candidates.length);
  const targets = candidates.slice(0, limit);
  let attempted = 0;
  let translated = 0;

  for (const post of targets) {
    const sourceLang = sourceLangById.get(post.sourceId) ?? "unknown";
    const shouldTranslateToZh = sourceLang !== "zh";
    const shouldTranslateToJa = sourceLang !== "ja";

    // 标题
    if (post.title) {
      if (shouldTranslateToZh && !post.titleZh) {
        attempted += 1;
        const nextZh = await translateTextCached({
          text: post.title,
          target: "zh",
          cache,
          cachePath,
          timeoutMs,
          verbose,
          persistCache
        });
        if (nextZh && nextZh !== post.title) {
          post.titleZh = stripAndTruncate(nextZh, 180);
          translated += 1;
        }
      }
 
      // 日文：如果原文已经明显是日文（含 kana），就不“翻译回日文”（避免破坏原标题）
      if (shouldTranslateToJa && !post.titleJa && !hasJapaneseKana(post.title)) {
        attempted += 1;
        const nextJa = await translateTextCached({
          text: post.title,
          target: "ja",
          cache,
          cachePath,
          timeoutMs,
          verbose,
          persistCache
        });
        if (nextJa && nextJa !== post.title) {
          post.titleJa = stripAndTruncate(nextJa, 180);
          translated += 1;
        }
      }
    }

    // 摘要/预览：分别翻译（UI 会按需挑一个展示）
    if (post.summary) {
      if (shouldTranslateToZh && !post.summaryZh) {
        attempted += 1;
        const nextZh = await translateTextCached({
          text: post.summary,
          target: "zh",
          cache,
          cachePath,
          timeoutMs,
          verbose,
          persistCache
        });
        if (nextZh && nextZh !== post.summary) {
          post.summaryZh = stripAndTruncate(nextZh, 420);
          translated += 1;
        }
      }
 
      if (shouldTranslateToJa && !post.summaryJa && !hasJapaneseKana(post.summary)) {
        attempted += 1;
        const nextJa = await translateTextCached({
          text: post.summary,
          target: "ja",
          cache,
          cachePath,
          timeoutMs,
          verbose,
          persistCache
        });
        if (nextJa && nextJa !== post.summary) {
          post.summaryJa = stripAndTruncate(nextJa, 420);
          translated += 1;
        }
      }
    }

    if (post.preview) {
      if (shouldTranslateToZh && !post.previewZh) {
        attempted += 1;
        const nextZh = await translateTextCached({
          text: post.preview,
          target: "zh",
          cache,
          cachePath,
          timeoutMs,
          verbose,
          persistCache
        });
        if (nextZh && nextZh !== post.preview) {
          post.previewZh = stripAndTruncate(nextZh, 520);
          translated += 1;
        }
      }

      if (shouldTranslateToJa && !post.previewJa && !hasJapaneseKana(post.preview)) {
        attempted += 1;
        const nextJa = await translateTextCached({
          text: post.preview,
          target: "ja",
          cache,
          cachePath,
          timeoutMs,
          verbose,
          persistCache
        });
        if (nextJa && nextJa !== post.preview) {
          post.previewJa = stripAndTruncate(nextJa, 520);
          translated += 1;
        }
      }
    }
  }

  return { translated, attempted };
}

function groupBySource(posts: Post[]): Map<string, Post[]> {
  const map = new Map<string, Post[]>();
  for (const p of posts) {
    const list = map.get(p.sourceId) ?? [];
    list.push(p);
    map.set(p.sourceId, list);
  }
  return map;
}

async function runSource(params: {
  source: Source;
  cache: HttpCache;
  cachePath: string;
  previousBySource: Map<string, Post[]>;
  verbose: boolean;
  persistCache: boolean;
}): Promise<{ posts: Post[]; status: SourceStatus }> {
  const { source, cache, cachePath, previousBySource, verbose, persistCache } = params;
  const start = Date.now();

  const previous = previousBySource.get(source.id) ?? [];

  let res = await fetchTextWithCache({
    url: source.url,
    cache,
    cachePath,
    timeoutMs: 25_000,
    verbose,
    persistCache
  });

  if (res.ok && res.status === 304 && previous.length === 0) {
    // 如果本地没有历史数据但拿到 304，就会导致“空仓库永远为空”的死循环。
    // 这里直接强制再拉一次，确保每次运行都能自洽产出数据。
    res = await fetchTextWithCache({
        url: source.url,
        cache,
        cachePath,
        timeoutMs: 25_000,
        verbose,
        force: true,
        persistCache
      });
  }

  if (res.ok && res.status === 304) {
    return {
      posts: previous,
      status: {
        id: source.id,
        name: source.name,
        kind: source.kind,
        url: source.url,
        ok: true,
        httpStatus: 304,
        durationMs: Date.now() - start,
        fetchedAt: new Date().toISOString(),
        itemCount: previous.length,
        newItemCount: 0,
        used: "cached",
        attempts: res.attempts,
        waitMs: res.waitMs
      }
    };
  }

  if (!res.ok) {
    return {
      posts: previous,
      status: {
        id: source.id,
        name: source.name,
        kind: source.kind,
        url: source.url,
        ok: false,
        httpStatus: res.status,
        durationMs: Date.now() - start,
        fetchedAt: new Date().toISOString(),
        itemCount: previous.length,
        newItemCount: 0,
        used: "fallback",
        attempts: res.attempts,
        waitMs: res.waitMs,
        error: res.error
      }
    };
  }

  let rawItems: ReturnType<typeof parseSourceToItems> = [];
  try {
    rawItems = parseSourceToItems({ source, text: res.text });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      posts: previous,
      status: {
        id: source.id,
        name: source.name,
        kind: source.kind,
        url: source.url,
        ok: false,
        httpStatus: res.status,
        durationMs: Date.now() - start,
        fetchedAt: new Date().toISOString(),
        itemCount: previous.length,
        newItemCount: 0,
        used: "fallback",
        attempts: res.attempts,
        waitMs: res.waitMs,
        rawItemCount: 0,
        filteredItemCount: 0,
        error: message || "parse_error"
      }
    };
  }

  // 解析输出为空：大概率是来源结构变化/解析器失效。保守回退到上一轮数据以避免静默停更。
  if (rawItems.length === 0) {
    return {
      posts: previous,
      status: {
        id: source.id,
        name: source.name,
        kind: source.kind,
        url: source.url,
        ok: false,
        httpStatus: res.status,
        durationMs: Date.now() - start,
        fetchedAt: new Date().toISOString(),
        itemCount: previous.length,
        newItemCount: 0,
        used: "fallback",
        attempts: res.attempts,
        waitMs: res.waitMs,
        rawItemCount: 0,
        filteredItemCount: 0,
        error: "parse_empty"
      }
    };
  }

  const filtered = source.include
    ? rawItems.filter((it) => source.include?.({ title: it.title, summary: it.summary, url: it.url }))
    : rawItems;

  const posts: Post[] = filtered.map((it) => {
    const url = normalizeUrl(it.url);
    const id = sha1(url);
    const title = stripAndTruncate(it.title, 180);
    // summary 是“资讯预览”的核心之一：列表页会被 line-clamp 截断，详情页可完整展示（仍然是短摘要，不是全文）。
    const summary = it.summary ? stripAndTruncate(it.summary, 360) : undefined;
    const tags = deriveTags({ title, summary, category: source.category });
    return {
      id,
      title,
      summary,
      url,
      publishedAt: it.publishedAt,
      cover: it.cover,
      category: source.category,
      tags,
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.homepage ?? source.url
    };
  });

  // 解析结果“异常缩水”：可能是来源结构变更/反爬命中/被错误 HTML 污染。
  // 保守策略：当历史足够多且本次明显变少时，回退上一轮数据，避免静默停更。
  const dropMinPrev = parseNonNegativeInt(process.env.ACG_PARSE_DROP_MIN_PREV, 12);
  const dropMinKeep = parseNonNegativeInt(process.env.ACG_PARSE_DROP_MIN_KEEP, 3);
  const dropRatio = (() => {
    const raw = process.env.ACG_PARSE_DROP_RATIO;
    const parsed = raw == null ? NaN : Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 1) return 0.15;
    return parsed;
  })();

  const suspiciousDrop =
    previous.length >= dropMinPrev &&
    rawItems.length < Math.max(dropMinKeep, Math.floor(previous.length * dropRatio));
  if (suspiciousDrop) {
    return {
      posts: previous,
      status: {
        id: source.id,
        name: source.name,
        kind: source.kind,
        url: source.url,
        ok: false,
        httpStatus: res.status,
        durationMs: Date.now() - start,
        fetchedAt: new Date().toISOString(),
        itemCount: previous.length,
        newItemCount: 0,
        used: "fallback",
        attempts: res.attempts,
        waitMs: res.waitMs,
        rawItemCount: rawItems.length,
        filteredItemCount: filtered.length,
        error: "parse_drop"
      }
    };
  }

  return {
    posts,
    status: {
      id: source.id,
      name: source.name,
      kind: source.kind,
      url: source.url,
      ok: true,
      httpStatus: res.status,
      durationMs: Date.now() - start,
      fetchedAt: new Date().toISOString(),
      itemCount: posts.length,
      newItemCount: (() => {
        const prevIds = new Set(previous.map((p) => p.id));
        return posts.reduce((sum, p) => sum + (prevIds.has(p.id) ? 0 : 1), 0);
      })(),
      used: "fetched",
      attempts: res.attempts,
      waitMs: res.waitMs,
      rawItemCount: rawItems.length,
      filteredItemCount: filtered.length
    }
  };
}

function dedupeAndSort(posts: Post[]): Post[] {
  const byUrl = new Map<string, Post>();
  for (const p of posts) {
    const key = p.url.toLowerCase();
    const existing = byUrl.get(key);
    if (!existing) {
      byUrl.set(key, p);
      continue;
    }
    const existingScore = (existing.summary?.length ?? 0) + (existing.cover ? 20 : 0);
    const nextScore = (p.summary?.length ?? 0) + (p.cover ? 20 : 0);
    byUrl.set(key, nextScore >= existingScore ? p : existing);
  }
  return [...byUrl.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function filterByDays(posts: Post[], days: number): Post[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return posts.filter((p) => {
    const time = new Date(p.publishedAt).getTime();
    return Number.isFinite(time) && time >= cutoff;
  });
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  if (value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

function normalizeStatusHistoryEntry(value: unknown): StatusHistoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const it = value as any;

  const generatedAt = typeof it.generatedAt === "string" ? it.generatedAt : "";
  if (!generatedAt) return null;

  const num = (v: unknown): number | null => {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };

  const durationMs = num(it.durationMs);
  const totalSources = num(it.totalSources);
  const okSources = num(it.okSources);
  const errSources = num(it.errSources);
  const totalItems = num(it.totalItems);
  const totalNewItems = num(it.totalNewItems);
  const flakySources = num(it.flakySources);
  const staleSources = num(it.staleSources);
  const parseEmpty = num(it.parseEmpty);
  const parseDrop = num(it.parseDrop);

  if (
    durationMs == null ||
    totalSources == null ||
    okSources == null ||
    errSources == null ||
    totalItems == null ||
    totalNewItems == null ||
    flakySources == null ||
    staleSources == null ||
    parseEmpty == null ||
    parseDrop == null
  ) {
    return null;
  }

  return {
    generatedAt,
    durationMs,
    totalSources,
    okSources,
    errSources,
    totalItems,
    totalNewItems,
    flakySources,
    staleSources,
    parseEmpty,
    parseDrop
  };
}

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

async function pool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  const max = Math.max(1, Math.min(concurrency, items.length));
  let index = 0;
  const runners = Array.from({ length: max }, async () => {
    while (true) {
      const i = index;
      index += 1;
      if (i >= items.length) return;
      await worker(items[i]);
    }
  });
  await Promise.all(runners);
}

async function cacheCoverThumbnails(params: {
  posts: Post[];
  root: string;
  verbose: boolean;
}): Promise<{ attempted: number; cached: number; max: number }> {
  const { posts, root, verbose } = params;

  // 目标：让“首页/最近”尽量都能稳定显示封面（不依赖热链），同时控制体积与抓取压力。
  const max = parseNonNegativeInt(process.env.ACG_COVER_CACHE_MAX, 260);
  const width = parseNonNegativeInt(process.env.ACG_COVER_CACHE_WIDTH, 960);
  const timeoutMs = parseNonNegativeInt(process.env.ACG_COVER_CACHE_TIMEOUT_MS, 20_000);
  const maxBytes = parseNonNegativeInt(process.env.ACG_COVER_CACHE_MAX_BYTES, 2_800_000);
  const concurrency = parseNonNegativeInt(process.env.ACG_COVER_CACHE_CONCURRENCY, 6);

  if (max <= 0) return { attempted: 0, cached: 0, max };

  const outDir = resolve(root, "public", "covers");
  await mkdir(outDir, { recursive: true });

  // ⚠️ 关键：历史数据会从已部署站点回读并合并。
  // 上一次部署里如果把 cover 写成了本地路径（/covers/...），本次 Actions 的工作目录里并没有这些文件。
  // 为避免“posts.json 指向不存在的本地文件”，这里先把旧的本地 cover 还原回原图，再按本次缓存结果重新写回。
  for (const p of posts) {
    if (!p.cover || typeof p.cover !== "string") continue;
    if (!p.cover.startsWith("/covers/")) continue;
    if (p.coverOriginal && isHttpUrl(p.coverOriginal)) {
      p.cover = p.coverOriginal;
    } else {
      p.cover = undefined;
    }
  }

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
        if (verbose) console.log(`[COVER:CACHE:ERR] ${post.sourceId} ${post.id} ${attempt.kind} ${res.error}`);
        continue;
      }

      const ext = contentTypeToExt(res.contentType);
      if (!ext) {
        if (verbose) console.log(`[COVER:CACHE:SKIP] ${post.sourceId} ${post.id} non-image ${res.contentType ?? "-"}`);
        continue;
      }
      if (res.bytes.length <= 0 || res.bytes.length > maxBytes) {
        if (verbose) console.log(`[COVER:CACHE:SKIP] ${post.sourceId} ${post.id} bytes=${res.bytes.length}`);
        continue;
      }

      const outPath = resolve(outDir, `${post.id}.${ext}`);
      await writeFile(outPath, res.bytes);
      post.coverOriginal = post.coverOriginal ?? original;
      post.cover = `/covers/${post.id}.${ext}`;
      cached += 1;
      if (verbose) console.log(`[COVER:CACHE:OK] ${post.sourceId} ${post.id} -> ${post.cover}`);
      return;
    }

    if (verbose) console.log(`[COVER:CACHE:MISS] ${post.sourceId} ${post.id}`);
  });

  return { attempted, cached, max };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enrichCoversFromArticlePages(params: {
  posts: Post[];
  cache: HttpCache;
  cachePath: string;
  verbose: boolean;
  persistCache: boolean;
}): Promise<{ attempted: number; enriched: number; maxTotal: number }> {
  const { posts, cache, cachePath, verbose, persistCache } = params;

  // 偏激进默认值：优先让“最新可见内容”尽量都有封面。
  // 仍可通过环境变量一键调回保守/关闭（设为 0）。
  const maxTotal = parseNonNegativeInt(process.env.ACG_COVER_ENRICH_MAX, 320);
  const maxPerSource = parseNonNegativeInt(process.env.ACG_COVER_ENRICH_PER_SOURCE_MAX, 200);
  const delayMs = parseNonNegativeInt(process.env.ACG_COVER_ENRICH_DELAY_MS, 0);
  const missTtlHours = parseNonNegativeInt(process.env.ACG_COVER_ENRICH_MISS_TTL_HOURS, 72);
  const missTtlMs = missTtlHours * 60 * 60 * 1000;

  // 预览策略：只要摘要缺失或过短，就尝试从文章页抓取 og:description / meta description / 首段落。
  const previewMinLen = parseNonNegativeInt(process.env.ACG_PREVIEW_MIN_LEN, 90);
  const previewMaxLen = parseNonNegativeInt(process.env.ACG_PREVIEW_MAX_LEN, 420);
  const previewMissTtlHours = parseNonNegativeInt(process.env.ACG_PREVIEW_MISS_TTL_HOURS, 24);
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
      if (verbose) console.log(`[ENRICH:SKIP] ${post.sourceId} ${post.url} recent-miss`);
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
      if (verbose) console.log(`[ENRICH:ERR] ${post.sourceId} ${post.url} ${res.error}`);
      continue;
    }

    // cover：尽量补齐 og:image / twitter:image
    if (wantCover) {
      const cover = extractCoverFromHtml({ html: res.text, baseUrl: post.url });
      if (!cover) {
        if (verbose) console.log(`[COVER:MISS] ${post.sourceId} ${post.url}`);
        const next = cache[post.url] ?? {};
        next.coverMissAt = new Date().toISOString();
        cache[post.url] = next;
        if (persistCache) await writeJsonFile(cachePath, cache);
      } else {
        post.cover = cover;
        enriched += 1;
        if (verbose) console.log(`[COVER:OK] ${post.sourceId} ${post.url}`);

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
        if (verbose) console.log(`[PREVIEW:MISS] ${post.sourceId} ${post.url}`);
        const next = cache[post.url] ?? {};
        next.previewMissAt = new Date().toISOString();
        cache[post.url] = next;
        if (persistCache) await writeJsonFile(cachePath, cache);
      } else {
        post.preview = stripAndTruncate(preview, previewMaxLen);
        if (verbose) console.log(`[PREVIEW:OK] ${post.sourceId} ${post.url}`);

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  const outPostsPath = resolve(root, "src", "data", "generated", "posts.json");
  const outStatusPath = resolve(root, "src", "data", "generated", "status.json");
  const outStatusHistoryPath = resolve(
    root,
    "src",
    "data",
    "generated",
    "status-history.v1.json"
  );
  const outSearchPackPath = resolve(root, "src", "data", "generated", "search-pack.v1.json");
  const outSearchPackV2Path = resolve(root, "src", "data", "generated", "search-pack.v2.json");
  const publicPostsPath = resolve(root, "public", "data", "posts.json");
  const publicStatusPath = resolve(root, "public", "data", "status.json");
  const publicStatusHistoryPath = resolve(
    root,
    "public",
    "data",
    "status-history.v1.json"
  );
  const publicSearchPackPath = resolve(root, "public", "data", "search-pack.v1.json");
  const publicSearchPackV2Path = resolve(root, "public", "data", "search-pack.v2.json");
  const cachePath = cacheFilePath(root);
  const translateCachePath = resolve(root, ".cache", "translate.json");

  const cache = await readJsonFile<HttpCache>(cachePath, {});
  const translateCache = await readTranslateCache(translateCachePath);

  // 历史数据策略：优先尝试从上一次 Pages 部署的 data/posts.json 读取（避免每小时提交刷屏）。
  // 若不存在（首次部署）则退回到仓库内的 src/data/generated/posts.json。
  const remotePostsUrl =
    process.env.ACG_REMOTE_POSTS_URL ?? "https://tur1412.github.io/ACG/data/posts.json";
  const previousLocal = await readJsonFile<Post[]>(outPostsPath, []);
  const previousRemote = await (async () => {
    try {
      const res = await fetch(`${remotePostsUrl}?t=${Date.now()}`, {
        headers: { "user-agent": "Mozilla/5.0 (ACG-FeedBot/0.1; +https://github.com/TUR1412/ACG)" }
      });
      if (!res.ok) return [] as Post[];
      const json = (await res.json()) as unknown;
      return Array.isArray(json) ? (json as Post[]) : [];
    } catch {
      return [] as Post[];
    }
  })();

  // 状态趋势：回读上一轮 status.json，用于计算连续失败等趋势字段（不阻断同步）。  
  const remoteStatusUrl =
    process.env.ACG_REMOTE_STATUS_URL ?? "https://tur1412.github.io/ACG/data/status.json";
  const previousRemoteStatus = await (async () => {
    try {
      const res = await fetch(`${remoteStatusUrl}?t=${Date.now()}`, {
        headers: { "user-agent": "Mozilla/5.0 (ACG-FeedBot/0.1; +https://github.com/TUR1412/ACG)" }
      });
      if (!res.ok) return null;
      const json = (await res.json()) as unknown;
      return json && typeof json === "object" ? (json as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  })();

  const previousStatusById = new Map<string, any>();
  try {
    const sources =
      previousRemoteStatus && Array.isArray((previousRemoteStatus as any).sources)
        ? ((previousRemoteStatus as any).sources as any[])
        : [];
    for (const it of sources) {
      const id = typeof it?.id === "string" ? it.id : "";
      if (id) previousStatusById.set(id, it);
    }
  } catch {
    // ignore
  }

  // status-history：回读上一轮趋势文件（用于连续可视化；不阻断同步）。
  const remoteStatusHistoryUrl =
    process.env.ACG_REMOTE_STATUS_HISTORY_URL ??
    "https://tur1412.github.io/ACG/data/status-history.v1.json";
  const previousRemoteStatusHistory = await (async () => {
    try {
      const res = await fetch(`${remoteStatusHistoryUrl}?t=${Date.now()}`, {
        headers: { "user-agent": "Mozilla/5.0 (ACG-FeedBot/0.1; +https://github.com/TUR1412/ACG)" }
      });
      if (!res.ok) return null;
      const json = (await res.json()) as unknown;
      if (
        json &&
        typeof json === "object" &&
        (json as any).v === 1 &&
        Array.isArray((json as any).entries)
      ) {
        return json as StatusHistoryV1;
      }
      return null;
    } catch {
      return null;
    }
  })();

  const allowed = new Set(SOURCES.map((s) => s.id));
  const previousPosts = (previousRemote.length > 0 ? previousRemote : previousLocal).filter((p) =>
    allowed.has(p.sourceId)
  );
  const previousBySource = groupBySource(previousPosts);

  const start = Date.now();
  const sourceStatuses: SourceStatus[] = [];
  const allPosts: Post[] = [...previousPosts];

  for (const source of SOURCES) {
    const { posts, status } = await runSource({
      source,
      cache,
      cachePath,
      previousBySource,
      verbose: args.verbose,
      persistCache: !args.dryRun
    });
    // 连续失败：依赖上一轮 remote status（若不可用则退化为 0/1）
    const prev = previousStatusById.get(source.id);
    const prevFails =
      typeof prev?.consecutiveFails === "number" && Number.isFinite(prev.consecutiveFails)
        ? prev.consecutiveFails
        : prev?.ok === false
          ? 1
          : 0;
    status.consecutiveFails = status.ok ? 0 : prevFails + 1;
    sourceStatuses.push(status);
    allPosts.push(...posts);
    console.log(
      `[${status.ok ? "OK" : "ERR"}] ${source.id} items=${status.itemCount} http=${status.httpStatus ?? "-"} used=${status.used}`
    );
  }

  const pruned = filterByDays(dedupeAndSort(allPosts), args.days).slice(0, args.limit);

  // 基于最终产物补齐“可见数量/最新发布时间”（用于状态页判断 stale）
  const visibleCountBySource = new Map<string, number>();
  const latestPublishedAtBySource = new Map<string, string>();
  for (const p of pruned) {
    visibleCountBySource.set(p.sourceId, (visibleCountBySource.get(p.sourceId) ?? 0) + 1);
    const prev = latestPublishedAtBySource.get(p.sourceId);
    if (!prev || p.publishedAt > prev) latestPublishedAtBySource.set(p.sourceId, p.publishedAt);
  }
  for (const s of sourceStatuses) {
    s.visibleItemCount = visibleCountBySource.get(s.id) ?? 0;
    const latest = latestPublishedAtBySource.get(s.id);
    if (latest) s.latestPublishedAt = latest;
  }

  if (!args.dryRun) {
    const { attempted, enriched, maxTotal } = await enrichCoversFromArticlePages({
      posts: pruned,
      cache,
      cachePath,
      verbose: args.verbose,
      persistCache: true
    });
    console.log(`[COVER] enriched=${enriched}/${attempted} max=${maxTotal}`);

    const cacheRes = await cacheCoverThumbnails({ posts: pruned, root, verbose: args.verbose });
    console.log(`[COVER:CACHE] cached=${cacheRes.cached}/${cacheRes.attempted} max=${cacheRes.max}`);

    // 语言转换：为 /zh 与 /ja 预生成标题/摘要翻译（避免用户在信息流里看不懂）
    const translateRes = await translatePosts({
      posts: pruned,
      cache: translateCache,
      cachePath: translateCachePath,
      verbose: args.verbose,
      persistCache: true
    });
    console.log(`[TRANSLATE] applied=${translateRes.translated}/${translateRes.attempted} maxPosts=${process.env.ACG_TRANSLATE_MAX_POSTS ?? "220"}`);
  } else {
    console.log(`[COVER] skipped (dry-run)`);
  }

  const generatedAt = new Date().toISOString();
  const status: SyncStatus = { generatedAt, durationMs: Date.now() - start, sources: sourceStatuses };

  if (args.dryRun) {
    console.log(`[DRY] posts=${pruned.length} sources=${sourceStatuses.length}`);
    return;
  }

  const writeJsonMinified = async (filePath: string, data: unknown) => {
    await mkdir(dirname(filePath), { recursive: true });
    const raw = JSON.stringify(data) + "\n";
    await writeFile(filePath, raw, "utf-8");
  };

  const writePublicJsonAndGzip = async (filePath: string, data: unknown) => {
    await mkdir(dirname(filePath), { recursive: true });
    const raw = JSON.stringify(data) + "\n";
    await writeFile(filePath, raw, "utf-8");
    const gz = gzipSync(Buffer.from(raw, "utf-8"), { level: 9 });
    await writeFile(`${filePath}.gz`, gz);
  };

  await writeJsonFile(outPostsPath, pruned);
  await writeJsonFile(outStatusPath, status);
  await writePublicJsonAndGzip(publicPostsPath, pruned);
  await writePublicJsonAndGzip(publicStatusPath, status);

  // status-history：趋势汇总（按“每次同步”为粒度），用于 status 页面展示。
  const staleThresholdHoursForHistory = parseNonNegativeInt(
    process.env.ACG_STALE_THRESHOLD_HOURS,
    72
  );
  const sourcesForHistory = status.sources ?? [];
  const totalSourcesForHistory = sourcesForHistory.length;
  const okSourcesForHistory = sourcesForHistory.filter((s) => s.ok).length;
  const errSourcesForHistory = totalSourcesForHistory - okSourcesForHistory;
  const totalItemsForHistory = sourcesForHistory.reduce((sum, s) => sum + (s.itemCount ?? 0), 0);
  const totalNewItemsForHistory = sourcesForHistory.reduce(
    (sum, s) => sum + (s.newItemCount ?? 0),
    0
  );
  const flakySourcesForHistory = sourcesForHistory.filter(
    (s) => typeof s.consecutiveFails === "number" && s.consecutiveFails >= 3
  ).length;

  const generatedAtMsForHistory = Date.parse(generatedAt);
  const staleSourcesForHistory = sourcesForHistory.filter((s) => {
    const latest = s.latestPublishedAt;
    if (!latest) return false;
    const latestMs = Date.parse(latest);
    if (!Number.isFinite(generatedAtMsForHistory) || !Number.isFinite(latestMs)) return false;
    const diffH = Math.max(0, generatedAtMsForHistory - latestMs) / (1000 * 60 * 60);
    return diffH >= staleThresholdHoursForHistory;
  }).length;

  const parseEmptyForHistory = sourcesForHistory.filter((s) =>
    (s.error ?? "").toLowerCase().includes("parse_empty")
  ).length;
  const parseDropForHistory = sourcesForHistory.filter((s) =>
    (s.error ?? "").toLowerCase().includes("parse_drop")
  ).length;

  const entry: StatusHistoryEntry = {
    generatedAt,
    durationMs: status.durationMs ?? 0,
    totalSources: totalSourcesForHistory,
    okSources: okSourcesForHistory,
    errSources: errSourcesForHistory,
    totalItems: totalItemsForHistory,
    totalNewItems: totalNewItemsForHistory,
    flakySources: flakySourcesForHistory,
    staleSources: staleSourcesForHistory,
    parseEmpty: parseEmptyForHistory,
    parseDrop: parseDropForHistory
  };

  const previousLocalHistory = await readJsonFile<StatusHistoryV1>(outStatusHistoryPath, {
    v: 1,
    generatedAt: null,
    entries: []
  });
  const baseEntriesRaw: unknown[] =
    previousRemoteStatusHistory && Array.isArray(previousRemoteStatusHistory.entries) && previousRemoteStatusHistory.entries.length > 0
      ? (previousRemoteStatusHistory.entries as unknown[])
      : (previousLocalHistory.entries as unknown[]);
  const baseEntries = baseEntriesRaw
    .map(normalizeStatusHistoryEntry)
    .filter((x): x is StatusHistoryEntry => Boolean(x));

  const maxEntries = parseNonNegativeInt(process.env.ACG_STATUS_HISTORY_MAX, 240);
  const merged = [...baseEntries, entry].sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));

  // 去重：同一时间戳只保留最后一个（通常代表同一轮重复生成）。
  const deduped: StatusHistoryEntry[] = [];
  for (const it of merged) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.generatedAt === it.generatedAt) {
      deduped[deduped.length - 1] = it;
      continue;
    }
    deduped.push(it);
  }
  const trimmed =
    maxEntries > 0 && deduped.length > maxEntries ? deduped.slice(deduped.length - maxEntries) : deduped;
  const history: StatusHistoryV1 = { v: 1, generatedAt, entries: trimmed };

  await writeJsonFile(outStatusHistoryPath, history);
  await writePublicJsonAndGzip(publicStatusHistoryPath, history);

  // 全站搜索：预生成“搜索包”（posts + index），避免运行时在 Worker 内反复构建索引
  // v2：为全站搜索瘦身（仅保留渲染必需字段；摘要/预览合并为 summary* 作为展示文案）
  const searchPackPostsV2: Post[] = pruned.map((p) => {
    const summary = p.summary ?? p.preview;
    const summaryZh = p.summaryZh ?? p.previewZh;
    const summaryJa = p.summaryJa ?? p.previewJa;
    return {
      id: p.id,
      title: p.title,
      ...(p.titleZh ? { titleZh: p.titleZh } : {}),
      ...(p.titleJa ? { titleJa: p.titleJa } : {}),
      ...(summary ? { summary } : {}),
      ...(summaryZh ? { summaryZh } : {}),
      ...(summaryJa ? { summaryJa } : {}),
      url: p.url,
      publishedAt: p.publishedAt,
      ...(p.cover ? { cover: p.cover } : {}),
      category: p.category,
      tags: p.tags,
      sourceId: p.sourceId,
      sourceName: p.sourceName,
      sourceUrl: p.sourceUrl
    };
  });
  const searchPackV2 = buildSearchPackV2(searchPackPostsV2, generatedAt);
  await writeJsonMinified(outSearchPackV2Path, searchPackV2);
  await writePublicJsonAndGzip(publicSearchPackV2Path, searchPackV2);

  // v1：保留兼容（旧版 Worker/缓存仍可读取）
  const searchPack = buildSearchPack(pruned, generatedAt);
  await writeJsonMinified(outSearchPackPath, searchPack);
  await writePublicJsonAndGzip(publicSearchPackPath, searchPack);
  console.log(`[DONE] posts=${pruned.length} generatedAt=${generatedAt}`);      
}

main().catch((err) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(message);
  process.exitCode = 1;
});
