import type { Source } from "./types";
import { SOURCE_CONFIGS, type SourceConfig } from "../../src/lib/source-config";

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
  url: s.url,
  homepage: s.homepage,
  category: s.category,
  include: compileInclude(s)
}));

