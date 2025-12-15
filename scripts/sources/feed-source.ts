import { parseFeed } from "../lib/xml-feed";
import { stripHtmlToText } from "../lib/html";
import { parseDate, toIso } from "../lib/time";
import { stripAndTruncate } from "../lib/http-cache";
import type { RawItem, Source } from "./types";

export function parseFeedToItems(params: { source: Source; xml: string }): RawItem[] {
  const { xml } = params;
  const items = parseFeed(xml);

  return items
    .map((it) => {
      const date = parseDate(it.publishedAt);
      if (!date) return null;
      const title = stripAndTruncate(it.title, 180);
      const url = it.url.trim();
      const summaryText = it.summary ? stripHtmlToText(it.summary) : "";
      const summary = summaryText ? stripAndTruncate(summaryText, 220) : undefined;
      const out: RawItem = {
        title,
        url,
        publishedAt: toIso(date),
        ...(summary ? { summary } : {})
      };
      return out;
    })
    .filter((x): x is RawItem => x !== null);
}
