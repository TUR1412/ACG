import { loadString, saveString } from "../../state/storage";

export type FullTextCacheEntry = {
  url: string;
  fetchedAt: string;
  original: string;
  zh?: string;
  ja?: string;
};

const FULLTEXT_CACHE_MAX_CHARS = 160_000;

// v3：当“全文预览”的抽取/清洗策略发生结构性变化时，升级缓存版本，避免用户长期被旧的错误正文污染。
// 说明：这里采用“硬失效”策略（不自动迁移旧缓存），确保修复能立刻在所有页面生效，而不需要用户手动点「重新加载」或清空缓存。
const FULLTEXT_CACHE_PREFIX = "acg.fulltext.v6:";

export function fullTextCacheKey(postId: string): string {
  return `${FULLTEXT_CACHE_PREFIX}${postId}`;
}

export function readFullTextCache(postId: string): FullTextCacheEntry | null {
  const parse = (raw: string | null): FullTextCacheEntry | null => {
    if (!raw) return null;
    try {
      const json = JSON.parse(raw) as unknown;
      if (!json || typeof json !== "object") return null;
      const it = json as Record<string, unknown>;
      if (typeof it.original !== "string" || typeof it.url !== "string") return null;
      return {
        url: it.url,
        fetchedAt: typeof it.fetchedAt === "string" ? it.fetchedAt : "",
        original: it.original,
        zh: typeof it.zh === "string" ? it.zh : undefined,
        ja: typeof it.ja === "string" ? it.ja : undefined
      } satisfies FullTextCacheEntry;
    } catch {
      return null;
    }
  };

  return parse(loadString(fullTextCacheKey(postId)));
}

export function writeFullTextCache(postId: string, entry: FullTextCacheEntry) {
  try {
    // 保护：避免 localStorage 被超大正文撑爆（不同浏览器配额不同）
    // 策略：优先保证“原文”可缓存；若总体过大，则丢弃翻译缓存（翻译可重新生成）。
    const sizeOf = (it: FullTextCacheEntry) =>
      it.original.length + (it.zh?.length ?? 0) + (it.ja?.length ?? 0);

    const base: FullTextCacheEntry = {
      url: entry.url,
      fetchedAt: entry.fetchedAt,
      original: entry.original
    };
    if (sizeOf(base) > FULLTEXT_CACHE_MAX_CHARS) return;

    const toWrite = sizeOf(entry) <= FULLTEXT_CACHE_MAX_CHARS ? entry : base;
    saveString(fullTextCacheKey(postId), JSON.stringify(toWrite));
  } catch {
    // ignore
  }
}
