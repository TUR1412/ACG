import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "../scripts/lib/logger";
import {
  cacheFilePath,
  fetchTextWithCache,
  readJsonFile,
  normalizeHttpUrl,
  sha1,
  stripAndTruncate,
  writeJsonFile
} from "../scripts/lib/http-cache";
import { parseArgs } from "../scripts/lib/args";
import {
  extractCoverFromHtml,
  extractFirstImageUrl,
  extractPreviewFromHtml,
  isProbablyNonCoverImageUrl,
  stripHtmlToText
} from "../scripts/lib/html";
import { deriveTags } from "../scripts/lib/tagger";
import { parseDate, toIso } from "../scripts/lib/time";
import { readTranslateCache, translateTextCached, writeTranslateCache } from "../scripts/lib/translate";
import { parseFeed } from "../scripts/lib/xml-feed";
import { resolveCover, toWeservImageUrl } from "../src/lib/cover";
import { categoryLabel, isCategory } from "../src/lib/categories";
import { getCategoryTheme } from "../src/lib/category-theme";
import { safeExternalHttpUrl } from "../src/lib/safe-url";
import { buildLangFeedXml } from "../src/lib/feeds";
import {
  readGeneratedPosts,
  readGeneratedStatus,
  readGeneratedStatusHistory
} from "../src/lib/generated-data";
import { renderOpml } from "../src/lib/opml";
import { buildLangFeedJson } from "../src/lib/json-feed";
import { createRecommender } from "../src/lib/recommend";
import { renderRss } from "../src/lib/rss";
import { buildSearchIndex, normalizeSearchPackIndexRow } from "../src/lib/search/pack";
import { parseQuery, tokenizeQuery } from "../src/lib/search/query";
import {
  applyDerivedMetrics,
  buildSourceHealthMap,
  computePulseScore,
  computeTimeLensCounts,
  estimateReadMinutes,
  normalizeForDedup,
  summarizeSourceHealth
} from "../src/lib/metrics";
import { formatReadMinutes, formatRelativeHours } from "../src/lib/format";
import { href } from "../src/lib/href";
import { SOURCE_CONFIGS } from "../src/lib/source-config";
import { isJapanese } from "../src/client/utils/lang";
import {
  makeErrorKey,
  sanitizeOneLine,
  sanitizeStack,
  wireGlobalErrorMonitoring,
  wirePerfMonitoring
} from "../src/client/utils/monitoring";
import { STORAGE_KEYS } from "../src/client/constants";
import { flushTelemetry, track, wireTelemetry } from "../src/client/utils/telemetry";
import { findChromePath } from "../scripts/lib/chrome-path";
import "../src/lib/types";

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.has(key) ? (store.get(key) ?? null) : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };
}

function patchGlobal<T>(t: test.TestContext, key: string, value: T) {
  const g = globalThis as any;
  const prevDesc = Object.getOwnPropertyDescriptor(g, key);

  Object.defineProperty(g, key, {
    value,
    configurable: true,
    enumerable: true,
    writable: true
  });

  t.after(() => {
    if (prevDesc) Object.defineProperty(g, key, prevDesc);
    else delete g[key];
  });
}

function patchEnv(t: test.TestContext, key: string, value: string | undefined) {
  const prev = process.env[key];
  if (value == null) delete process.env[key];
  else process.env[key] = value;
  t.after(() => {
    if (prev == null) delete process.env[key];
    else process.env[key] = prev;
  });
}

function patchConsole(t: test.TestContext) {
  const logs: string[] = [];
  const warns: string[] = [];
  const errors: string[] = [];

  const prevLog = console.log;
  const prevWarn = console.warn;
  const prevError = console.error;

  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  console.warn = (...args: unknown[]) => {
    warns.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };

  t.after(() => {
    console.log = prevLog;
    console.warn = prevWarn;
    console.error = prevError;
  });

  return { logs, warns, errors };
}

type AnyListener = (...args: any[]) => unknown;

test("safeExternalHttpUrl: 仅允许 http(s)", () => {
  assert.equal(safeExternalHttpUrl("https://example.com/a?b=1"), "https://example.com/a?b=1");
  assert.equal(safeExternalHttpUrl("http://example.com/"), "http://example.com/");
  assert.equal(safeExternalHttpUrl(" javascript:alert(1) "), null);
  assert.equal(safeExternalHttpUrl("data:text/html,hello"), null);
  assert.equal(safeExternalHttpUrl(""), null);
  assert.equal(safeExternalHttpUrl(null), null);
});

test("tokenizeQuery: 支持引号与空白归一", () => {
  assert.deepEqual(tokenizeQuery("  hello  world "), ["hello", "world"]);
  assert.deepEqual(tokenizeQuery('tag:anime "foo bar"'), ["tag:anime", "foo bar"]);
  assert.deepEqual(tokenizeQuery("tag:'bad quote'"), ["tag:'bad", "quote'"]);
});

test("parseQuery: 支持负向筛选与 is:", () => {
  const q = parseQuery(
    "tag:anime -tag:bad source:ann-all -source:foo cat:アニメ after:2025-12-01 is:read -is:fresh"
  );
  assert.deepEqual(q.tags, ["anime"]);
  assert.deepEqual(q.notTags, ["bad"]);
  assert.deepEqual(q.sources, ["ann-all"]);
  assert.deepEqual(q.notSources, ["foo"]);
  assert.deepEqual(q.categories, ["anime"]);
  assert.equal(q.isRead, true);
  assert.equal(q.isFresh, false);
  assert.ok(typeof q.afterMs === "number" && q.afterMs > 0);
});

