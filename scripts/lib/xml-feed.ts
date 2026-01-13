import { XMLParser } from "fast-xml-parser";

export type FeedItem = {
  title: string;
  url: string;
  publishedAt?: string;
  summary?: string;
  cover?: string;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  trimValues: true
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (typeof record["#text"] === "string") return record["#text"];
  return "";
}

function pickAtomLink(linkNode: unknown): string {
  const links = asArray(linkNode as any);
  const firstAlternate = links.find((l) => (l as any)?.["@_rel"] === "alternate");
  const candidate = (firstAlternate ?? links[0]) as any;
  return typeof candidate?.["@_href"] === "string" ? candidate["@_href"] : textOf(candidate);
}

function isLikelyImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|#|$)/i.test(url);
}

function attrOf(node: unknown, name: string): string {
  if (!node || typeof node !== "object") return "";
  const record = node as Record<string, unknown>;
  const raw = record[`@_${name}`];
  return typeof raw === "string" ? raw : typeof raw === "number" ? String(raw) : "";
}

function pickImageFromNodes(nodes: unknown): string {
  const list = asArray(nodes as any);
  for (const n of list) {
    const url = attrOf(n, "url") || attrOf(n, "href") || textOf(n);
    if (!url) continue;
    const type = attrOf(n, "type");
    const medium = attrOf(n, "medium");
    if (type.toLowerCase().startsWith("image/")) return url;
    if (medium.toLowerCase() === "image") return url;
    if (isLikelyImageUrl(url)) return url;
  }
  return "";
}

function pickImageFromRssItem(item: any): string {
  const fromEnclosure = pickImageFromNodes(item?.enclosure);
  if (fromEnclosure) return fromEnclosure;
  const fromMediaContent = pickImageFromNodes(item?.["media:content"] ?? item?.media?.content);
  if (fromMediaContent) return fromMediaContent;
  const fromMediaThumb = pickImageFromNodes(item?.["media:thumbnail"] ?? item?.media?.thumbnail);
  if (fromMediaThumb) return fromMediaThumb;
  return "";
}

function pickAtomEnclosureImage(linkNode: unknown): string {
  const links = asArray(linkNode as any);
  const enclosure = links.find((l) => (l as any)?.["@_rel"] === "enclosure") as any;
  if (enclosure) {
    const href = typeof enclosure?.["@_href"] === "string" ? enclosure["@_href"] : textOf(enclosure);
    const type = typeof enclosure?.["@_type"] === "string" ? enclosure["@_type"] : "";
    if (href && (type.toLowerCase().startsWith("image/") || isLikelyImageUrl(href))) return href;
  }
  return "";
}

export function parseFeed(xml: string): FeedItem[] {
  const root = parser.parse(xml) as any;

  // RSS 2.0
  const rssItems = asArray(root?.rss?.channel?.item ?? root?.channel?.item);
  if (rssItems.length > 0) {
    return rssItems
      .map((item: any) => {
        const title = textOf(item?.title);
        const url = textOf(item?.link);
        const publishedAt = textOf(item?.pubDate) || textOf(item?.date) || textOf(item?.["dc:date"]);
        const summary =
          textOf(item?.description) || textOf(item?.summary) || textOf(item?.["content:encoded"]);
        const cover = pickImageFromRssItem(item);
        return { title, url, publishedAt, summary, ...(cover ? { cover } : {}) } satisfies FeedItem;
      })
      .filter((x) => x.title && x.url);
  }

  // Atom
  const atomEntries = asArray(root?.feed?.entry);
  if (atomEntries.length > 0) {
    return atomEntries
      .map((entry: any) => {
        const title = textOf(entry?.title);
        const url = pickAtomLink(entry?.link);
        const publishedAt = textOf(entry?.published) || textOf(entry?.updated);
        const summary = textOf(entry?.summary) || textOf(entry?.content);
        const cover =
          pickAtomEnclosureImage(entry?.link) ||
          pickImageFromNodes(entry?.["media:content"] ?? entry?.media?.content) ||
          pickImageFromNodes(entry?.["media:thumbnail"] ?? entry?.media?.thumbnail);
        return { title, url, publishedAt, summary, ...(cover ? { cover } : {}) } satisfies FeedItem;
      })
      .filter((x) => x.title && x.url);
  }

  // RSS 1.0 (RDF)
  const rdfRoot = root?.["rdf:RDF"] ?? root?.rdf;
  const rdfItems = asArray(rdfRoot?.item);
  if (rdfItems.length > 0) {
    return rdfItems
      .map((item: any) => {
        const title = textOf(item?.title);
        const url = textOf(item?.link);
        const publishedAt = textOf(item?.["dc:date"]) || textOf(item?.date);
        const summary = textOf(item?.description) || textOf(item?.["content:encoded"]);
        const cover =
          pickImageFromRssItem(item) ||
          pickImageFromNodes(item?.["media:content"] ?? item?.media?.content) ||
          pickImageFromNodes(item?.["media:thumbnail"] ?? item?.media?.thumbnail);
        return { title, url, publishedAt, summary, ...(cover ? { cover } : {}) } satisfies FeedItem;
      })
      .filter((x) => x.title && x.url);
  }

  return [];
}
