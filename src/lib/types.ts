import type { Category } from "./categories";

export type Post = {
  id: string;
  title: string;
  summary?: string;
  url: string;
  publishedAt: string;
  cover?: string;
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

