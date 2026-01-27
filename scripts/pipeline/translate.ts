import type { SourceLang } from "../../src/lib/source-config";
import type { Post } from "../../src/lib/types";
import { envNonNegativeInt } from "../lib/env";
import { stripAndTruncate } from "../lib/http-cache";
import { translateTextCached, type TranslateCache } from "../lib/translate";
import { SOURCES } from "../sources/index";

function hasJapaneseKana(text: string): boolean {
  // Hiragana + Katakana。仅靠汉字无法区分中/日，所以用 kana 作为“强证据”。
  return /[\u3041-\u30ff]/.test(text);
}

export async function translatePosts(params: {
  posts: Post[];
  cache: TranslateCache;
  cachePath: string;
  verbose: boolean;
  persistCache: boolean;
}): Promise<{ translated: number; attempted: number }> {
  const { posts, cache, cachePath, verbose, persistCache } = params;

  const timeoutMs = envNonNegativeInt("ACG_TRANSLATE_TIMEOUT_MS", 18_000);
  const maxPosts = envNonNegativeInt("ACG_TRANSLATE_MAX_POSTS", 220);

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
