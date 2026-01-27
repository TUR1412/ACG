import { dirname, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { SOURCES } from "./sources/index";
import { parseArgs } from "./lib/args";
import { createLogger } from "./lib/logger";
import { cacheFilePath, readJsonFile, writeJsonFile, type HttpCache } from "./lib/http-cache";
import type { Post, SourceStatus, StatusHistoryEntry, StatusHistoryV1, SyncStatus } from "../src/lib/types";
import { buildSearchPack, buildSearchPackV2 } from "../src/lib/search/pack";
import { readTranslateCache } from "./lib/translate";
import { envNonNegativeInt, envPositiveIntInRange } from "./lib/env";
import { mapWithConcurrency } from "./pipeline/concurrency";
import { groupBySource, dedupeAndSort, filterByDays } from "./pipeline/posts";
import { runSource } from "./pipeline/sources";
import { cacheCoverThumbnails, enrichCoversFromArticlePages } from "./pipeline/covers";
import { translatePosts } from "./pipeline/translate";
import { normalizeStatusHistoryEntry } from "./pipeline/status-history";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = createLogger({ verbose: args.verbose });
  const root = process.cwd();

  const outPostsPath = resolve(root, "src", "data", "generated", "posts.json");
  const outStatusPath = resolve(root, "src", "data", "generated", "status.json");
  const outStatusHistoryPath = resolve(root, "src", "data", "generated", "status-history.v1.json");
  const outSearchPackPath = resolve(root, "src", "data", "generated", "search-pack.v1.json");
  const outSearchPackV2Path = resolve(root, "src", "data", "generated", "search-pack.v2.json");
  const publicPostsPath = resolve(root, "public", "data", "posts.json");
  const publicStatusPath = resolve(root, "public", "data", "status.json");
  const publicStatusHistoryPath = resolve(root, "public", "data", "status-history.v1.json");
  const publicSearchPackPath = resolve(root, "public", "data", "search-pack.v1.json");
  const publicSearchPackV2Path = resolve(root, "public", "data", "search-pack.v2.json");
  const cachePath = cacheFilePath(root);
  const translateCachePath = resolve(root, ".cache", "translate.json");

  const cache = await readJsonFile<HttpCache>(cachePath, {});
  const translateCache = await readTranslateCache(translateCachePath);

  // 历史数据策略：优先尝试从上一次 Pages 部署的 data/posts.json 读取（避免每小时提交刷屏）。
  // 若不存在（首次部署）则退回到仓库内的 src/data/generated/posts.json。
  const remotePostsUrl = process.env.ACG_REMOTE_POSTS_URL ?? "https://tur1412.github.io/ACG/data/posts.json";
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
    process.env.ACG_REMOTE_STATUS_HISTORY_URL ?? "https://tur1412.github.io/ACG/data/status-history.v1.json";
  const previousRemoteStatusHistory = await (async () => {
    try {
      const res = await fetch(`${remoteStatusHistoryUrl}?t=${Date.now()}`, {
        headers: { "user-agent": "Mozilla/5.0 (ACG-FeedBot/0.1; +https://github.com/TUR1412/ACG)" }
      });
      if (!res.ok) return null;
      const json = (await res.json()) as unknown;
      if (json && typeof json === "object" && (json as any).v === 1 && Array.isArray((json as any).entries)) {
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

  const sourceConcurrency = envPositiveIntInRange("ACG_SOURCE_CONCURRENCY", 3, { min: 1, max: 8 });

  // 来源抓取：支持有限并发（默认 3），以降低整轮耗时与整点波动。
  // 注意：为避免并发写入 http cache 文件导致竞态，抓取阶段仅更新内存 cache，结束后统一落盘。
  const sourceResults = await mapWithConcurrency({
    items: SOURCES,
    concurrency: sourceConcurrency,
    fn: async (source) =>
      await runSource({
        source,
        cache,
        cachePath,
        previousBySource,
        verbose: args.verbose,
        persistCache: false
      })
  });

  for (let i = 0; i < SOURCES.length; i += 1) {
    const source = SOURCES[i];
    const { posts, status } = sourceResults[i];

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
    log.info(
      `[${status.ok ? "OK" : "ERR"}] ${source.id} items=${status.itemCount} http=${status.httpStatus ?? "-"} used=${status.used}`
    );
  }

  if (!args.dryRun) await writeJsonFile(cachePath, cache);

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
    log.info(`[COVER] enriched=${enriched}/${attempted} max=${maxTotal}`);

    const cacheRes = await cacheCoverThumbnails({ posts: pruned, root, verbose: args.verbose });
    log.info(`[COVER:CACHE] cached=${cacheRes.cached}/${cacheRes.attempted} max=${cacheRes.max}`);

    // 语言转换：为 /zh 与 /ja 预生成标题/摘要翻译（避免用户在信息流里看不懂）
    const translateRes = await translatePosts({
      posts: pruned,
      cache: translateCache,
      cachePath: translateCachePath,
      verbose: args.verbose,
      persistCache: true
    });
    log.info(
      `[TRANSLATE] applied=${translateRes.translated}/${translateRes.attempted} maxPosts=${process.env.ACG_TRANSLATE_MAX_POSTS ?? "220"}`
    );
  } else {
    log.info(`[COVER] skipped (dry-run)`);
  }

  const generatedAt = new Date().toISOString();
  const status: SyncStatus = { generatedAt, durationMs: Date.now() - start, sources: sourceStatuses };

  if (args.dryRun) {
    log.info(`[DRY] posts=${pruned.length} sources=${sourceStatuses.length}`);
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
  const staleThresholdHoursForHistory = envNonNegativeInt("ACG_STALE_THRESHOLD_HOURS", 72);
  const sourcesForHistory = status.sources ?? [];
  const totalSourcesForHistory = sourcesForHistory.length;
  const okSourcesForHistory = sourcesForHistory.filter((s) => s.ok).length;
  const errSourcesForHistory = totalSourcesForHistory - okSourcesForHistory;
  const totalItemsForHistory = sourcesForHistory.reduce((sum, s) => sum + (s.itemCount ?? 0), 0);
  const totalNewItemsForHistory = sourcesForHistory.reduce((sum, s) => sum + (s.newItemCount ?? 0), 0);
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
    previousRemoteStatusHistory &&
    Array.isArray(previousRemoteStatusHistory.entries) &&
    previousRemoteStatusHistory.entries.length > 0
      ? (previousRemoteStatusHistory.entries as unknown[])
      : (previousLocalHistory.entries as unknown[]);
  const baseEntries = baseEntriesRaw
    .map(normalizeStatusHistoryEntry)
    .filter((x): x is StatusHistoryEntry => Boolean(x));

  const maxEntries = envNonNegativeInt("ACG_STATUS_HISTORY_MAX", 240);
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
  log.info(`[DONE] posts=${pruned.length} generatedAt=${generatedAt}`);
}

main().catch((err) => {
  const log = createLogger();
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  log.error(message);
  process.exitCode = 1;
});
