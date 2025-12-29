import { normalizeText, parseQuery } from "../search/query";

type BookmarkCategory = "anime" | "game" | "goods" | "seiyuu";

type BookmarkPost = {
  id: string;
  title: string;
  titleZh?: string;
  titleJa?: string;
  summary?: string;
  summaryZh?: string;
  summaryJa?: string;
  preview?: string;
  previewZh?: string;
  previewJa?: string;
  url: string;
  publishedAt: string;
  cover?: string;
  coverOriginal?: string;
  category: BookmarkCategory;
  tags?: string[];
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
};

type FilterStore = {
  version: 2;
  onlyFollowed: boolean;
  onlyFollowedSources: boolean;
  hideRead: boolean;
};

type IndexedPost = {
  i: number;
  hay: string;
  tags: string[];
  sourceName: string;
  sourceId: string;
  sourceIdNorm: string;
  category: string;
  publishedAtMs: number | null;
};

type WorkerInitMessage = {
  type: "init";
  postsUrl: string;
  postsGzUrl?: string;
  indexUrl?: string;
  indexGzUrl?: string;
};

type WorkerSetStateMessage = {
  type: "set_state";
  state: {
    readIds: string[];
    follows: string[];
    blocklist: string[];
    disabledSources: string[];
    followedSources: string[];
    filters: FilterStore;
  };
};

type WorkerSearchMessage = {
  type: "search";
  requestId: number;
  q: string;
  freshWindowMs: number;
};

type WorkerInMessage = WorkerInitMessage | WorkerSetStateMessage | WorkerSearchMessage;

type WorkerReadyMessage = {
  type: "ready";
  total: number;
};

type WorkerResultMessage = {
  type: "result";
  requestId: number;
  total: number;
  matched: number;
  unread: number;
  posts: BookmarkPost[];
  truncated: boolean;
};

type WorkerErrorMessage = {
  type: "error";
  requestId?: number;
  message: string;
};

type WorkerOutMessage = WorkerReadyMessage | WorkerResultMessage | WorkerErrorMessage;

const DB_NAME = "acg.search.cache.v1";
const STORE_NAME = "kv";
const POSTS_KEY = "posts";
const MAX_RESULTS = 1500;

let postsUrl = "";
let postsGzUrl = "";
let indexUrl = "";
let indexGzUrl = "";

let posts: BookmarkPost[] = [];
let indexed: IndexedPost[] = [];
let activeRequestId = 0;

const state = {
  readIds: new Set<string>(),
  follows: new Set<string>(),
  blocklist: new Set<string>(),
  disabledSources: new Set<string>(),
  followedSources: new Set<string>(),
  filters: { version: 2, onlyFollowed: false, onlyFollowedSources: false, hideRead: false } as FilterStore
};

function normalizeCategory(value: unknown): BookmarkCategory {
  if (value === "anime" || value === "game" || value === "goods" || value === "seiyuu") return value;
  return "anime";
}

function normalizePost(value: unknown): BookmarkPost | null {
  if (!value || typeof value !== "object") return null;
  const it = value as any;

  const id = typeof it.id === "string" ? it.id : "";
  if (!id) return null;

  return {
    id,
    title: typeof it.title === "string" ? it.title : "",
    titleZh: typeof it.titleZh === "string" ? it.titleZh : undefined,
    titleJa: typeof it.titleJa === "string" ? it.titleJa : undefined,
    summary: typeof it.summary === "string" ? it.summary : undefined,
    summaryZh: typeof it.summaryZh === "string" ? it.summaryZh : undefined,
    summaryJa: typeof it.summaryJa === "string" ? it.summaryJa : undefined,
    preview: typeof it.preview === "string" ? it.preview : undefined,
    previewZh: typeof it.previewZh === "string" ? it.previewZh : undefined,
    previewJa: typeof it.previewJa === "string" ? it.previewJa : undefined,
    url: typeof it.url === "string" ? it.url : "",
    publishedAt: typeof it.publishedAt === "string" ? it.publishedAt : "",
    cover: typeof it.cover === "string" ? it.cover : undefined,
    coverOriginal: typeof it.coverOriginal === "string" ? it.coverOriginal : undefined,
    category: normalizeCategory(it.category),
    tags: Array.isArray(it.tags) ? it.tags.filter((x: unknown) => typeof x === "string") : undefined,
    sourceId: typeof it.sourceId === "string" ? it.sourceId : "",
    sourceName: typeof it.sourceName === "string" ? it.sourceName : "",
    sourceUrl: typeof it.sourceUrl === "string" ? it.sourceUrl : ""
  } satisfies BookmarkPost;
}

