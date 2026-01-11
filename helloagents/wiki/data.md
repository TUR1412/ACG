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
- `pulseScore?`: number（派生热度分）
- `readMinutes?`: number（派生阅读时长，分钟）
- `dedupKey?`: string（派生去重键）
- `duplicateCount?`: number（重复计数）
- `sourceHealth?`: "excellent" | "good" | "warn" | "down"（来源健康度等级）
- `sourceHealthScore?`: number（来源健康度评分）

## SearchPack（全站搜索包）

由同步脚本在构建期生成，用于浏览器侧全站搜索 Worker 快速加载（无需运行时全量扫描 posts 并重复构建索引）。

字段（与 `src/lib/search/pack.ts` 保持一致）：
- `v`: 1 | 2
- `generatedAt`: string
- `posts`: Post[]
- `index`: SearchPackIndexRow[]

差异（以“更稳更轻”为目标）：
- v1：直接基于同步产物 posts 生成（字段完整、体积更大）。
- v2：为搜索/渲染瘦身：去掉 preview*，并将 `summary* = summary* ?? preview*`（统一展示文案字段），减少体积并改善首载；Worker 默认优先 v2，失败回退 v1。

SearchPackIndexRow：
- `i`: number（索引：对应 `posts[i]`）
- `hay`: string（归一化后的可检索文本）
- `tags`: string[]
- `sourceName`: string
- `sourceId`: string
- `sourceIdNorm`: string
- `category`: string
- `publishedAtMs`: number|null

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
- `newItemCount?`: number（相对上一轮 remote posts 的新增条目数）
- `visibleItemCount?`: number（最终产物中该来源条目数）
- `latestPublishedAt?`: string（最终产物中该来源最新一条发布时间）
- `consecutiveFails?`: number（连续失败次数，成功归零）
- `used`: "fetched" | "cached" | "fallback"
- `attempts?`: number（抓取尝试次数，含首次）
- `waitMs?`: number（重试退避累计等待，含 jitter）
- `rawItemCount?`: number（解析器输出的原始条目数，过滤前）
- `filteredItemCount?`: number（include 过滤后的条目数）
- `error?`: string

### 同步管线参数（Env）
- `ACG_SOURCE_CONCURRENCY`：来源抓取并发数（默认 `3`，范围 `1..8`）。
  - 并发开启时：抓取阶段仅更新内存中的 `.cache/http.json`（etag/last-modified/lastOkAt 等），阶段结束统一落盘，避免并发写入竞态并减少 IO。

## StatusHistory（状态趋势）

用于把每次同步的汇总指标累积为时间序列，以便在 `/status` 展示近 7/30 轮趋势。

StatusHistoryV1 字段（与 `src/lib/types.ts` 保持一致）：
- `v`: 1
- `generatedAt`: string|null
- `entries`: StatusHistoryEntry[]

StatusHistoryEntry：
- `generatedAt`: string
- `durationMs`: number
- `totalSources` / `okSources` / `errSources`: number
- `totalItems` / `totalNewItems`: number
- `flakySources`: number
- `staleSources`: number
- `parseEmpty` / `parseDrop`: number