test("normalizeForDedup: 去噪与归一", () => {
  assert.equal(normalizeForDedup("【新作】Foo Bar!"), "foo-bar");
  assert.equal(normalizeForDedup("  『特報』 テスト123 "), "テスト123");
});

test("estimateReadMinutes: 返回合理范围", () => {
  const short = estimateReadMinutes("hello");
  const long = estimateReadMinutes("word ".repeat(800));
  assert.ok(short >= 1);
  assert.ok(long >= short);
});

test("computePulseScore: 新内容分数更高", () => {
  const nowIso = new Date().toISOString();
  const recent = computePulseScore(
    { publishedAt: nowIso, tags: [], cover: "", summary: "", preview: "" },
    null
  );
  const old = computePulseScore(
    { publishedAt: "2000-01-01T00:00:00.000Z", tags: [], cover: "", summary: "", preview: "" },
    null
  );
  assert.ok(recent > old);
});

test("computePulseScore: health/cover/summary 分支影响", () => {
  const nowMs = Date.now();
  const base = {
    publishedAt: new Date(nowMs - 6 * 60 * 60 * 1000).toISOString(),
    tags: ["a"],
    cover: "",
    summary: "x",
    preview: ""
  };

  const ex = computePulseScore(base, "excellent", nowMs);
  const good = computePulseScore(base, "good", nowMs);
  const warn = computePulseScore(base, "warn", nowMs);
  const down = computePulseScore(base, "down", nowMs);
  const none = computePulseScore(base, null, nowMs);

  assert.ok(ex > good);
  assert.ok(good >= none);
  assert.ok(warn >= down);
  assert.ok(down < none);
});

test("buildSourceHealthMap: 生成健康度", () => {
  const map = buildSourceHealthMap([
    { id: "a", name: "A", kind: "rss", url: "x", ok: true, durationMs: 800, itemCount: 1, used: "fetched" },
    { id: "b", name: "B", kind: "rss", url: "x", ok: false, durationMs: 500, itemCount: 0, used: "fetched" }
  ]);
  assert.equal(map.get("a")?.level, "excellent");
  assert.equal(map.get("b")?.level, "down");
});

test("summarizeSourceHealth: 汇总 stable/excellent/warn/down", () => {
  const sources = [
    { id: "a", name: "A", kind: "rss", url: "x", ok: true, durationMs: 800, itemCount: 1, used: "fetched" },
    {
      id: "b",
      name: "B",
      kind: "rss",
      url: "x",
      ok: true,
      durationMs: 2000,
      itemCount: 1,
      used: "fetched",
      consecutiveFails: 2
    },
    { id: "c", name: "C", kind: "rss", url: "x", ok: false, durationMs: 500, itemCount: 0, used: "fetched" },
    { id: "d", name: "D", kind: "rss", url: "x", ok: true, durationMs: 500, itemCount: 1, used: "fallback" }
  ];
  const map = buildSourceHealthMap(sources as any);
  const sum = summarizeSourceHealth(sources as any, map);
  assert.equal(sum.total, 4);
  assert.equal(sum.excellent, 1);
  assert.equal(sum.warn, 2);
  assert.equal(sum.down, 1);
  assert.equal(sum.stable, 1);
});

test("computeTimeLensCounts: 2h/6h/24h 统计边界", () => {
  const nowMs = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const posts = [
    { publishedAt: iso(nowMs - 60 * 60 * 1000) },
    { publishedAt: iso(nowMs - 5 * 60 * 60 * 1000) },
    { publishedAt: iso(nowMs - 23 * 60 * 60 * 1000) },
    { publishedAt: iso(nowMs - 30 * 60 * 60 * 1000) },
    { publishedAt: iso(nowMs + 60 * 60 * 1000) },
    { publishedAt: "invalid" }
  ];
  const counts = computeTimeLensCounts(posts as any, nowMs);
  assert.equal(counts["2h"], 1);
  assert.equal(counts["6h"], 2);
  assert.equal(counts["24h"], 3);
});

test("applyDerivedMetrics: dedup/duplicateCount/sourceHealth/readMinutes", () => {
  const nowMs = Date.now();
  const prevNow = Date.now;
  Date.now = () => nowMs;
  try {
    const posts = [
      {
        id: "1",
        title: "Hello World",
        titleZh: "你好世界",
        url: "https://example.com/p/1",
        publishedAt: new Date(nowMs - 60 * 60 * 1000).toISOString(),
        category: "anime",
        tags: ["foo"],
        sourceId: "a",
        sourceName: "A",
        sourceUrl: "https://example.com/a"
      },
      {
        id: "2",
        title: "Hello World",
        titleZh: "你好世界",
        url: "https://example.com/p/2",
        publishedAt: new Date(nowMs - 60 * 60 * 1000).toISOString(),
        category: "anime",
        tags: ["foo"],
        sourceId: "a",
        sourceName: "A",
        sourceUrl: "https://example.com/a"
      }
    ];

    const healthMap = new Map<string, any>([["a", { level: "excellent", score: 4 }]]);
    const out = applyDerivedMetrics(posts as any, healthMap as any);

    assert.equal(out.length, 2);
    assert.equal(out[0].dedupKey, out[1].dedupKey);
    assert.equal(out[0].duplicateCount, 2);
    assert.equal(out[1].duplicateCount, 2);
    assert.equal(out[0].sourceHealth, "excellent");
    assert.ok(typeof out[0].readMinutes === "number" && out[0].readMinutes >= 1);
    assert.ok(typeof out[0].pulseScore === "number" && out[0].pulseScore >= 0);
  } finally {
    Date.now = prevNow;
  }
});

