import { resolve } from "node:path";
import { SOURCES } from "./sources/index";
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
import { parseFeedToItems } from "./sources/feed-source";
import { parseAnimeAnimeList } from "./sources/html-animeanime";
import type { RawItem, Source } from "./sources/types";
import type { Category } from "../src/lib/categories";
import { deriveTags } from "./lib/tagger";

type Post = {
  id: string;
  title: string;
  summary?: string;
  url: string;
  publishedAt: string;
  cover?: string;
  category: Category;
  tags: string[];
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
};

type SourceStatus = {
  id: string;
  name: string;
  kind: string;
  url: string;
  ok: boolean;
  httpStatus?: number;
  durationMs: number;
  fetchedAt?: string;
  itemCount: number;
  used: "fetched" | "cached" | "fallback";
  error?: string;
};

type SyncStatus = {
  generatedAt: string | null;
  durationMs: number;
  sources: SourceStatus[];
};

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
        used: "cached"
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
        used: "fallback",
        error: res.error
      }
    };
  }

  let rawItems: RawItem[] = [];
  if (source.kind === "feed") {
    rawItems = parseFeedToItems({ source, xml: res.text });
  } else if (source.kind === "html" && source.id === "animeanime-list") {
    rawItems = parseAnimeAnimeList(res.text);
  } else {
    rawItems = [];
  }

  const filtered = source.include
    ? rawItems.filter((it) => source.include?.({ title: it.title, summary: it.summary, url: it.url }))
    : rawItems;

  const posts: Post[] = filtered.map((it) => {
    const url = normalizeUrl(it.url);
    const id = sha1(url);
    const title = stripAndTruncate(it.title, 180);
    const summary = it.summary ? stripAndTruncate(it.summary, 220) : undefined;
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
      used: "fetched"
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  const outPostsPath = resolve(root, "src", "data", "generated", "posts.json");
  const outStatusPath = resolve(root, "src", "data", "generated", "status.json");
  const publicPostsPath = resolve(root, "public", "data", "posts.json");
  const publicStatusPath = resolve(root, "public", "data", "status.json");
  const cachePath = cacheFilePath(root);

  const cache = await readJsonFile<HttpCache>(cachePath, {});

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
    sourceStatuses.push(status);
    allPosts.push(...posts);
    console.log(
      `[${status.ok ? "OK" : "ERR"}] ${source.id} items=${status.itemCount} http=${status.httpStatus ?? "-"} used=${status.used}`
    );
  }

  const pruned = filterByDays(dedupeAndSort(allPosts), args.days).slice(0, args.limit);
  const generatedAt = new Date().toISOString();
  const status: SyncStatus = { generatedAt, durationMs: Date.now() - start, sources: sourceStatuses };

  if (args.dryRun) {
    console.log(`[DRY] posts=${pruned.length} sources=${sourceStatuses.length}`);
    return;
  }

  await writeJsonFile(outPostsPath, pruned);
  await writeJsonFile(outStatusPath, status);
  await writeJsonFile(publicPostsPath, pruned);
  await writeJsonFile(publicStatusPath, status);
  console.log(`[DONE] posts=${pruned.length} generatedAt=${generatedAt}`);
}

main().catch((err) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(message);
  process.exitCode = 1;
});
