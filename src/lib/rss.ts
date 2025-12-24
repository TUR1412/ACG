export type RssItem = {
  title: string;
  url: string;
  guid?: string;
  publishedAt?: string;
  description?: string;
};

export type RssChannel = {
  title: string;
  siteUrl: string;
  feedUrl: string;
  description?: string;
  language?: string;
  ttlMinutes?: number;
  items: RssItem[];
};

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeCdataLike(input: string): string {
  // RSS description 通常会放在 CDATA 里；这里仍做基本清理，避免 `]]>` 破坏结构。
  return input.replace(/]]>/g, "]]&gt;");
}

function toRfc822Date(dateLike: string | undefined): string | null {
  if (!dateLike) return null;
  const t = new Date(dateLike).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t).toUTCString();
}

export function renderRss(channel: RssChannel): string {
  const ttl = Number.isFinite(channel.ttlMinutes ?? NaN) ? Math.max(5, Math.floor(channel.ttlMinutes!)) : 60;

  const itemsXml = channel.items
    .map((item) => {
      const pubDate = toRfc822Date(item.publishedAt);
      const guid = item.guid ?? item.url;
      const desc = item.description ? escapeCdataLike(item.description) : "";

      return [
        "<item>",
        `<title>${escapeXml(item.title)}</title>`,
        `<link>${escapeXml(item.url)}</link>`,
        `<guid isPermaLink=\"true\">${escapeXml(guid)}</guid>`,
        pubDate ? `<pubDate>${escapeXml(pubDate)}</pubDate>` : "",
        desc ? `<description><![CDATA[${desc}]]></description>` : "",
        "</item>"
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<rss version=\"2.0\" xmlns:atom=\"http://www.w3.org/2005/Atom\">",
    "<channel>",
    `<title>${escapeXml(channel.title)}</title>`,
    `<link>${escapeXml(channel.siteUrl)}</link>`,
    `<atom:link href=\"${escapeXml(channel.feedUrl)}\" rel=\"self\" type=\"application/rss+xml\" />`,
    channel.description ? `<description>${escapeXml(channel.description)}</description>` : "",
    channel.language ? `<language>${escapeXml(channel.language)}</language>` : "",
    `<ttl>${ttl}</ttl>`,
    itemsXml,
    "</channel>",
    "</rss>",
    ""
  ]
    .filter(Boolean)
    .join("\n");
}

