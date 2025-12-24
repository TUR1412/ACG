import type { APIContext } from "astro";
import { href } from "../../lib/href";
import { readGeneratedPosts } from "../../lib/generated-data";
import { renderRss } from "../../lib/rss";

export async function GET(context: APIContext): Promise<Response> {
  const site = context.site ?? new URL(context.url.origin);

  const posts = await readGeneratedPosts();
  const byTimeDesc = posts
    .slice()
    .sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0))
    .slice(0, 120);

  const siteUrl = new URL(href("/ja/"), site).toString();
  const feedUrl = new URL(href("/ja/feed.xml"), site).toString();

  const xml = renderRss({
    title: "ACGレーダー（日本語）",
    description: "毎時更新の ACG ニュースレーダー（日本語フィード）",
    siteUrl,
    feedUrl,
    language: "ja",
    ttlMinutes: 60,
    items: byTimeDesc.map((p) => {
      const title = p.titleJa ?? p.title;
      const desc =
        (p.previewJa ?? p.summaryJa ?? p.preview ?? p.summary ?? "").trim() ||
        `${p.sourceName} · ${new Date(p.publishedAt).toLocaleString("ja-JP")}`;
      const url = new URL(href(`/ja/p/${p.id}/`), site).toString();

      return {
        title,
        url,
        guid: url,
        publishedAt: p.publishedAt,
        description: `${desc}\n\n元記事：${p.url}`
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

