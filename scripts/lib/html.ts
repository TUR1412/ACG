import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

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

export function isProbablyNonCoverImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    /favicon|apple-touch-icon|site-icon|siteicon|manifest|sprite|avatar|emoji/.test(lower) ||
    /spacer|blank|placeholder|noimage|no_image/.test(lower) ||
    /\/icons?\//.test(lower) ||
    /\/logo\./.test(lower) ||
    /\/logos?\//.test(lower)
  );
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

function extractImageUrlFromImg(img: cheerio.Cheerio<AnyNode>, baseUrl?: string): string | undefined {
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

export function extractFirstImageUrl(params: { html: string; baseUrl?: string }): string | undefined {
  const { html, baseUrl } = params;
  const $ = cheerio.load(html);
  const img = $("img").first();
  return extractImageUrlFromImg(img, baseUrl);
}

function collectJsonLdImageCandidates(json: unknown, out: string[], depth: number) {
  if (!json) return;
  if (depth <= 0) return;

  if (typeof json === "string") {
    out.push(json);
    return;
  }

  if (Array.isArray(json)) {
    for (const item of json) collectJsonLdImageCandidates(item, out, depth - 1);
    return;
  }

  if (typeof json !== "object") return;

  const obj = json as Record<string, unknown>;

  const directKeys: Array<keyof typeof obj> = ["image", "thumbnailUrl", "contentUrl", "url"];
  for (const key of directKeys) {
    const value = obj[key];
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) {
      for (const item of value) collectJsonLdImageCandidates(item, out, depth - 1);
    } else if (typeof value === "object" && value) {
      collectJsonLdImageCandidates(value, out, depth - 1);
    }
  }

  const graph = obj["@graph"];
  if (graph) collectJsonLdImageCandidates(graph, out, depth - 1);
}

function extractJsonLdCandidates($: cheerio.CheerioAPI): string[] {
  const out: string[] = [];
  const scripts = $('script[type="application/ld+json"]');
  scripts.each((_idx, el) => {
    const raw = $(el).text().trim();
    if (!raw) return;
    try {
      const json = JSON.parse(raw) as unknown;
      collectJsonLdImageCandidates(json, out, 6);
    } catch {
      // ignore
    }
  });
  return out;
}

function collectImgCandidates(params: {
  $: cheerio.CheerioAPI;
  baseUrl: string;
  selector: string;
  limit: number;
}): string[] {
  const { $, baseUrl, selector, limit } = params;
  const out: string[] = [];
  $(selector).each((_idx, el) => {
    if (out.length >= limit) return false;
    const url = extractImageUrlFromImg($(el), baseUrl);
    if (!url) return;
    if (!isHttpUrl(url)) return;
    const lower = url.toLowerCase();
    if (isProbablyNonCoverImageUrl(lower)) return;
    // img 标签里经常混着装饰性资源；这里做一次更严格的“像图片”判断
    if (!isLikelyImageUrl(lower) && !lower.includes("image") && !lower.includes("img")) return;
    out.push(url);
  });
  return out;
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

  const jsonLdCandidates = extractJsonLdCandidates($);

  const imgCandidates = [
    ...collectImgCandidates({ $, baseUrl, selector: "article img", limit: 12 }),
    ...collectImgCandidates({ $, baseUrl, selector: "main img", limit: 12 }),
    ...collectImgCandidates({ $, baseUrl, selector: "img", limit: 12 })
  ];

  type Candidate = { raw: string; kind: "meta" | "link" | "jsonld" | "img" };

  const candidates: Candidate[] = [
    ...metaCandidates.map((raw) => ({ raw, kind: "meta" as const })),
    ...linkCandidates.map((raw) => ({ raw, kind: "link" as const })),
    ...jsonLdCandidates.map((raw) => ({ raw, kind: "jsonld" as const })),
    ...imgCandidates.map((raw) => ({ raw, kind: "img" as const }))
  ];

  for (const { raw, kind } of candidates) {
    const abs = toAbsoluteHttpUrl(raw, baseUrl);
    if (!abs) continue;
    const lower = abs.toLowerCase();
    if (isProbablyNonCoverImageUrl(lower)) continue;
    if (kind === "img" && !isLikelyImageUrl(lower) && !lower.includes("image") && !lower.includes("img"))
      continue;
    return abs;
  }

  return undefined;
}

function normalizePreviewText(input: string): string {
  return input
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function isJunkPreview(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.length < 20 ||
    t.includes("cookie") ||
    t.includes("javascript") ||
    t.includes("enable cookies") ||
    t.includes("sign up") ||
    t.includes("log in") ||
    t.includes("ログイン") ||
    t.includes("会員登録") ||
    t.includes("利用規約") ||
    t.includes("プライバシー") ||
    t.includes("privacy policy") ||
    t.includes("terms of") ||
    t.includes("subscribe")
  );
}

/**
 * 从文章页提取“可展示的内容预览”，优先级：
 * 1) og:description / description / twitter:description
 * 2) article/main 的首段落（严格截断）
 *
 * 重要：本函数只用于“预览”，不会返回完整正文。
 */
export function extractPreviewFromHtml(params: {
  html: string;
  baseUrl?: string;
  maxLen?: number;
}): string | undefined {
  const { html, maxLen = 420 } = params;
  const $ = cheerio.load(html);

  const meta = [
    $('meta[property="og:description"]').attr("content"),
    $('meta[name="description"]').attr("content"),
    $('meta[name="twitter:description"]').attr("content")
  ]
    .filter((x): x is string => typeof x === "string")
    .map((x) => normalizePreviewText(x))
    .filter((x) => x.length > 0 && !isJunkPreview(x));

  if (meta[0]) {
    const text = meta[0];
    if (text.length <= maxLen) return text;
    return text.slice(0, Math.max(0, maxLen - 1)).trimEnd() + "…";
  }

  const selectors = ["article p", "main p", '[role="main"] p', "section p", "p"];
  const paras: string[] = [];

  for (const selector of selectors) {
    $(selector).each((_idx, el) => {
      if (paras.length >= 6) return false;
      const raw = $(el).text();
      const text = normalizePreviewText(raw);
      if (!text) return;
      if (isJunkPreview(text)) return;
      paras.push(text);
    });
    if (paras.length > 0) break;
  }

  if (paras.length === 0) return undefined;

  let combined = "";
  for (const p of paras) {
    const next = combined ? `${combined} ${p}` : p;
    if (next.length >= maxLen) {
      combined = next.slice(0, Math.max(0, maxLen - 1)).trimEnd() + "…";
      break;
    }
    combined = next;
    if (combined.length >= Math.floor(maxLen * 0.72)) break;
  }

  const out = normalizePreviewText(combined);
  return out && !isJunkPreview(out) ? out : undefined;
}
