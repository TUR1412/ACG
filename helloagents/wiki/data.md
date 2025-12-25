# 数据模型

## 概述
站点核心数据由同步脚本生成，为纯 JSON 文件，供 Astro 构建与浏览器运行时使用。

## Post（资讯条目）

字段（与 `src/lib/types.ts` 保持一致）：
- `id`: string（全局唯一）
- `title`: string（原标题）
- `titleZh?` / `titleJa?`: string（翻译标题）
- `summary?`: string（来源摘要）
- `preview?`: string（预览，严格截断）
- `previewZh?` / `previewJa?`: string（翻译预览）
- `summaryZh?` / `summaryJa?`: string（翻译摘要）
- `url`: string（原文链接）
- `publishedAt`: string（ISO 时间）
- `cover?`: string（封面 URL / 本地缓存 URL）
- `coverOriginal?`: string（原始封面 URL）
- `category`: enum（见 `src/lib/categories.ts`）
- `tags`: string[]
- `sourceId`: string（来源 ID）
- `sourceName`: string
- `sourceUrl`: string（来源 feed/list URL）

## SyncStatus（同步状态）

字段（与 `src/lib/types.ts` 保持一致）：
- `generatedAt`: string|null
- `durationMs`: number
- `sources`: SourceStatus[]

SourceStatus：
- `id` / `name` / `kind` / `url`
- `ok`: boolean
- `httpStatus?`: number
- `durationMs`: number
- `fetchedAt?`: string
- `itemCount`: number
- `used`: "fetched" | "cached" | "fallback"
- `error?`: string

