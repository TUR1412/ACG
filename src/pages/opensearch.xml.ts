import type { APIContext } from "astro";
import { href } from "../lib/href";

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function GET(context: APIContext): Response {
  const site = context.site ?? new URL(context.url.origin);

  const iconUrl = new URL(href("/favicon.svg"), site).toString();
  const selfUrl = new URL(href("/opensearch.xml"), site).toString();

  const searchBaseUrl = new URL(href("/zh/"), site).toString();
  const searchTemplate = `${searchBaseUrl}?q={searchTerms}`;

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">`,
    `  <ShortName>${escapeXml("ACG Radar")}</ShortName>`,
    `  <Description>${escapeXml("每小时更新的 ACG 资讯雷达")}</Description>`,
    `  <InputEncoding>UTF-8</InputEncoding>`,
    `  <Image height="32" width="32" type="image/svg+xml">${escapeXml(iconUrl)}</Image>`,
    `  <Url type="text/html" template="${escapeXml(searchTemplate)}" />`,
    `  <Url type="application/opensearchdescription+xml" rel="self" template="${escapeXml(selfUrl)}" />`,
    `</OpenSearchDescription>`,
    ``
  ].join("\n");

  return new Response(xml, {
    headers: {
      "content-type": "application/opensearchdescription+xml; charset=utf-8",
      "cache-control": "public, max-age=86400"
    }
  });
}
