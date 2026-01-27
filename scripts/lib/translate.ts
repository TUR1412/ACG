import { readJsonFile, sha1, writeJsonFile } from "./http-cache";
import { createLogger } from "./logger";
import { translateTextGtx } from "./translate/providers/gtx";
import type { TranslateCache, TranslateProvider, TranslateTarget } from "./translate/types";

export type { TranslateCache, TranslateProvider, TranslateTarget } from "./translate/types";

export async function readTranslateCache(filePath: string): Promise<TranslateCache> {
  return readJsonFile<TranslateCache>(filePath, {});
}

export async function writeTranslateCache(filePath: string, cache: TranslateCache): Promise<void> {
  await writeJsonFile(filePath, cache);
}

function cacheKey(params: { text: string; target: TranslateTarget }): string {
  return sha1(`${params.target}::${params.text}`);
}

function readProviderEnv(): TranslateProvider {
  const raw = (process.env.ACG_TRANSLATE_PROVIDER ?? "").trim().toLowerCase();
  if (!raw) return "gtx";
  if (raw === "gtx") return "gtx";

  const offValues = new Set(["off", "none", "disabled", "false", "0", "no"]);
  if (offValues.has(raw)) return "off";

  return "gtx";
}

export async function translateTextCached(params: {
  text: string;
  target: TranslateTarget;
  cache: TranslateCache;
  cachePath: string;
  timeoutMs: number;
  verbose: boolean;
  persistCache: boolean;
}): Promise<string> {
  const { text, target, cache, cachePath, timeoutMs, verbose, persistCache } = params;
  const log = createLogger({ verbose });
  const input = text.trim();
  if (!input) return text;

  const provider = readProviderEnv();
  if (provider === "off") {
    log.debug(`[TRANSLATE:SKIP] provider=off target=${target}`);
    return text;
  }

  const key = cacheKey({ text: input, target });
  const cached = cache[key];
  if (typeof cached === "string" && cached.trim()) return cached;

  const res = await translateTextGtx({ text: input, target, timeoutMs });
  if (!res.ok) {
    log.debug(`[TRANSLATE:ERR] provider=gtx target=${target} ${res.error}`);
    return text;
  }

  cache[key] = res.text;
  if (persistCache) await writeTranslateCache(cachePath, cache);
  return res.text;
}