function buildIndex(list: BookmarkPost[]): IndexedPost[] {
  const out: IndexedPost[] = [];
  for (let i = 0; i < list.length; i += 1) {
    const post = list[i];
    const tags = (post.tags ?? []).map((t) => normalizeText(t)).filter(Boolean);
    const sourceName = normalizeText(post.sourceName);
    const sourceId = post.sourceId ?? "";
    const sourceIdNorm = normalizeText(sourceId);
    const category = normalizeText(post.category);
    const ts = post.publishedAt ? Date.parse(post.publishedAt) : NaN;
    const publishedAtMs = Number.isFinite(ts) ? ts : null;

    const hay = normalizeText(
      [
        post.title,
        post.titleZh ?? "",
        post.titleJa ?? "",
        post.summary ?? "",
        post.summaryZh ?? "",
        post.summaryJa ?? "",
        post.preview ?? "",
        post.previewZh ?? "",
        post.previewJa ?? "",
        tags.join(" "),
        sourceName,
        sourceIdNorm,
        category
      ].join(" ")
    );

    out.push({ i, hay, tags, sourceName, sourceId, sourceIdNorm, category, publishedAtMs });
  }
  return out;
}

function normalizeIndexRow(value: unknown, maxPosts: number): IndexedPost | null {
  if (!value || typeof value !== "object") return null;
  const it = value as any;

  const iRaw = typeof it.i === "number" ? it.i : NaN;
  const i = Number.isFinite(iRaw) ? Math.floor(iRaw) : NaN;
  if (!Number.isFinite(i) || i < 0 || i >= maxPosts) return null;

  const hay = typeof it.hay === "string" ? normalizeText(it.hay) : "";
  if (!hay) return null;

  const tags = Array.isArray(it.tags) ? it.tags.filter((x: unknown) => typeof x === "string").map((t: string) => normalizeText(t)).filter(Boolean) : [];
  const sourceName = typeof it.sourceName === "string" ? normalizeText(it.sourceName) : "";
  const sourceId = typeof it.sourceId === "string" ? it.sourceId : "";
  const sourceIdNorm = typeof it.sourceIdNorm === "string" ? normalizeText(it.sourceIdNorm) : normalizeText(sourceId);
  const category = typeof it.category === "string" ? normalizeText(it.category) : "";

  const pRaw = typeof it.publishedAtMs === "number" ? it.publishedAtMs : NaN;
  const publishedAtMs = Number.isFinite(pRaw) ? pRaw : null;

  return { i, hay, tags, sourceName, sourceId, sourceIdNorm, category, publishedAtMs };
}

function supportsGzipDecompression(): boolean {
  try {
    return typeof (globalThis as any).DecompressionStream === "function";       
  } catch {
    return false;
  }
}

async function gunzipToText(res: Response): Promise<string> {
  if (!res.body) throw new Error("empty body");
  const DS = (globalThis as any).DecompressionStream as unknown;
  if (typeof DS !== "function") throw new Error("DecompressionStream unsupported");
  const ds = new (DS as any)("gzip");
  const stream = (res.body as ReadableStream).pipeThrough(ds);
  return await new Response(stream).text();
}

async function fetchWithTimeout(url: string, init: RequestInit | undefined, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(0, timeoutMs));
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonPreferGzip(url: string, gzUrl?: string): Promise<unknown> {
  const timeoutMs = 14_000;
  const retries = 1;

  const attempt = async (target: string, accept: string): Promise<Response> => {
    return await fetchWithTimeout(
      target,
      {
        headers: {
          accept
        },
        cache: "force-cache"
      },
      timeoutMs
    );
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
  const backoff = async (i: number) => {
    const base = 180 * Math.pow(2, i);
    const jitter = 0.85 + Math.random() * 0.3;
    await sleep(Math.floor(base * jitter));
  };

  for (let i = 0; i <= retries; i += 1) {
    try {
      if (gzUrl && supportsGzipDecompression()) {
        try {
          const res = await attempt(gzUrl, "application/gzip");
          if (res.ok) {
            const text = await gunzipToText(res);
            return JSON.parse(text) as unknown;
          }
        } catch {
          // ignore and fallback to json
        }
      }

      const res = await attempt(url, "application/json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as unknown;
    } catch (err) {
      if (i < retries) {
        await backoff(i);
        continue;
      }
      throw err;
    }
  }

  throw new Error("unreachable");
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
    } catch (err) {
      reject(err);
    }
  });
}

