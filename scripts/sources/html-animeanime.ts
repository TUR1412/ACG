import * as cheerio from "cheerio";
import { parseDate, toIso } from "../lib/time";
import { stripAndTruncate } from "../lib/http-cache";
import type { RawItem } from "./types";

const BASE = "https://animeanime.jp";

export function parseAnimeAnimeList(html: string): RawItem[] {
  const $ = cheerio.load(html);
  const items: RawItem[] = [];

  $("section.item").each((_, el) => {
    const link = $(el).find("a.link[href^='/article/']").first();
    const href = link.attr("href") ?? "";
    if (!/^\/article\/\d{4}\/\d{2}\/\d{2}\/\d+\.html$/.test(href)) return;

    const title = stripAndTruncate($(el).find(".title").first().text(), 180);
    if (!title) return;

    const datetime = $(el).find("time[datetime]").attr("datetime") ?? "";
    const date = parseDate(datetime);
    if (!date) return;

    const summaryRaw = $(el).find(".summary").first().text();
    const summary = summaryRaw ? stripAndTruncate(summaryRaw, 220) : undefined;

    const img = $(el).find("img.figure").attr("src");
    const cover = img ? new URL(img, BASE).toString() : undefined;

    items.push({
      title,
      url: new URL(href, BASE).toString(),
      publishedAt: toIso(date),
      summary,
      cover
    });
  });

  return items;
}

