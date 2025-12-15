import * as cheerio from "cheerio";

export function stripHtmlToText(html: string): string {
  const $ = cheerio.load(html);
  return $.text();
}

export function extractFirstImageUrl(params: { html: string; baseUrl?: string }): string | undefined {
  const { html, baseUrl } = params;
  const $ = cheerio.load(html);
  const src = $("img").first().attr("src") ?? $("img").first().attr("data-src");
  if (!src) return undefined;
  try {
    return baseUrl ? new URL(src, baseUrl).toString() : new URL(src).toString();
  } catch {
    return undefined;
  }
}
