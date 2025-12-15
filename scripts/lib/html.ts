import * as cheerio from "cheerio";

export function stripHtmlToText(html: string): string {
  const $ = cheerio.load(html);
  return $.text();
}

