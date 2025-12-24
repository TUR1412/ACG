import type { APIContext } from "astro";
import { buildLangFeedXml } from "../../lib/feeds";

export async function GET(context: APIContext): Promise<Response> {
  return buildLangFeedXml(context, "zh");
}

