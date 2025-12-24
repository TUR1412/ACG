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

  const siteUrl = new URL(href("/zh/"), site).toString();
  const feedUrl = new URL(href("/zh/feed.xml"), site).toString();

  const xml = renderRss({
    title: "ACG Radar（中文）",
    description: "每小时更新的 ACG 资讯雷达（中文信息流）",
    siteUrl,
    feedUrl,
    language: "zh-Hans",
    ttlMinutes: 60,
    items: byTimeDesc.map((p) => {
      const title = p.titleZh ?? p.title;
      const desc =
        (p.previewZh ?? p.summaryZh ?? p.preview ?? p.summary ?? "").trim() ||
        `${p.sourceName} · ${new Date(p.publishedAt).toLocaleString("zh-CN")}`;
      const url = new URL(href(`/zh/p/${p.id}/`), site).toString();

      return {
        title,
        url,
        guid: url,
        publishedAt: p.publishedAt,
        description: `${desc}\n\n原文：${p.url}`
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