test("sanitizeOneLine: 归一空白并截断", () => {
  assert.equal(sanitizeOneLine("  hello   world \n ok "), "hello world ok");
  const msg = sanitizeOneLine("fetch https://example.com/a?token=secret#x failed");
  assert.ok(!msg.includes("token=secret"));
  assert.ok(!msg.includes("#x"));
  const long = "x".repeat(500);
  const out = sanitizeOneLine(long, 20);
  assert.ok(out.length <= 20);
  assert.ok(out.endsWith("…"));
});

test("sanitizeStack: 去除 URL query/hash（避免隐私泄露）", () => {
  const stack = [
    "Error: boom",
    "    at https://example.com/a?token=secret#x:1:2",
    "    at https://example.com/b?utm_source=abc:3:4"
  ].join("\n");
  const out = sanitizeStack(stack);
  assert.ok(typeof out === "string");
  assert.ok(!out.includes("token=secret"));
  assert.ok(!out.includes("utm_source=abc"));
});

test("makeErrorKey: 包含 type/message/stackHead", () => {
  const key = makeErrorKey({
    type: "error",
    message: "boom",
    stack: "Error: boom\n    at foo:1:2\n    at bar:3:4"
  });
  assert.ok(key.startsWith("error:boom:"));
  assert.ok(key.includes("Error: boom"));
});

test("findChromePath: env LHCI_CHROME_PATH 优先", async () => {
  const prev = process.env.LHCI_CHROME_PATH;
  const file = join(tmpdir(), `acg-test-chrome-${Date.now()}-${Math.random().toString(16).slice(2)}.exe`);

  await writeFile(file, "test");
  process.env.LHCI_CHROME_PATH = file;

  try {
    assert.equal(findChromePath(), file);
  } finally {
    if (prev == null) delete process.env.LHCI_CHROME_PATH;
    else process.env.LHCI_CHROME_PATH = prev;
    await rm(file, { force: true });
  }
});

test("normalizeHttpUrl: 去 hash/追踪参数（保留必要 query）", () => {
  assert.equal(normalizeHttpUrl(""), null);
  assert.equal(normalizeHttpUrl("javascript:alert(1)"), null);
  assert.equal(normalizeHttpUrl("data:text/plain,hi"), null);

  assert.equal(
    normalizeHttpUrl("https://example.com/a?utm_source=abc&x=1#frag"),
    "https://example.com/a?x=1"
  );
  assert.equal(
    normalizeHttpUrl("https://example.com/a?fbclid=123&utm_medium=social"),
    "https://example.com/a"
  );
});

test("href: 在非 Vite 环境下回退到 /", () => {
  assert.equal(href("/a"), "/a");
  assert.equal(href("a"), "/a");
});

test("resolveCover: 本地路径与 http 图片会被安全处理", () => {
  assert.deepEqual(resolveCover(null), null);
  assert.deepEqual(resolveCover(""), null);

  const local = resolveCover("/covers/a.webp");
  assert.deepEqual(local, { src: "/covers/a.webp", original: "/covers/a.webp" });

  const http = resolveCover("http://example.com/a.jpg", 320);
  assert.ok(http);
  assert.equal(http.original, "http://example.com/a.jpg");
  assert.ok(http.src.startsWith("https://images.weserv.nl/?url="));
  assert.ok(http.src.includes("&w=320"));

  const https = resolveCover("https://example.com/a.jpg");
  assert.ok(https);
  assert.equal(https.src, "https://example.com/a.jpg");
});

test("toWeservImageUrl: 支持切换 host 并附带缩放参数", () => {
  const u = toWeservImageUrl({ url: "http://example.com/a.jpg", width: 480, host: "wsrv.nl" });
  assert.ok(u.startsWith("https://wsrv.nl/?url="));
  assert.ok(u.includes("&w=480"));
  assert.ok(u.includes("&fit=cover"));
});

test("isCategory/categoryLabel: 分类判定与多语言 label", () => {
  assert.equal(isCategory("anime"), true);
  assert.equal(isCategory("unknown"), false);
  assert.equal(categoryLabel("zh", "anime"), "动画");
  assert.equal(categoryLabel("ja", "goods"), "グッズ/フィギュア");
});

test("getCategoryTheme: 返回完整 theme", () => {
  const t = getCategoryTheme("anime");
  assert.ok(typeof t.dot === "string" && t.dot.length > 0);
  assert.ok(typeof t.ink === "string" && t.ink.length > 0);
  assert.ok(typeof t.cover === "string" && t.cover.length > 0);
  assert.ok(typeof t.glow === "string" && t.glow.length > 0);
});

test("formatRelativeHours/formatReadMinutes: 基础语义稳定", () => {
  const nowIso = new Date().toISOString();
  assert.equal(formatRelativeHours("zh", nowIso), "1小时内");
  assert.equal(formatRelativeHours("ja", nowIso), "1時間未満");

  const futureIso = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  assert.equal(formatRelativeHours("zh", futureIso), null);

  assert.equal(formatReadMinutes("zh", 0.2), "1分钟");
  assert.equal(formatReadMinutes("ja", 2.2), "2分");
});

