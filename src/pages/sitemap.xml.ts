import type { APIContext } from "astro";
import { CATEGORIES } from "../lib/categories";
import { href } from "../lib/href";
import { readGeneratedPosts, readGeneratedStatus } from "../lib/generated-data";

type UrlEntry = {
  loc: string;
  lastmod?: string;
};

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeIso(isoLike: string | null | undefined): string | undefined {
  if (!isoLike) return undefined;
  const t = Date.parse(isoLike);
  if (!Number.isFinite(t)) return undefined;
  return new Date(t).toISOString();
}

function buildXml(entries: UrlEntry[]): string {
  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`);

  for (const it of entries) {
    lines.push(`  <url>`);
    lines.push(`    <loc>${escapeXml(it.loc)}</loc>`);
    if (it.lastmod) lines.push(`    <lastmod>${escapeXml(it.lastmod)}</lastmod>`);
    lines.push(`  </url>`);
  }

  lines.push(`</urlset>`);
  lines.push("");
  return lines.join("\n");
}

export async function GET(context: APIContext): Promise<Response> {
  const site = context.site ?? new URL(context.url.origin);

  const status = await readGeneratedStatus();
  const lastmod = normalizeIso(status.generatedAt);

  const entries: UrlEntry[] = [];
  const seen = new Set<string>();

  function add(pathname: string, mod?: string): void {
    const loc = new URL(href(pathname), site).toString();
    if (seen.has(loc)) return;
    seen.add(loc);
    entries.push({ loc, lastmod: mod });
  }

  // Root landing
  add("/", lastmod);

  // Key pages (per language)
  const langs = ["zh", "ja"] as const;
  for (const lang of langs) {
    add(`/${lang}/`, lastmod);
    add(`/${lang}/status/`, lastmod);
    add(`/${lang}/about/`, lastmod);
    add(`/${lang}/bookmarks/`, lastmod);

    for (const cat of CATEGORIES) add(`/${lang}/c/${cat}/`, lastmod);
  }

  // Posts (best-effort: when generated data exists)
  const posts = await readGeneratedPosts();
  const maxPosts = 5000;
  const byTimeDesc = posts
    .slice()
    .sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0))
    .slice(0, maxPosts);

  for (const p of byTimeDesc) {
    const pLastmod = normalizeIso(p.publishedAt) ?? lastmod;
    add(`/zh/p/${p.id}/`, pLastmod);
    add(`/ja/p/${p.id}/`, pLastmod);
  }

  const xml = buildXml(entries);

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=600"
    }
  });
}