async function dbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    try {
      return await new Promise<T | null>((resolve) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve((req.result as T) ?? null);
        req.onerror = () => resolve(null);
      });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

async function dbSet<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    } finally {
      db.close();
    }
  } catch {
    // ignore
  }
}

async function ensureDataLoaded(): Promise<void> {
  if (posts.length > 0 && indexed.length > 0) return;

  const cached = await dbGet<unknown>(POSTS_KEY);
  if (cached && typeof cached === "object") {
    const v = (cached as any).v;
    if (v === 2 && Array.isArray((cached as any).posts) && Array.isArray((cached as any).index)) {
      const list = (cached as any).posts as BookmarkPost[];
      const idx = (cached as any).index as IndexedPost[];
      if (list.length > 0 && idx.length > 0) {
        posts = list;
        indexed = idx.length === list.length ? idx : buildIndex(list);
        return;
      }
    }

    if (v === 1 && Array.isArray((cached as any).posts)) {
      const list = (cached as any).posts as BookmarkPost[];
      if (list.length > 0) {
        posts = list;
        indexed = buildIndex(list);
        await dbSet(POSTS_KEY, { v: 2, savedAt: new Date().toISOString(), posts: list, index: indexed });
        return;
      }
    }
  }

  // 优先尝试“搜索包”（posts + index）
  if (indexUrl) {
    try {
      const json = await fetchJsonPreferGzip(indexUrl, indexGzUrl || undefined);
      const pack = json as any;
      if (pack && typeof pack === "object" && pack.v === 1 && Array.isArray(pack.posts) && Array.isArray(pack.index)) {
        const list = (pack.posts as unknown[]).map(normalizePost).filter((x): x is BookmarkPost => Boolean(x));
        const idx = pack.index.map((x: unknown) => normalizeIndexRow(x, list.length)).filter((x: IndexedPost | null): x is IndexedPost => Boolean(x));
        if (list.length > 0 && idx.length === list.length) {
          posts = list;
          indexed = idx;
          await dbSet(POSTS_KEY, { v: 2, savedAt: new Date().toISOString(), posts: list, index: idx });
          return;
        }
      }
    } catch {
      // ignore and fallback
    }
  }

  if (!postsUrl) return;

  try {
    const json = await fetchJsonPreferGzip(postsUrl, postsGzUrl || undefined);
    if (!Array.isArray(json)) throw new Error("posts.json 格式错误");
    const list = json.map(normalizePost).filter((x): x is BookmarkPost => Boolean(x));
    posts = list;
    indexed = buildIndex(list);
    await dbSet(POSTS_KEY, { v: 2, savedAt: new Date().toISOString(), posts: list, index: indexed });
  } catch {
    // ignore: keep empty
  }
}

function post(msg: WorkerOutMessage) {
  (self as any).postMessage(msg);
}

function applyState(next: WorkerSetStateMessage["state"]) {
  state.readIds = new Set(next.readIds.filter((x) => typeof x === "string" && x));
  state.follows = new Set(next.follows.map((x) => normalizeText(x)).filter(Boolean));
  state.blocklist = new Set(next.blocklist.map((x) => normalizeText(x)).filter(Boolean));
  state.disabledSources = new Set(next.disabledSources.filter((x) => typeof x === "string" && x));
  state.followedSources = new Set(next.followedSources.filter((x) => typeof x === "string" && x));
  state.filters = {
    version: 2,
    onlyFollowed: Boolean(next.filters?.onlyFollowed),
    onlyFollowedSources: Boolean((next.filters as any)?.onlyFollowedSources),
    hideRead: Boolean(next.filters?.hideRead)
  };
}

