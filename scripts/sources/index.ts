import type { RawItem, Source } from "./types";
import { SOURCE_CONFIGS, type SourceConfig } from "../../src/lib/source-config";
import { parseFeedToItems } from "./feed-source";
import { parseAnimeAnimeList } from "./html-animeanime";

function compileInclude(config: SourceConfig): Source["include"] {
  if (!config.include) return undefined;
  const { pattern, flags } = config.include;
  let re: RegExp | null = null;
  try {
    re = new RegExp(pattern, flags);
  } catch {
    re = null;
  }

  if (!re) return undefined;

  return ({ title, summary }) => {
    const blob = `${title}\n${summary ?? ""}`;
    return re.test(blob);
  };
}

export const SOURCES: Source[] = SOURCE_CONFIGS.map((s) => ({
  id: s.id,
  name: s.name,
  kind: s.kind,
  lang: s.lang,
  url: s.url,
  homepage: s.homepage,
  category: s.category,
  include: compileInclude(s)
}));

type HtmlParser = (html: string) => RawItem[];

const HTML_PARSERS: Record<string, HtmlParser> = {
  "animeanime-list": parseAnimeAnimeList
};

export function parseSourceToItems(params: { source: Source; text: string }): RawItem[] {
  const { source, text } = params;
  if (source.kind === "feed") return parseFeedToItems({ source, xml: text });
  if (source.kind === "html") {
    const parser = HTML_PARSERS[source.id];
    return typeof parser === "function" ? parser(text) : [];
  }
  return [];
}