test("renderRss: 转义 + CDATA 清理 + ttl 下限", () => {
  const xml = renderRss({
    title: `A&B <x> "y" 'z'`,
    siteUrl: "https://example.com/",
    feedUrl: "https://example.com/feed.xml",
    description: "desc",
    language: "zh",
    ttlMinutes: 1,
    items: [
      {
        title: "hello",
        url: "https://example.com/p/1",
        publishedAt: "2026-01-13T00:00:00.000Z",
        description: "hi ]]> ok"
      }
    ]
  });

  assert.ok(xml.includes("<ttl>5</ttl>"));
  assert.ok(xml.includes("A&amp;B"));
  assert.ok(xml.includes("&lt;x&gt;"));
  assert.ok(xml.includes("&quot;y&quot;"));
  assert.ok(xml.includes("&apos;z&apos;"));
  assert.ok(xml.includes('<atom:link href="https://example.com/feed.xml"'));
  assert.ok(xml.includes("<pubDate>"));
  assert.ok(xml.includes("<description><![CDATA[hi ]]&gt; ok]]></description>"));
});

test("renderRss: pubDate/description/language 可省略（保持 XML 合法）", () => {
  const xml = renderRss({
    title: "t",
    siteUrl: "https://example.com/",
    feedUrl: "https://example.com/feed.xml",
    ttlMinutes: NaN,
    items: [{ title: "x", url: "https://example.com/x", publishedAt: "not-a-date" }]
  } as any);

  assert.ok(xml.includes("<ttl>60</ttl>"));
  assert.ok(!xml.includes("<pubDate>"));
  assert.ok(!xml.includes("<description>"));
  assert.ok(!xml.includes("<language>"));
});

test("renderOpml: 分类分组 + 排序 + 属性转义", () => {
  const xml = renderOpml({
    title: 'ACG "Radar"&',
    dateCreated: "2026-01-13",
    ownerName: 'me & "you"',
    language: "zh",
    lang: "zh",
    sources: [
      {
        id: "b",
        name: 'B & "1"',
        kind: "feed",
        url: "https://example.com/rss.xml",
        homepage: "https://example.com/",
        category: "anime"
      },
      {
        id: "a",
        name: "A",
        kind: "html",
        url: "https://example.com/list",
        category: "game"
      }
    ]
  });

  assert.ok(xml.includes('<opml version="2.0">'));
  assert.ok(xml.includes("<title>ACG &quot;Radar&quot;&amp;</title>"));
  assert.ok(xml.includes("<ownerName>me &amp; &quot;you&quot;</ownerName>"));
  assert.ok(xml.includes('<outline text="动画"'));
  assert.ok(xml.includes('<outline text="游戏联动"'));
  assert.ok(xml.includes('type="rss"'));
  assert.ok(xml.includes('xmlUrl="https://example.com/rss.xml"'));
  assert.ok(xml.includes('htmlUrl="https://example.com/"'));
  assert.ok(xml.includes('type="link"'));
  assert.ok(xml.includes('htmlUrl="https://example.com/list"'));
});

test("buildSearchIndex/normalizeSearchPackIndexRow: 结构归一与边界", () => {
  const posts = [
    {
      id: "1",
      title: "Hello World",
      titleZh: "你好世界",
      url: "https://example.com/p/1",
      publishedAt: "2026-01-13T00:00:00.000Z",
      category: "anime",
      tags: [" Foo ", "Bar"],
      sourceId: "ANN",
      sourceName: "Anime News Network",
      sourceUrl: "https://example.com/ann"
    }
  ];

  const index = buildSearchIndex(posts as any);
  assert.equal(index.length, 1);
  assert.equal(index[0].i, 0);
  assert.deepEqual(index[0].tags, ["foo", "bar"]);
  assert.equal(index[0].sourceIdNorm, "ann");
  assert.equal(index[0].category, "anime");
  assert.equal(typeof index[0].publishedAtMs, "number");
  assert.ok(index[0].hay.includes("hello"));
  assert.ok(index[0].hay.includes("你好世界"));

  assert.equal(normalizeSearchPackIndexRow(null, 1), null);
  assert.equal(normalizeSearchPackIndexRow({ i: 9, hay: "x" }, 1), null);
  assert.equal(normalizeSearchPackIndexRow({ i: 0, hay: "" }, 1), null);

  const row = normalizeSearchPackIndexRow(
    {
      i: 0,
      hay: "Hello",
      tags: ["A", 1, null, " "],
      sourceName: "Anime News Network",
      sourceId: "ANN",
      category: "anime",
      publishedAtMs: 123
    },
    10
  );
  assert.ok(row);
  assert.deepEqual(row.tags, ["a"]);
  assert.equal(row.sourceIdNorm, "ann");
  assert.equal(row.publishedAtMs, 123);
});

test("scripts/lib/logger: debug/annotation/group 语义稳定", async (t) => {
  patchEnv(t, "GITHUB_ACTIONS", "true");
  patchEnv(t, "ACG_LOG_VERBOSE", undefined);
  const { logs, warns, errors } = patchConsole(t);

  const log = createLogger();
  log.debug("debug:off");
  log.warn("warn&1");
  log.error("err&2");

  const out = await log.group("Group Title", async () => {
    log.info("inside");
    return 42;
  });

  assert.equal(out, 42);
  assert.ok(warns.some((x) => x.includes("warn&1")));
  assert.ok(errors.some((x) => x.includes("err&2")));
  assert.ok(logs.some((x) => x.includes("::warning::")));
  assert.ok(logs.some((x) => x.includes("::error::")));
  assert.ok(logs.some((x) => x.startsWith("::group::")));
  assert.ok(logs.some((x) => x === "::endgroup::"));
  assert.ok(!logs.some((x) => x.includes("debug:off")));
});