async function runSearch(params: { requestId: number; q: string; freshWindowMs: number }): Promise<void> {
  await ensureDataLoaded();
  const parsed = parseQuery(params.q);
  const now = Date.now();
  const freshWindowMs = Math.max(0, Math.floor(params.freshWindowMs));

  const followOnlyEnabled = state.filters.onlyFollowed;
  const followSourcesOnlyEnabled = state.filters.onlyFollowedSources;
  const hideReadEnabled = state.filters.hideRead;

  const followWords = followOnlyEnabled ? [...state.follows] : [];
  const blockWords = state.blocklist.size > 0 ? [...state.blocklist] : [];

  const results: BookmarkPost[] = [];
  let unreadShown = 0;
  let truncated = false;

  const requestId = params.requestId;

  for (let index = 0; index < indexed.length; index += 1) {
    if (index % 256 === 0 && activeRequestId !== requestId) return;

    const row = indexed[index];
    const post = posts[row.i];
    if (!post) continue;

    const id = post.id;
    const read = id ? state.readIds.has(id) : false;

    const matchText = parsed.text.length === 0 ? true : parsed.text.every((t) => t && row.hay.includes(t));
    const matchNotText = parsed.notText.length === 0 ? true : parsed.notText.every((t) => t && !row.hay.includes(t));
    const matchTags = parsed.tags.length === 0 ? true : parsed.tags.every((t) => t && row.tags.some((x) => x.includes(t)));
    const matchNotTags = parsed.notTags.length === 0 ? true : parsed.notTags.every((t) => t && !row.tags.some((x) => x.includes(t)));
    const matchSources =
      parsed.sources.length === 0
        ? true
        : parsed.sources.every((t) => t && (row.sourceName.includes(t) || (row.sourceIdNorm ? row.sourceIdNorm.includes(t) : false)));
    const matchNotSources =
      parsed.notSources.length === 0
        ? true
        : parsed.notSources.every((t) => t && !(row.sourceName.includes(t) || (row.sourceIdNorm ? row.sourceIdNorm.includes(t) : false)));
    const matchCats = parsed.categories.length === 0 ? true : parsed.categories.some((c) => c && row.category === c);
    const matchNotCats = parsed.notCategories.length === 0 ? true : parsed.notCategories.every((c) => c && row.category !== c);
    const matchAfter = parsed.afterMs == null ? true : row.publishedAtMs != null ? row.publishedAtMs >= parsed.afterMs : false;
    const matchBefore = parsed.beforeMs == null ? true : row.publishedAtMs != null ? row.publishedAtMs <= parsed.beforeMs : false;
    const matchFollow = !followOnlyEnabled ? true : followWords.length === 0 ? false : followWords.some((w) => w && row.hay.includes(w));
    const matchFollowSources = !followSourcesOnlyEnabled ? true : row.sourceId ? state.followedSources.has(row.sourceId) : false;
    const matchIsRead = parsed.isRead == null ? true : parsed.isRead ? read : !read;
    const matchIsUnread = parsed.isUnread == null ? true : parsed.isUnread ? !read : read;

    let matchIsFresh = true;
    if (parsed.isFresh != null) {
      if (row.publishedAtMs == null) {
        matchIsFresh = false;
      } else {
        const diff = now - row.publishedAtMs;
        const fresh = diff >= 0 && diff < freshWindowMs;
        matchIsFresh = parsed.isFresh ? fresh : !fresh;
      }
    }

    const blocked = blockWords.some((w) => w && row.hay.includes(w));
    const hideByRead = hideReadEnabled && read;
    const sourceEnabled = !row.sourceId || !state.disabledSources.has(row.sourceId);

    const ok =
      matchText &&
      matchNotText &&
      matchTags &&
      matchNotTags &&
      matchSources &&
      matchNotSources &&
      matchCats &&
      matchNotCats &&
      matchAfter &&
      matchBefore &&
      matchIsRead &&
      matchIsUnread &&
      matchIsFresh &&
      matchFollow &&
      matchFollowSources &&
      !blocked &&
      !hideByRead &&
      sourceEnabled;
    if (!ok) continue;

    results.push(post);
    if (!read) unreadShown += 1;
    if (results.length >= MAX_RESULTS) {
      truncated = true;
      break;
    }
  }

  if (activeRequestId !== requestId) return;
  post({
    type: "result",
    requestId,
    total: indexed.length,
    matched: results.length,
    unread: unreadShown,
    posts: results,
    truncated
  });
}

self.addEventListener("message", (ev: MessageEvent<WorkerInMessage>) => {
  const msg = ev.data;
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "init") {
    postsUrl = msg.postsUrl;
    postsGzUrl = msg.postsGzUrl ?? "";
    indexUrl = msg.indexUrl ?? "";
    indexGzUrl = msg.indexGzUrl ?? "";
    void (async () => {
      try {
        await ensureDataLoaded();
        post({ type: "ready", total: indexed.length });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        post({ type: "error", message });
      }
    })();
    return;
  }

  if (msg.type === "set_state") {
    applyState(msg.state);
    return;
  }

  if (msg.type === "search") {
    activeRequestId = msg.requestId;
    void (async () => {
      try {
        await runSearch({ requestId: msg.requestId, q: msg.q, freshWindowMs: msg.freshWindowMs });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        post({ type: "error", requestId: msg.requestId, message });
      }
    })();
    return;
  }
});
