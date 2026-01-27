export function chunkForTranslate(text: string, maxLen: number): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxLen) return [normalized];

  const paras = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    const c = current.trim();
    if (c) chunks.push(c);
    current = "";
  };

  for (const p of paras) {
    const next = current ? `${current}\n\n${p}` : p;
    if (next.length <= maxLen) {
      current = next;
      continue;
    }

    flush();

    // 单段过长：硬切（尽量保留换行）
    if (p.length > maxLen) {
      for (let i = 0; i < p.length; i += maxLen) {
        chunks.push(p.slice(i, i + maxLen));
      }
      continue;
    }

    current = p;
  }

  flush();
  return chunks.length > 0 ? chunks : [normalized.slice(0, maxLen)];
}

export function parseGoogleGtx(json: unknown): string | null {
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
