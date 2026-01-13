import type { APIContext } from "astro";
import { href } from "./href";
import { readGeneratedPosts } from "./generated-data";
import { renderRss } from "./rss";
import type { Post } from "./types";

export type FeedLang = "zh" | "ja";

function pickTitle(lang: FeedLang, post: Post): string {
  return lang === "ja" ? (post.titleJa ?? post.title) : (post.titleZh ?? post.title);
}

function pickPreview(lang: FeedLang, post: Post): string {
  if (lang === "ja") return (post.previewJa ?? post.summaryJa ?? post.preview ?? post.summary ?? "").trim();
  return (post.previewZh ?? post.summaryZh ?? post.preview ?? post.summary ?? "").trim();
}

function toLocaleStringSafe(locale: string, isoLike: string): string | null {
  const t = new Date(isoLike).getTime();
  if (!Number.isFinite(t)) return null;
  try {
    return new Date(t).toLocaleString(locale);
  } catch {
    return new Date(t).toISOString();
  }
}

export async function buildLangFeedXml(context: APIContext, lang: FeedLang): Promise<Response> {
  const site = context.site ?? new URL(context.url.origin);

  const posts = await readGeneratedPosts();
  const byTimeDesc = posts
    .slice()
    .sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0))
    .slice(0, 120);

  const title = lang === "ja" ? "ACGレーダー（日本語）" : "ACG Radar（中文）";
  const description =
    lang === "ja"
      ? "毎時更新の ACG ニュースレーダー（日本語フィード）"
      : "每小时更新的 ACG 资讯雷达（中文信息流）";
  const language = lang === "ja" ? "ja" : "zh-Hans";
  const locale = lang === "ja" ? "ja-JP" : "zh-CN";
  const labelSource = lang === "ja" ? "元記事" : "原文";

  const siteUrl = new URL(href(`/${lang}/`), site).toString();
  const feedUrl = new URL(href(`/${lang}/feed.xml`), site).toString();

  const xml = renderRss({
    title,
    description,
    siteUrl,
    feedUrl,
    language,
    ttlMinutes: 60,
    items: byTimeDesc.map((p) => {
      const itemUrl = new URL(href(`/${lang}/p/${p.id}/`), site).toString();
      const preview = pickPreview(lang, p);
      const fallback = toLocaleStringSafe(locale, p.publishedAt) ?? p.publishedAt;
      const desc = preview || `${p.sourceName} · ${fallback}`;

      return {
        title: pickTitle(lang, p),
        url: itemUrl,
        guid: itemUrl,
        publishedAt: p.publishedAt,
        description: `${desc}\n\n${labelSource}：${p.url}`
      };
    })
  });

  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=600"
    }
  });
}
