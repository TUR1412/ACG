import { parseFeed } from "../lib/xml-feed";
import { extractFirstImageUrl, stripHtmlToText } from "../lib/html";
import { parseDate, toIso } from "../lib/time";
import { stripAndTruncate } from "../lib/http-cache";
import type { RawItem, Source } from "./types";

function toAbsoluteHttpUrl(params: { raw: string; bases: string[] }): string | undefined {
  const raw = params.raw.trim();
  if (!raw) return undefined;
  if (raw.startsWith("data:")) return undefined;

  const tryBuild = (base?: string) => {
    try {
      const url = base ? new URL(raw, base).toString() : new URL(raw).toString();
      return /^https?:\/\//i.test(url) ? url : undefined;
    } catch {
      return undefined;
    }
  };

  const direct = tryBuild();
  if (direct) return direct;

  for (const base of params.bases) {
    const built = tryBuild(base);
    if (built) return built;
  }

  return undefined;
}

export function parseFeedToItems(params: { source: Source; xml: string }): RawItem[] {
  const { source, xml } = params;
  const items = parseFeed(xml);

  return items
    .map((it) => {
      const date = parseDate(it.publishedAt);
      if (!date) return null;
      const title = stripAndTruncate(it.title, 180);
      const url = it.url.trim();
      const summaryText = it.summary ? stripHtmlToText(it.summary) : "";
      const summary = summaryText ? stripAndTruncate(summaryText, 220) : undefined;
      const cover =
        (it.cover ? toAbsoluteHttpUrl({ raw: it.cover, bases: [url, source.url] }) : undefined) ??
        (it.summary ? extractFirstImageUrl({ html: it.summary, baseUrl: url }) : undefined);
      const out: RawItem = {
        title,
        url,
        publishedAt: toIso(date),
        ...(summary ? { summary } : {}),
        ...(cover ? { cover } : {})
      };
      return out;
    })
    .filter((x): x is RawItem => x !== null);
}
