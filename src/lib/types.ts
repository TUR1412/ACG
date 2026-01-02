import type { Category } from "./categories";

export type Post = {
  id: string;
  title: string;
  /** 中文翻译标题（用于 /zh 路由显示） */
  titleZh?: string;
  /** 日文翻译标题（用于 /ja 路由显示） */
  titleJa?: string;
  summary?: string;
  /** 文章预览（严格截断，不是全文） */
  preview?: string;
  previewZh?: string;
  previewJa?: string;
  summaryZh?: string;
  summaryJa?: string;
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
  /** 本轮相对上一轮 remote posts 的新增条目数（按 post.id 去重） */
  newItemCount?: number;
  /** 最终产物（pruned posts）中该来源条目数（用于解释“抓取条目数 vs 可见条目数”差异） */
  visibleItemCount?: number;
  /** 最终产物（pruned posts）中该来源最新一条的发布时间 */
  latestPublishedAt?: string;
  /** 连续失败次数（成功则归零；依赖回读上一轮 remote status） */
  consecutiveFails?: number;
  used: "fetched" | "cached" | "fallback";
  /** 抓取本次实际尝试次数（含首次） */
  attempts?: number;
  /** 抓取重试退避累计等待（毫秒，含 jitter） */
  waitMs?: number;
  /** 解析器输出的原始条目数（过滤前） */
  rawItemCount?: number;
  /** include 过滤后的条目数（生成 posts 前） */
  filteredItemCount?: number;
  error?: string;
};

export type SyncStatus = {
  generatedAt: string | null;
  durationMs: number;
  sources: SourceStatus[];
};
