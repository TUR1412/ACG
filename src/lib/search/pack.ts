import type { Post } from "../types";
import { normalizeText } from "./query";

export type SearchPackIndexRow = {
  /** 索引：对应 posts[i] */
  i: number;
  hay: string;
  tags: string[];
  sourceName: string;
  sourceId: string;
  sourceIdNorm: string;
  category: string;
  publishedAtMs: number | null;
};

export type SearchPackV1 = {
  v: 1;
  generatedAt: string;
  posts: Post[];
  index: SearchPackIndexRow[];
};

export function buildSearchIndex(posts: Post[]): SearchPackIndexRow[] {
  const index: SearchPackIndexRow[] = [];

  for (let i = 0; i < posts.length; i += 1) {
    const post = posts[i];
    const tags = (post.tags ?? []).map((t) => normalizeText(t)).filter(Boolean);
    const sourceName = normalizeText(post.sourceName);
    const sourceId = post.sourceId ?? "";
    const sourceIdNorm = normalizeText(sourceId);
    const category = normalizeText(post.category);
    const ts = post.publishedAt ? Date.parse(post.publishedAt) : NaN;
    const publishedAtMs = Number.isFinite(ts) ? ts : null;

    const hay = normalizeText(
      [
        post.title,
        post.titleZh ?? "",
        post.titleJa ?? "",
        post.summary ?? "",
        post.summaryZh ?? "",
        post.summaryJa ?? "",
        post.preview ?? "",
        post.previewZh ?? "",
        post.previewJa ?? "",
        tags.join(" "),
        sourceName,
        sourceIdNorm,
        category
      ].join(" ")
    );

    index.push({ i, hay, tags, sourceName, sourceId, sourceIdNorm, category, publishedAtMs });
  }

  return index;
}

export function buildSearchPack(posts: Post[], generatedAt: string): SearchPackV1 {
  return { v: 1, generatedAt, posts, index: buildSearchIndex(posts) };
}

export function normalizeSearchPackIndexRow(value: unknown, maxPosts: number): SearchPackIndexRow | null {
  if (!value || typeof value !== "object") return null;
  const it = value as any;

  const iRaw = typeof it.i === "number" ? it.i : NaN;
  const i = Number.isFinite(iRaw) ? Math.floor(iRaw) : NaN;
  if (!Number.isFinite(i) || i < 0 || i >= maxPosts) return null;

  const hay = typeof it.hay === "string" ? normalizeText(it.hay) : "";
  if (!hay) return null;

  const tags = Array.isArray(it.tags)
    ? it.tags
        .filter((x: unknown) => typeof x === "string")
        .map((t: string) => normalizeText(t))
        .filter(Boolean)
    : [];

  const sourceName = typeof it.sourceName === "string" ? normalizeText(it.sourceName) : "";
  const sourceId = typeof it.sourceId === "string" ? it.sourceId : "";
  const sourceIdNorm =
    typeof it.sourceIdNorm === "string" ? normalizeText(it.sourceIdNorm) : normalizeText(sourceId);
  const category = typeof it.category === "string" ? normalizeText(it.category) : "";

  const pRaw = typeof it.publishedAtMs === "number" ? it.publishedAtMs : NaN;
  const publishedAtMs = Number.isFinite(pRaw) ? pRaw : null;

  return { i, hay, tags, sourceName, sourceId, sourceIdNorm, category, publishedAtMs };
}

