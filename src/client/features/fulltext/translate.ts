import type { FullTextLang } from "./types";
import { fetchWithTimeout } from "./net";
import { chunkForTranslate, parseGoogleGtx } from "./translate-utils";

export async function translateViaGtx(params: {
  text: string;
  target: FullTextLang;
  timeoutMs: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<string> {
  const { text, target, timeoutMs, onProgress } = params;
  const tl = target === "zh" ? "zh-CN" : "ja";

  // URL 长度与服务稳定性：保守切块
  const chunks = chunkForTranslate(text, 1200);
  const outParts: string[] = [];

  for (let i = 0; i < chunks.length; i += 1) {
    onProgress?.(i, chunks.length);
    const q = chunks[i] ?? "";
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
      tl
    )}&dt=t&q=${encodeURIComponent(q)}`;
    const res = await fetchWithTimeout(url, timeoutMs);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as unknown;
    const translated = parseGoogleGtx(json);
    outParts.push(translated ?? q);
  }
  onProgress?.(chunks.length, chunks.length);
  return outParts.join("\n\n").trim();
}
