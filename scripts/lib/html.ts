import * as cheerio from "cheerio";

export function stripHtmlToText(html: string): string {
  const $ = cheerio.load(html);
  return $.text();
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function isLikelyImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|#|$)/i.test(url);
}

function toAbsoluteHttpUrl(raw: string, baseUrl?: string): string | undefined {
  const src = raw.trim();
  if (!src) return undefined;
  if (src.startsWith("data:")) return undefined;

  try {
    const url = baseUrl ? new URL(src, baseUrl).toString() : new URL(src).toString();
    return isHttpUrl(url) ? url : undefined;
  } catch {
    return undefined;
  }
}

function pickBestFromSrcset(srcset: string): string | undefined {
  const parts = srcset
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  let best: { url: string; score: number } | undefined;

  for (const part of parts) {
    const tokens = part.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const url = tokens[0] ?? "";
    const descriptor = tokens[1] ?? "";
    let score = 0;
    if (descriptor.endsWith("w")) score = Number(descriptor.slice(0, -1));
    else if (descriptor.endsWith("x")) score = Number(descriptor.slice(0, -1)) * 1000;
    if (!Number.isFinite(score)) score = 0;

    if (!best || score > best.score) best = { url, score };
  }

  return best?.url;
}

export function extractFirstImageUrl(params: { html: string; baseUrl?: string }): string | undefined {
  const { html, baseUrl } = params;
  const $ = cheerio.load(html);
  const img = $("img").first();
  const src =
    img.attr("src") ??
    img.attr("data-src") ??
    img.attr("data-original") ??
    img.attr("data-lazy-src") ??
    (img.attr("srcset") ? pickBestFromSrcset(img.attr("srcset") ?? "") : undefined) ??
    (img.attr("data-srcset") ? pickBestFromSrcset(img.attr("data-srcset") ?? "") : undefined);
  if (!src) return undefined;
  return toAbsoluteHttpUrl(src, baseUrl);
}

export function extractCoverFromHtml(params: { html: string; baseUrl: string }): string | undefined {
  const { html, baseUrl } = params;
  const $ = cheerio.load(html);

  const metaCandidates = [
    $('meta[property="og:image"]').attr("content"),
    $('meta[property="og:image:url"]').attr("content"),
    $('meta[property="og:image:secure_url"]').attr("content"),
    $('meta[name="twitter:image"]').attr("content"),
    $('meta[name="twitter:image:src"]').attr("content"),
    $('meta[name="thumbnail"]').attr("content")
  ].filter((x): x is string => typeof x === "string" && x.trim().length > 0);

  const linkCandidates = [
    $('link[rel="image_src"]').attr("href"),
    $('link[rel="feed_image"]').attr("href"),
    $('link[rel="preload"][as="image"]').attr("href")
  ].filter((x): x is string => typeof x === "string" && x.trim().length > 0);

  const candidates = [...metaCandidates, ...linkCandidates];

  for (const raw of candidates) {
    const abs = toAbsoluteHttpUrl(raw, baseUrl);
    if (!abs) continue;
    const lower = abs.toLowerCase();
    if (!isLikelyImageUrl(lower) && !lower.includes("image")) continue;
    if (/favicon|sprite|icon|logo|avatar/.test(lower)) continue;
    return abs;
  }

  const inArticle =
    $("article img")
      .first()
      .attr("src") ??
    $("main img")
      .first()
      .attr("src") ??
    $("img")
      .first()
      .attr("src");

  if (inArticle) {
    const abs = toAbsoluteHttpUrl(inArticle, baseUrl);
    if (abs) return abs;
  }

  return undefined;
}
