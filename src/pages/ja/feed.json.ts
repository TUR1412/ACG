import type { APIContext } from "astro";
import { buildLangFeedJson } from "../../lib/json-feed";

export async function GET(context: APIContext): Promise<Response> {
  return buildLangFeedJson(context, "ja");
}

