import assert from "node:assert/strict";
import test from "node:test";
import { safeExternalHttpUrl } from "../src/lib/safe-url";
import { parseQuery, tokenizeQuery } from "../src/lib/search/query";
import { buildSourceHealthMap, computePulseScore, estimateReadMinutes, normalizeForDedup } from "../src/lib/metrics";

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
  assert.deepEqual(tokenizeQuery("tag:anime \"foo bar\""), ["tag:anime", "foo bar"]);
  assert.deepEqual(tokenizeQuery("tag:'bad quote'"), ["tag:'bad", "quote'"]);
});

test("parseQuery: 支持负向筛选与 is:", () => {
  const q = parseQuery("tag:anime -tag:bad source:ann-all -source:foo cat:アニメ after:2025-12-01 is:read -is:fresh");
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
  const recent = computePulseScore({ publishedAt: nowIso, tags: [], cover: "", summary: "", preview: "" }, null);
  const old = computePulseScore({ publishedAt: "2000-01-01T00:00:00.000Z", tags: [], cover: "", summary: "", preview: "" }, null);
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

