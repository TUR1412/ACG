import type { APIContext } from "astro";
import { href } from "../lib/href";

export function GET(context: APIContext): Response {
  const site = context.site ?? new URL(context.url.origin);

  const sitemapUrl = new URL(href("/sitemap.xml"), site).toString();
  const body = [`User-agent: *`, `Allow: /`, ``, `Sitemap: ${sitemapUrl}`, ``].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=600"
    }
  });
}