test("scripts/lib/http-cache: sha1/读写/截断/缓存路径", async () => {
  assert.equal(sha1("abc"), "a9993e364706816aba3e25717850c26c9cd0d89d");
  assert.equal(stripAndTruncate("  hello   world \n ok ", 12), "hello world…");
  assert.equal(cacheFilePath("C:\\root"), "C:\\root\\.cache\\http.json");

  const dir = join(tmpdir(), `acg-http-cache-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const file = join(dir, "a.json");

  const fallback = { ok: false };
  assert.deepEqual(await readJsonFile(file, fallback), fallback);

  await writeJsonFile(file, { ok: true, v: 1 });
  assert.deepEqual(await readJsonFile(file, fallback), { ok: true, v: 1 });

  await rm(dir, { recursive: true, force: true });
});

test("fetchTextWithCache: 200/304/重试 语义稳定", async (t) => {
  const store = createMemoryStorage();
  patchGlobal(t, "localStorage", store);

  const dir = join(tmpdir(), `acg-fetch-cache-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const cachePath = join(dir, "http.json");
  const url = "https://example.com/a";
  const cache: Record<string, any> = {};

  let call = 0;
  let seenIfNoneMatch = "";

  const prevRandom = Math.random;
  Math.random = () => 0;
  t.after(() => {
    Math.random = prevRandom;
  });

  patchGlobal(t, "fetch", async (_input: any, init?: any) => {
    call += 1;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (typeof headers["if-none-match"] === "string") seenIfNoneMatch = headers["if-none-match"];

    if (call === 1) return new Response("oops", { status: 500 });
    if (call === 2)
      return new Response("hello", { status: 200, headers: { etag: "E2", "last-modified": "L2" } });
    return new Response(null, { status: 304, headers: { etag: "E3" } });
  });

  const first = await fetchTextWithCache({
    url,
    cache,
    cachePath,
    timeoutMs: 8000,
    verbose: false,
    retries: 1,
    persistCache: false
  });
  assert.ok(first.ok);
  assert.equal(first.status, 200);
  assert.equal(first.text, "hello");
  assert.equal(first.attempts, 2);
  assert.ok(first.waitMs >= 260);
  assert.equal(cache[url]?.etag, "E2");

  const second = await fetchTextWithCache({
    url,
    cache,
    cachePath,
    timeoutMs: 8000,
    verbose: false,
    retries: 0,
    persistCache: false
  });
  assert.ok(second.ok);
  assert.equal(second.status, 304);
  assert.equal(second.fromCache, true);
  assert.equal(seenIfNoneMatch, "E2");
  assert.equal(cache[url]?.etag, "E3");
  assert.ok(typeof cache[url]?.lastOkAt === "string" && cache[url].lastOkAt.includes("T"));

  await rm(dir, { recursive: true, force: true });
});

test("telemetry: track/flushTelemetry/sendBeacon/fetch fallback", async (t) => {
  const storage = createMemoryStorage();
  patchGlobal(t, "localStorage", storage);

  const dispatched: any[] = [];
  patchGlobal(t, "document", {
    hidden: false,
    referrer: "https://ref.example.com/a?token=secret#x",
    documentElement: { dataset: { acgDevice: "desktop" } },
    addEventListener: () => {},
    dispatchEvent: (ev: any) => dispatched.push(ev)
  });

  patchGlobal(t, "window", {
    location: { pathname: "/zh/" },
    addEventListener: () => {}
  });

  track({ type: "hello", data: { a: 1 } });
  const raw1 = storage.getItem(STORAGE_KEYS.TELEMETRY);
  assert.ok(raw1);
  const store1 = JSON.parse(raw1);
  assert.equal(store1.events.length, 1);
  assert.equal(store1.events[0].path, "/zh/");
  assert.equal(store1.events[0].lang, "zh");
  assert.equal(store1.events[0].device, "desktop");

  storage.setItem(STORAGE_KEYS.TELEMETRY_UPLOAD, "true");
  storage.setItem(STORAGE_KEYS.TELEMETRY_ENDPOINT, "https://example.com/telemetry");

  patchGlobal(t, "navigator", {
    sendBeacon: () => true
  });

  await flushTelemetry();
  const raw2 = storage.getItem(STORAGE_KEYS.TELEMETRY);
  assert.ok(raw2);
  const store2 = JSON.parse(raw2);
  assert.equal(store2.events.length, 0);

  track({ type: "hello2" });

  patchGlobal(t, "navigator", {
    sendBeacon: () => false
  });
  patchGlobal(t, "fetch", async () => new Response("ok", { status: 200 }));

  await flushTelemetry();
  const raw3 = storage.getItem(STORAGE_KEYS.TELEMETRY);
  assert.ok(raw3);
  const store3 = JSON.parse(raw3);
  assert.equal(store3.events.length, 0);

  assert.equal(dispatched.length, 0);
});

test("wireTelemetry: 注册监听 + 记录 page_view", async (t) => {
  const storage = createMemoryStorage();
  patchGlobal(t, "localStorage", storage);

  const winListeners: Record<string, AnyListener[]> = {};
  const docListeners: Record<string, AnyListener[]> = {};

  patchGlobal(t, "window", {
    location: { pathname: "/ja/" },
    addEventListener: (type: string, fn: AnyListener) => {
      (winListeners[type] ??= []).push(fn);
    }
  });

  patchGlobal(t, "document", {
    hidden: false,
    referrer: "",
    documentElement: { dataset: {} },
    addEventListener: (type: string, fn: AnyListener) => {
      (docListeners[type] ??= []).push(fn);
    }
  });

  wireTelemetry();

  const raw = storage.getItem(STORAGE_KEYS.TELEMETRY);
  assert.ok(raw);
  const store = JSON.parse(raw);
  assert.ok(store.events.some((e: any) => e.type === "page_view"));
  assert.ok(winListeners.pagehide?.length === 1);
  assert.ok(docListeners.visibilitychange?.length === 1);
});

test("wireGlobalErrorMonitoring: error 事件会记录 telemetry 并 toast（中文）", async (t) => {
  const storage = createMemoryStorage();
  patchGlobal(t, "localStorage", storage);

  const winListeners: Record<string, AnyListener[]> = {};
  const toasts: any[] = [];

  patchGlobal(t, "window", {
    location: { pathname: "/zh/" },
    addEventListener: (type: string, fn: AnyListener) => {
      (winListeners[type] ??= []).push(fn);
    }
  });

  patchGlobal(t, "document", {
    hidden: false,
    documentElement: { lang: "zh-CN", dataset: { acgPerf: "high", acgDevice: "desktop" } },
    addEventListener: () => {},
    dispatchEvent: (ev: any) => {
      if (ev?.type === "acg:toast") toasts.push(ev.detail);
      return true;
    }
  });

  wireGlobalErrorMonitoring();
  assert.ok(winListeners.error?.length === 1);

  await winListeners.error[0]({
    message: "boom https://example.com/a?token=secret#x",
    error: new Error("boom"),
    filename: "https://example.com/a?token=secret#x",
    lineno: 1,
    colno: 2
  });

  const raw = storage.getItem(STORAGE_KEYS.TELEMETRY);
  assert.ok(raw);
  const store = JSON.parse(raw);
  assert.ok(store.events.some((e: any) => e.type === "error_global"));
  assert.ok(toasts.some((x) => x.title === "发生了错误"));
});

test("wireGlobalErrorMonitoring: unhandledrejection 会记录 telemetry 并 toast", async (t) => {
  const storage = createMemoryStorage();
  patchGlobal(t, "localStorage", storage);

  const winListeners: Record<string, AnyListener[]> = {};
  const toasts: any[] = [];

  patchGlobal(t, "window", {
    location: { pathname: "/zh/" },
    addEventListener: (type: string, fn: AnyListener) => {
      (winListeners[type] ??= []).push(fn);
    }
  });

  patchGlobal(t, "document", {
    hidden: false,
    documentElement: { lang: "zh-CN", dataset: { acgPerf: "high" } },
    addEventListener: () => {},
    dispatchEvent: (ev: any) => {
      if (ev?.type === "acg:toast") toasts.push(ev.detail);
      return true;
    }
  });

  wireGlobalErrorMonitoring();
  assert.ok(winListeners.unhandledrejection?.length === 1);

  await winListeners.unhandledrejection[0]({
    reason: new Error("network failed")
  });

  const raw = storage.getItem(STORAGE_KEYS.TELEMETRY);
  assert.ok(raw);
  const store = JSON.parse(raw);
  assert.ok(store.events.some((e: any) => e.type === "error_unhandledrejection"));
  assert.ok(toasts.some((x) => x.title === "操作未完成"));
});

test("wirePerfMonitoring: perf_vitals 会写入 telemetry（可在无浏览器环境下模拟）", async (t) => {
  const storage = createMemoryStorage();
  patchGlobal(t, "localStorage", storage);

  const winListeners: Record<string, AnyListener[]> = {};
  const docListeners: Record<string, AnyListener[]> = {};

  patchGlobal(t, "window", {
    location: { pathname: "/zh/" },
    addEventListener: (type: string, fn: AnyListener) => {
      (winListeners[type] ??= []).push(fn);
    }
  });

  patchGlobal(t, "document", {
    hidden: false,
    documentElement: { lang: "zh-CN", dataset: { acgPerf: "high", acgDevice: "desktop" } },
    addEventListener: (type: string, fn: AnyListener) => {
      (docListeners[type] ??= []).push(fn);
    }
  });

  patchGlobal(t, "performance", {
    getEntriesByType: (type: string) => (type === "navigation" ? [{ responseStart: 123 }] : []),
    now: () => 1000
  });

  const observers: any[] = [];
  class PerformanceObserverMock {
    cb: AnyListener;
    opts: any;
    constructor(cb: AnyListener) {
      this.cb = cb;
      observers.push(this);
    }
    observe(opts: any) {
      this.opts = opts;
    }
  }
  patchGlobal(t, "PerformanceObserver", PerformanceObserverMock as any);

  wirePerfMonitoring();

  const lcp = observers.find((o) => o.opts?.type === "largest-contentful-paint");
  const cls = observers.find((o) => o.opts?.type === "layout-shift");
  const longtask = observers.find((o) => o.opts?.type === "longtask");
  const event = observers.find((o) => o.opts?.type === "event");

  lcp?.cb({ getEntries: () => [{ startTime: 456 }] });
  cls?.cb({ getEntries: () => [{ value: 0.12, hadRecentInput: false }] });
  longtask?.cb({ getEntries: () => [{ duration: 60 }] });
  event?.cb({ getEntries: () => [{ interactionId: 1, duration: 123, name: "click" }] });

  assert.ok(winListeners.pagehide?.length === 1);
  await winListeners.pagehide[0]();

  const raw = storage.getItem(STORAGE_KEYS.TELEMETRY);
  assert.ok(raw);
  const store = JSON.parse(raw);
  const vitals = store.events.find((e: any) => e.type === "perf_vitals");
  assert.ok(vitals);
  assert.equal(vitals.data?.ttfbMs, 123);
  assert.equal(vitals.data?.lcpMs, 456);
  assert.equal(vitals.data?.inpMs, 123);
  assert.equal(vitals.data?.longTaskCount, 1);
});

test("isJapanese: 语言判定稳定", (t) => {
  patchGlobal(t, "document", { documentElement: { lang: "ja-JP" } });
  assert.equal(isJapanese(), true);
});

test("parseArgs: 默认值与 flags", () => {
  assert.deepEqual(parseArgs([]), { dryRun: false, days: 30, limit: 2000, verbose: false });
  assert.deepEqual(parseArgs(["--dry-run", "--verbose"]), {
    dryRun: true,
    days: 30,
    limit: 2000,
    verbose: true
  });
  assert.deepEqual(parseArgs(["--days", "7", "--limit", "100"]), {
    dryRun: false,
    days: 7,
    limit: 100,
    verbose: false
  });
});

test("parseArgs: --days/--limit 非法值会抛错", () => {
  assert.throws(() => parseArgs(["--days", "0"]), /--days/i);
  assert.throws(() => parseArgs(["--days", "NaN"]), /--days/i);
  assert.throws(() => parseArgs(["--limit", "-1"]), /--limit/i);
  assert.throws(() => parseArgs(["--limit", "0"]), /--limit/i);
});

test("deriveTags: 命中规则与分类回退", () => {
  assert.ok(deriveTags({ title: "PV trailer", category: "anime" }).includes("PV/预告"));
  assert.deepEqual(deriveTags({ title: "nothing", category: "game" }), ["游戏"]);
  assert.deepEqual(deriveTags({ title: "nothing", category: "goods" }), ["周边"]);
  assert.deepEqual(deriveTags({ title: "nothing", category: "seiyuu" }), ["声优"]);
  assert.deepEqual(deriveTags({ title: "nothing", category: "anime" }), ["资讯"]);
});

test("parseDate/toIso: 解析与回退", () => {
  assert.equal(parseDate(undefined), null);
  assert.equal(parseDate(""), null);
  assert.equal(parseDate("invalid-date"), null);

  const d = parseDate("2026-01-13T00:00:00.000Z");
  assert.ok(d instanceof Date);
  assert.equal(toIso(d!), "2026-01-13T00:00:00.000Z");
});

test("parseFeed: 兼容 RSS2/Atom/RDF", () => {
  const rss2 = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "<channel>",
    "<item>",
    "<title>Hello</title>",
    "<link>https://example.com/p/1</link>",
    "<pubDate>Mon, 13 Jan 2026 00:00:00 GMT</pubDate>",
    "<description>desc</description>",
    '<enclosure url="https://example.com/c.jpg" type="image/jpeg" />',
    "</item>",
    "</channel>",
    "</rss>"
  ].join("\n");

  const rssItems = parseFeed(rss2);
  assert.equal(rssItems.length, 1);
  assert.equal(rssItems[0].title, "Hello");
  assert.equal(rssItems[0].url, "https://example.com/p/1");
  assert.equal(rssItems[0].cover, "https://example.com/c.jpg");

  const atom = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<feed>",
    "<entry>",
    "<title>Atom</title>",
    '<link rel="alternate" href="https://example.com/a" />',
    "<updated>2026-01-13T00:00:00.000Z</updated>",
    "<summary>sum</summary>",
    '<link rel="enclosure" href="https://example.com/a.png" type="image/png" />',
    "</entry>",
    "</feed>"
  ].join("\n");

  const atomItems = parseFeed(atom);
  assert.equal(atomItems.length, 1);
  assert.equal(atomItems[0].title, "Atom");
  assert.equal(atomItems[0].url, "https://example.com/a");
  assert.equal(atomItems[0].cover, "https://example.com/a.png");

  const rdf = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<rdf:RDF>",
    "<item>",
    "<title>RDF</title>",
    "<link>https://example.com/rdf</link>",
    "<dc:date>2026-01-13T00:00:00.000Z</dc:date>",
    "</item>",
    "</rdf:RDF>"
  ].join("\n");

  const rdfItems = parseFeed(rdf);
  assert.equal(rdfItems.length, 1);
  assert.equal(rdfItems[0].title, "RDF");
  assert.equal(rdfItems[0].url, "https://example.com/rdf");
});

