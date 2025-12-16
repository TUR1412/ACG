import type { Post } from "./types";
import type { Category } from "./categories";

type Adjacent = { newer?: Post; older?: Post };

export function createRecommender(posts: Post[]) {
  const byCategory = new Map<Category, Post[]>();
  const indexByCategory = new Map<Category, Map<string, number>>();
  for (const post of posts) {
    const list = byCategory.get(post.category) ?? [];
    list.push(post);
    byCategory.set(post.category, list);
  }

  // build index maps (O(n))
  for (const [category, list] of byCategory.entries()) {
    const map = new Map<string, number>();
    for (let i = 0; i < list.length; i += 1) map.set(list[i].id, i);
    indexByCategory.set(category, map);
  }

  const getAdjacent = (post: Post): Adjacent => {
    const list = byCategory.get(post.category) ?? [];
    const idx = indexByCategory.get(post.category)?.get(post.id) ?? -1;
    if (idx < 0) return {};
    return { newer: list[idx - 1], older: list[idx + 1] };
  };

  const getRelated = (post: Post, limit = 6): Post[] => {
    const list = byCategory.get(post.category) ?? [];
    if (list.length <= 1) return [];

    const idx = indexByCategory.get(post.category)?.get(post.id) ?? -1;
    const center = idx >= 0 ? idx : 0;
    const windowRadius = 40;
    const start = Math.max(0, center - windowRadius);
    const end = Math.min(list.length, center + windowRadius + 1);
    const windowList = list.slice(start, end).filter((p) => p.id !== post.id);

    const tagSet = new Set((post.tags ?? []).filter(Boolean).map((t) => t.toLowerCase()));
    const now = Date.now();

    const scored = windowList.map((p) => {
      let score = 0;
      if (p.sourceId === post.sourceId) score += 4;
      if (p.cover) score += 0.8;
      if (p.summary) score += 0.2;

      if (tagSet.size > 0 && p.tags?.length) {
        for (const t of p.tags) {
          if (!t) continue;
          if (tagSet.has(t.toLowerCase())) score += 1;
        }
      }

      const t = new Date(p.publishedAt).getTime();
      if (Number.isFinite(t)) {
        const days = Math.max(0, (now - t) / (24 * 60 * 60 * 1000));
        // 越接近“当前资讯”，越像“继续阅读”
        score += Math.max(0, 1.2 - days / 10);
      }

      return { post: p, score };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.post.publishedAt.localeCompare(a.post.publishedAt);
    });

    return scored.slice(0, Math.max(0, limit)).map((x) => x.post);
  };

  return { getAdjacent, getRelated };
}
