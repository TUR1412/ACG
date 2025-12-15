import type { Category } from "../../src/lib/categories";

export type SourceKind = "feed" | "html";

export type Source = {
  id: string;
  name: string;
  kind: SourceKind;
  url: string;
  homepage?: string;
  category: Category;
  include?: (item: { title: string; summary?: string; url: string }) => boolean;
};

export type RawItem = {
  title: string;
  url: string;
  publishedAt: string;
  summary?: string;
  cover?: string;
};