test("scripts/lib/html: cover/preview 提取与基础清洗", () => {
  assert.equal(stripHtmlToText("<p>Hello <b>World</b></p>").trim(), "Hello World");
  assert.equal(isProbablyNonCoverImageUrl("https://example.com/favicon.ico"), true);
  assert.equal(isProbablyNonCoverImageUrl("https://example.com/cover.jpg"), false);

  const first = extractFirstImageUrl({
    html: '<img src="/a.png" /><img src="/b.png" />',
    baseUrl: "https://example.com/p/1"
  });
  assert.equal(first, "https://example.com/a.png");

  const cover = extractCoverFromHtml({
    html: [
      "<html><head>",
      '<meta property="og:image" content="https://example.com/favicon.ico" />',
      '<link rel="image_src" href="/cover.jpg" />',
      "</head><body></body></html>"
    ].join(""),
    baseUrl: "https://example.com/p/1"
  });
  assert.equal(cover, "https://example.com/cover.jpg");

  const previewMeta = extractPreviewFromHtml({
    html: '<meta property="og:description" content="  hello   world   from   meta   description  " />',
    maxLen: 80
  });
  assert.equal(previewMeta, "hello world from meta description");

  const previewP = extractPreviewFromHtml({
    html: "<article><p>这是一段足够长的预览文本，用于验证段落回退逻辑。</p></article>",
    maxLen: 80
  });
  assert.ok(typeof previewP === "string" && previewP.length > 0);
});

