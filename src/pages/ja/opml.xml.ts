import { SOURCE_CONFIGS } from "../../lib/source-config";
import { renderOpml } from "../../lib/opml";

export async function GET(): Promise<Response> {
  const xml = renderOpml({
    title: "ACG Radar Sources (ja)",
    dateCreated: new Date().toISOString(),
    ownerName: "ACG Radar",
    language: "ja",
    sources: SOURCE_CONFIGS,
    lang: "ja"
  });

  return new Response(xml, {
    headers: {
      "content-type": "text/xml; charset=utf-8",
      "cache-control": "public, max-age=600"
    }
  });
}
