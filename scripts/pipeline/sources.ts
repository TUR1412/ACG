import type { Source } from "../sources/types";
import type { Post, SourceStatus } from "../../src/lib/types";
import type { HttpCache } from "../lib/http-cache";
import { envNonNegativeInt, envRatio01 } from "../lib/env";
import { fetchTextWithCache, normalizeHttpUrl, sha1, stripAndTruncate } from "../lib/http-cache";
import { parseSourceToItems } from "../sources/index";
import { deriveTags } from "../lib/tagger";

export async function runSource(params: {
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

  const posts: Post[] = [];
  for (const it of filtered) {
    const url = normalizeHttpUrl(it.url);
    if (!url) continue;

    const id = sha1(url);
    const title = stripAndTruncate(it.title, 180);
    // summary 是“资讯预览”的核心之一：列表页会被 line-clamp 截断，详情页可完整展示（仍然是短摘要，不是全文）。
    const summary = it.summary ? stripAndTruncate(it.summary, 360) : undefined;
    const tags = deriveTags({ title, summary, category: source.category });

    posts.push({
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
      sourceUrl: normalizeHttpUrl(source.homepage ?? source.url) ?? source.url
    });
  }

  // 解析结果“异常缩水”：可能是来源结构变更/反爬命中/被错误 HTML 污染。
  // 保守策略：当历史足够多且本次明显变少时，回退上一轮数据，避免静默停更。
  const dropMinPrev = envNonNegativeInt("ACG_PARSE_DROP_MIN_PREV", 12);
  const dropMinKeep = envNonNegativeInt("ACG_PARSE_DROP_MIN_KEEP", 3);
  const dropRatio = envRatio01("ACG_PARSE_DROP_RATIO", 0.15);

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
