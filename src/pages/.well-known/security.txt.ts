import type { APIContext } from "astro";
import { href } from "../../lib/href";

function formatDateUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function GET(context: APIContext): Response {
  const site = context.site ?? new URL(context.url.origin);
  const canonical = new URL(href("/.well-known/security.txt"), site).toString();
  const policy = "https://github.com/TUR1412/ACG/security/policy";
  const expires = formatDateUtc(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));

  const body = [
    `Contact: ${policy}`,
    `Policy: ${policy}`,
    "Preferred-Languages: zh, ja, en",
    `Expires: ${expires}`,
    `Canonical: ${canonical}`,
    ""
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400"
    }
  });
}
