import type { Post } from "../../src/lib/types";

export function groupBySource(posts: Post[]): Map<string, Post[]> {
  const map = new Map<string, Post[]>();
  for (const p of posts) {
    const list = map.get(p.sourceId) ?? [];
    list.push(p);
    map.set(p.sourceId, list);
  }
  return map;
}

export function dedupeAndSort(posts: Post[]): Post[] {
  const byUrl = new Map<string, Post>();
  for (const p of posts) {
    const key = p.url.toLowerCase();
    const existing = byUrl.get(key);
    if (!existing) {
      byUrl.set(key, p);
      continue;
    }
    const existingScore = (existing.summary?.length ?? 0) + (existing.cover ? 20 : 0);
    const nextScore = (p.summary?.length ?? 0) + (p.cover ? 20 : 0);
    byUrl.set(key, nextScore >= existingScore ? p : existing);
  }
  return [...byUrl.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function filterByDays(posts: Post[], days: number): Post[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return posts.filter((p) => {
    const time = new Date(p.publishedAt).getTime();
    return Number.isFinite(time) && time >= cutoff;
  });
}
