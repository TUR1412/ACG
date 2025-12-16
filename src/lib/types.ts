import type { Category } from "./categories";

export type Post = {
  id: string;
  title: string;
  summary?: string;
  /** 文章预览（严格截断，不是全文） */
  preview?: string;
  url: string;
  publishedAt: string;
  cover?: string;
  /** 原始封面地址（当 cover 被替换为本地缓存时保留） */
  coverOriginal?: string;
  category: Category;
  tags: string[];
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
};

export type SourceStatus = {
  id: string;
  name: string;
  kind: string;
  url: string;
  ok: boolean;
  httpStatus?: number;
  durationMs: number;
  fetchedAt?: string;
  itemCount: number;
  used: "fetched" | "cached" | "fallback";
  error?: string;
};

export type SyncStatus = {
  generatedAt: string | null;
  durationMs: number;
  sources: SourceStatus[];
};
