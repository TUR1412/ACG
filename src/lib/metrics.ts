// 派生指标与来源健康度计算，供站点与客户端共享。
import type { Post, SourceHealthLevel, SourceStatus } from "./types";

export type SourceHealthInfo = {
  level: SourceHealthLevel;
  score: number;
};

export type SourceHealthSummary = {
  total: number;
  excellent: number;
  good: number;
  warn: number;
  down: number;
  stable: number;
};

const BRACKETS_RE = /\[|[\]【】()（）「」『』《》〈〉〔〕]/g;
const NOISE_TOKENS = new Set(["新作", "特報"]);

export function normalizeForDedup(raw: string): string {
  const base = String(raw || "")
    .replace(/\u3000/g, " ")
    .replace(BRACKETS_RE, " ")
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!base) return "";
  const tokens = base
    .split(" ")
    .filter(Boolean)
    .filter((token) => !NOISE_TOKENS.has(token));
  return (tokens.length ? tokens : base.split(" ").filter(Boolean)).slice(0, 12).join("-");
}

export function estimateReadMinutes(text: string): number {
  const raw = String(text || "").trim();
  if (!raw) return 1;
  const cjk = (raw.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) ?? []).length;
  const latinWords = raw
    .replace(/[\u3040-\u30ff\u4e00-\u9fff]/g, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const cjkMinutes = cjk / 420;
  const latinMinutes = latinWords / 200;
  const minutes = Math.max(cjkMinutes, latinMinutes, 0.6);
  return Math.min(20, Math.max(1, Math.ceil(minutes)));
}

export function buildSourceHealthMap(sources: SourceStatus[]): Map<string, SourceHealthInfo> {
  const map = new Map<string, SourceHealthInfo>();
  for (const s of sources) {
    const fails = s.consecutiveFails ?? 0;
    let level: SourceHealthLevel = "good";
    if (!s.ok) level = "down";
    else if (fails >= 2 || s.used === "fallback") level = "warn";
    else if (fails === 0 && s.used === "fetched" && s.durationMs > 0 && s.durationMs <= 1200) {
      level = "excellent";
    }
    const score = level === "excellent" ? 4 : level === "good" ? 3 : level === "warn" ? 1 : 0;
    map.set(s.id, { level, score });
  }
  return map;
}

export function summarizeSourceHealth(
  sources: SourceStatus[],
  map: Map<string, SourceHealthInfo>
): SourceHealthSummary {
  const summary: SourceHealthSummary = {
    total: sources.length,
    excellent: 0,
    good: 0,
    warn: 0,
    down: 0,
    stable: 0
  };
  for (const s of sources) {
    const level = map.get(s.id)?.level ?? "good";
    if (level === "excellent") summary.excellent += 1;
    else if (level === "good") summary.good += 1;
    else if (level === "warn") summary.warn += 1;
    else summary.down += 1;
    if (level === "excellent" || level === "good") summary.stable += 1;
  }
  return summary;
}

export function computePulseScore(
  post: Pick<Post, "publishedAt" | "tags" | "cover" | "summary" | "preview">,
  health: SourceHealthLevel | null,
  nowMs = Date.now()
): number {
  const time = Date.parse(post.publishedAt);
  const ageHours = Number.isFinite(time) ? Math.max(0, (nowMs - time) / 3_600_000) : 999;
  const recency = Math.max(0, 100 - ageHours * 4);
  const tagBoost = Math.min(18, (post.tags?.length ?? 0) * 3);
  const coverBoost = post.cover ? 6 : 0;
  const summaryLen = (post.summary ?? post.preview ?? "").length;
  const summaryBoost = summaryLen >= 160 ? 6 : summaryLen >= 80 ? 3 : 0;
  const healthBoost =
    health === "excellent" ? 8 : health === "good" ? 4 : health === "warn" ? 0 : health === "down" ? -8 : 0;
  const raw = Math.round(recency + tagBoost + coverBoost + summaryBoost + healthBoost);
  return Math.max(0, Math.min(120, raw));
}

export function computeTimeLensCounts(
  posts: Post[],
  nowMs = Date.now()
): Record<"2h" | "6h" | "24h", number> {
  const counts = { "2h": 0, "6h": 0, "24h": 0 };
  for (const post of posts) {
    const time = Date.parse(post.publishedAt);
    if (!Number.isFinite(time)) continue;
    const diff = nowMs - time;
    if (diff < 0) continue;
    if (diff <= 2 * 60 * 60 * 1000) counts["2h"] += 1;
    if (diff <= 6 * 60 * 60 * 1000) counts["6h"] += 1;
    if (diff <= 24 * 60 * 60 * 1000) counts["24h"] += 1;
  }
  return counts;
}

export function applyDerivedMetrics(posts: Post[], healthMap?: Map<string, SourceHealthInfo>): Post[] {
  const dedupCount = new Map<string, number>();
  const dedupKeys = posts.map((post) => {
    const key = normalizeForDedup(post.titleZh ?? post.titleJa ?? post.title ?? "") || post.id;
    dedupCount.set(key, (dedupCount.get(key) ?? 0) + 1);
    return key;
  });

  const nowMs = Date.now();
  return posts.map((post, idx) => {
    const key = dedupKeys[idx] ?? post.id;
    const health = post.sourceId ? (healthMap?.get(post.sourceId) ?? null) : null;
    const text = `${post.title} ${post.summary ?? post.preview ?? ""}`;
    const readMinutes = post.readMinutes ?? estimateReadMinutes(text);
    const pulseScore = computePulseScore(post, health?.level ?? null, nowMs);
    return {
      ...post,
      dedupKey: key,
      duplicateCount: dedupCount.get(key) ?? 1,
      readMinutes,
      pulseScore,
      sourceHealth: health?.level,
      sourceHealthScore: health?.score ?? 0
    };
  });
}
