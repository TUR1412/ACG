import assert from "node:assert/strict";
import test from "node:test";
import { safeExternalHttpUrl } from "../src/lib/safe-url";
import { parseQuery, tokenizeQuery } from "../src/lib/search/query";

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

