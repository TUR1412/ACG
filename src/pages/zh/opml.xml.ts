import { SOURCE_CONFIGS } from "../../lib/source-config";
import { renderOpml } from "../../lib/opml";

export async function GET(): Promise<Response> {
  const xml = renderOpml({
    title: "ACG Radar Sources (zh)",
    dateCreated: new Date().toISOString(),
    ownerName: "ACG Radar",
    language: "zh-Hans",
    sources: SOURCE_CONFIGS,
    lang: "zh"
  });

  return new Response(xml, {
    headers: {
      "content-type": "text/xml; charset=utf-8",
      "cache-control": "public, max-age=600"
    }
  });
}
