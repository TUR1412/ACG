import assert from "node:assert/strict";
import test from "node:test";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCover, toWeservImageUrl } from "../src/lib/cover";
import { categoryLabel, isCategory } from "../src/lib/categories";
import { getCategoryTheme } from "../src/lib/category-theme";
import { safeExternalHttpUrl } from "../src/lib/safe-url";
import { parseQuery, tokenizeQuery } from "../src/lib/search/query";
import {
  buildSourceHealthMap,
  computePulseScore,
  estimateReadMinutes,
  normalizeForDedup
} from "../src/lib/metrics";
import { formatReadMinutes, formatRelativeHours } from "../src/lib/format";
import { href } from "../src/lib/href";
import { makeErrorKey, sanitizeOneLine, sanitizeStack } from "../src/client/utils/monitoring";
import { findChromePath } from "../scripts/lib/chrome-path";
import { normalizeHttpUrl } from "../scripts/lib/http-cache";

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

test("buildSourceHealthMap: 生成健康度", () => {
  const map = buildSourceHealthMap([
    { id: "a", name: "A", kind: "rss", url: "x", ok: true, durationMs: 800, itemCount: 1, used: "fetched" },
    { id: "b", name: "B", kind: "rss", url: "x", ok: false, durationMs: 500, itemCount: 0, used: "fetched" }
  ]);
  assert.equal(map.get("a")?.level, "excellent");
  assert.equal(map.get("b")?.level, "down");
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
