import type { TranslateTarget } from "../types";

function targetToGoogleTl(target: TranslateTarget): string {
  // Google gtx endpoint uses BCP-47-ish tags.
  return target === "zh" ? "zh-CN" : "ja";
}

function parseGoogleGtxResponse(json: unknown): string | null {
  // Expected: [[[\"你好\",\"hello\",...], ...], null, \"en\", ...]
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

export async function translateTextGtx(params: {
  text: string;
  target: TranslateTarget;
  timeoutMs: number;
}): Promise<{ ok: true; text: string } | { ok: false; status: number; error: string }> {
  const { text, target, timeoutMs } = params;
  const tl = targetToGoogleTl(target);
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
    tl
  )}&dt=t&q=${encodeURIComponent(text)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json,text/plain,*/*" }
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }

    const json = (await res.json()) as unknown;
    const out = parseGoogleGtxResponse(json);
    if (!out) return { ok: false, status: res.status, error: "parse_error" };

    return { ok: true, text: out };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, error: message };
  } finally {
    clearTimeout(timer);
  }
}
