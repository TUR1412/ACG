import { readJsonFile, sha1, writeJsonFile } from "./http-cache";

export type TranslateTarget = "zh" | "ja";

export type TranslateCache = Record<string, string>;

function targetToGoogleTl(target: TranslateTarget): string {
  // Google gtx endpoint uses BCP-47-ish tags.
  return target === "zh" ? "zh-CN" : "ja";
}

export async function readTranslateCache(filePath: string): Promise<TranslateCache> {
  return readJsonFile<TranslateCache>(filePath, {});
}

export async function writeTranslateCache(filePath: string, cache: TranslateCache): Promise<void> {
  await writeJsonFile(filePath, cache);
}

function cacheKey(params: { text: string; target: TranslateTarget }): string {
  return sha1(`${params.target}::${params.text}`);
}

function parseGoogleGtxResponse(json: unknown): string | null {
  // Expected: [[["你好","hello",...], ...], null, "en", ...]
  if (!Array.isArray(json)) return null;
  const top0 = json[0];
  if (!Array.isArray(top0)) return null;
  const parts: string[] = [];
  for (const seg of top0) {
    if (!Array.isArray(seg)) continue;
    const out = seg[0];
    if (typeof out === "string" && out) parts.push(out);
  }
  const joined = parts.join("");
  return joined.trim() ? joined : null;
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
  const input = text.trim();
  if (!input) return text;

  const key = cacheKey({ text: input, target });
  const cached = cache[key];
  if (typeof cached === "string" && cached.trim()) return cached;

  const tl = targetToGoogleTl(target);
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
    tl
  )}&dt=t&q=${encodeURIComponent(input)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json,text/plain,*/*" }
    });
    if (!res.ok) {
      if (verbose) console.log(`[TRANSLATE:ERR] ${target} HTTP ${res.status}`);
      return text;
    }

    const json = (await res.json()) as unknown;
    const out = parseGoogleGtxResponse(json);
    if (!out) return text;
    cache[key] = out;
    if (persistCache) await writeTranslateCache(cachePath, cache);
    return out;
  } catch (err) {
    if (verbose) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`[TRANSLATE:ERR] ${target} ${message}`);
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