test("translateTextCached: cache 命中不会触发 fetch", async (t) => {
  const cache: Record<string, string> = {};
  const key = sha1("zh::hello");
  cache[key] = "你好";

  patchGlobal(t, "fetch", async () => {
    throw new Error("fetch should not be called");
  });

  const out = await translateTextCached({
    text: "hello",
    target: "zh",
    cache,
    cachePath: join(tmpdir(), "acg-translate-cache.json"),
    timeoutMs: 8000,
    verbose: false,
    persistCache: false
  });

  assert.equal(out, "你好");
});

test("translateTextCached: fetch 成功会写入 cache（可选落盘）", async (t) => {
  const dir = join(tmpdir(), `acg-translate-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const cachePath = join(dir, "translate.json");
  const cache: Record<string, string> = {};

  patchGlobal(t, "fetch", async () => {
    const body = JSON.stringify([[["你好", "hello"]], null, "en"]);
    return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
  });

  try {
    await mkdir(dir, { recursive: true });
    const out = await translateTextCached({
      text: "hello",
      target: "zh",
      cache,
      cachePath,
      timeoutMs: 8000,
      verbose: false,
      persistCache: true
    });

    assert.equal(out, "你好");
    assert.equal(Object.keys(cache).length, 1);

    const loaded = await readTranslateCache(cachePath);
    assert.equal(Object.values(loaded)[0], "你好");

    await writeTranslateCache(cachePath, loaded);
    const loaded2 = await readTranslateCache(cachePath);
    assert.deepEqual(loaded2, loaded);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("generated-data + feeds/json-feed: 在临时 cwd 下可稳定读取与生成", async () => {
  const dir = join(tmpdir(), `acg-gen-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const prevCwd = process.cwd();

  try {
    const genDir = join(dir, "src", "data", "generated");
    await mkdir(genDir, { recursive: true });

    await writeFile(
      join(genDir, "posts.json"),
      JSON.stringify([
        {
          id: "1",
          title: "Hello",
          titleZh: "你好",
          titleJa: "こんにちは",
          preview: "preview",
          previewZh: "预览",
          previewJa: "プレビュー",
          url: "https://example.com/p/1",
          publishedAt: "2026-01-13T00:00:00.000Z",
          category: "anime",
          tags: ["tag1"],
          sourceId: "a",
          sourceName: "A",
          sourceUrl: "https://example.com/a"
        }
      ])
    );

    await writeFile(
      join(genDir, "status.json"),
      JSON.stringify({ generatedAt: "2026-01-13T00:00:00.000Z", durationMs: 1, sources: [] })
    );

    await writeFile(
      join(genDir, "status-history.v1.json"),
      JSON.stringify({ v: 1, generatedAt: null, entries: [] })
    );

    process.chdir(dir);

    const posts = await readGeneratedPosts();
    assert.equal(posts.length, 1);

    const status = await readGeneratedStatus();
    assert.equal(status.durationMs, 1);

    const hist = await readGeneratedStatusHistory();
    assert.equal(hist.v, 1);
    assert.ok(Array.isArray(hist.entries));

    const ctx = {
      url: new URL("https://example.com/zh/feed.xml"),
      site: new URL("https://example.com/")
    } as any;

    const rssRes = await buildLangFeedXml(ctx, "zh");
    const rssText = await rssRes.text();
    assert.ok(rssText.includes("<rss"));
    assert.ok(rssText.includes("https://example.com/zh/p/1/"));

    const jsonRes = await buildLangFeedJson(ctx, "zh");
    const jsonText = await jsonRes.text();
    const json = JSON.parse(jsonText);
    assert.equal(json.title, "ACG Radar（中文）");
    assert.ok(String(json.items?.[0]?.url).includes("/zh/p/1/"));
  } finally {
    process.chdir(prevCwd);
    await rm(dir, { recursive: true, force: true });
  }
});

test("createRecommender: adjacent/related 基础语义", () => {
  const now = Date.now();
  const posts = [
    {
      id: "new",
      title: "New",
      url: "u",
      publishedAt: new Date(now - 10 * 60 * 1000).toISOString(),
      category: "anime",
      tags: ["x"],
      sourceId: "s1",
      sourceName: "S1",
      sourceUrl: "su"
    },
    {
      id: "mid",
      title: "Mid",
      url: "u",
      publishedAt: new Date(now - 20 * 60 * 1000).toISOString(),
      category: "anime",
      tags: ["x"],
      sourceId: "s1",
      sourceName: "S1",
      sourceUrl: "su",
      cover: "c"
    },
    {
      id: "old",
      title: "Old",
      url: "u",
      publishedAt: new Date(now - 30 * 60 * 1000).toISOString(),
      category: "anime",
      tags: ["y"],
      sourceId: "s2",
      sourceName: "S2",
      sourceUrl: "su"
    }
  ];

  const rec = createRecommender(posts as any);
  const adj = rec.getAdjacent(posts[1] as any);
  assert.equal(adj.newer?.id, "new");
  assert.equal(adj.older?.id, "old");

  const related = rec.getRelated(posts[0] as any, 10);
  assert.ok(related.some((p) => p.id === "mid"));
  assert.ok(!related.some((p) => p.id === "new"));
});

test("SOURCE_CONFIGS: id 唯一且分类合法", () => {
  const ids = new Set<string>();
  for (const s of SOURCE_CONFIGS) {
    assert.ok(!ids.has(s.id), `duplicate source id: ${s.id}`);
    ids.add(s.id);
    assert.equal(isCategory(s.category), true);
    assert.ok(s.url.startsWith("http"));
    assert.ok(typeof categoryLabel("zh", s.category) === "string");
  }
});
