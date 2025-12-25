import type { APIContext } from "astro";
import { href } from "./href";
import { readGeneratedPosts } from "./generated-data";
import type { Post } from "./types";

export type FeedLang = "zh" | "ja";

function pickTitle(lang: FeedLang, post: Post): string {
  return lang === "ja" ? post.titleJa ?? post.title : post.titleZh ?? post.title;
}

function pickPreview(lang: FeedLang, post: Post): string {
  if (lang === "ja") return (post.previewJa ?? post.summaryJa ?? post.preview ?? post.summary ?? "").trim();
  return (post.previewZh ?? post.summaryZh ?? post.preview ?? post.summary ?? "").trim();
}

export async function buildLangFeedJson(context: APIContext, lang: FeedLang): Promise<Response> {
  const site = context.site ?? new URL(context.url.origin);

  const posts = await readGeneratedPosts();
  const byTimeDesc = posts
    .slice()
    .sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0))
    .slice(0, 120);

  const title = lang === "ja" ? "ACGレーダー（日本語）" : "ACG Radar（中文）";
  const description = lang === "ja" ? "毎時更新の ACG ニュースレーダー（JSON Feed）" : "每小时更新的 ACG 资讯雷达（JSON Feed）";
  const language = lang === "ja" ? "ja" : "zh-Hans";

  const homePageUrl = new URL(href(`/${lang}/`), site).toString();
  const feedUrl = new URL(href(`/${lang}/feed.json`), site).toString();

  const json = {
    version: "https://jsonfeed.org/version/1.1",
    title,
    home_page_url: homePageUrl,
    feed_url: feedUrl,
    description,
    language,
    items: byTimeDesc.map((p) => {
      const itemUrl = new URL(href(`/${lang}/p/${p.id}/`), site).toString();
      const contentText = pickPreview(lang, p);
      return {
        id: itemUrl,
        url: itemUrl,
        external_url: p.url,
        title: pickTitle(lang, p),
        content_text: contentText || `${p.sourceName}`,
        date_published: p.publishedAt,
        tags: (p.tags ?? []).slice(0, 10),
        image: p.cover
      };
    })
  };

  return new Response(JSON.stringify(json, null, 2) + "\n", {
    headers: {
      "content-type": "application/feed+json; charset=utf-8",
      "cache-control": "public, max-age=600"
    }
  });
}

