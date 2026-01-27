type ViewSnapshotV1 = {
  q?: unknown;
  filters?: unknown;
};

type ViewPresetV1 = {
  version?: unknown;
  id?: unknown;
  name?: unknown;
  createdAt?: unknown;
  snapshot?: unknown;
};

type ViewPresetStoreV1 = {
  version?: unknown;
  presets?: unknown;
};

export type ViewPresetSummary = { id: string; name: string; createdAt: number; hint: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v && typeof v === "object");
}

export function parseViewPresetSummaries(parsed: unknown): ViewPresetSummary[] {
  const root = parsed as ViewPresetStoreV1;
  if (!isRecord(root) || root.version !== 1) return [];
  if (!Array.isArray(root.presets)) return [];

  const normalizeLens = (v: unknown): "all" | "2h" | "6h" | "24h" => {
    return v === "2h" || v === "6h" || v === "24h" || v === "all" ? v : "all";
  };

  const normalizeSort = (v: unknown): "latest" | "pulse" => {
    return v === "pulse" || v === "latest" ? v : "latest";
  };

  const out: ViewPresetSummary[] = [];
  for (const item of root.presets as ViewPresetV1[]) {
    if (!isRecord(item) || item.version !== 1) continue;
    const id = typeof item.id === "string" ? item.id : "";
    const name = typeof item.name === "string" ? item.name : "";
    const createdAt =
      typeof item.createdAt === "number" && Number.isFinite(item.createdAt) ? item.createdAt : 0;
    const snap = isRecord(item.snapshot) ? (item.snapshot as ViewSnapshotV1) : null;
    if (!id || !name || !createdAt || !snap) continue;

    let hint = "";
    const qRaw = typeof snap.q === "string" ? snap.q.trim() : "";
    if (qRaw) hint = qRaw.length > 72 ? `${qRaw.slice(0, 72)}…` : qRaw;
    else if (isRecord(snap.filters)) {
      const lens = normalizeLens((snap.filters as Record<string, unknown>).timeLens);
      const sort = normalizeSort((snap.filters as Record<string, unknown>).sortMode);
      hint = `${lens} · ${sort}`;
    } else {
      hint = "";
    }

    out.push({ id, name, createdAt, hint });
  }

  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}
