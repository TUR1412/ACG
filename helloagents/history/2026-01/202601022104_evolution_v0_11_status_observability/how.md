# 技术设计: evolution_v0_11_status_observability

## 1) 抓取请求可观测性（attempts / waitMs）
在 `scripts/lib/http-cache.ts` 中对 `fetchTextWithCache()` 增强：
- 记录本次请求的 `attempts`（实际尝试次数）。
- 记录重试退避的累计等待 `waitMs`（含 jitter）。
- 304 场景下也刷新缓存条目的时间戳（用于表示“最近一次验证成功”）。

输出作为 `FetchResult` 的新增字段（不改变既有字段含义）。

## 2) status.json 扩展字段
在 `scripts/sync.ts` 的 `runSource()` 中：
- 将 `fetchTextWithCache` 的 `attempts/waitMs` 写入 `SourceStatus`。
- 解析阶段追加：
  - `rawItemCount`: 解析器输出条目数
  - `filteredItemCount`: include 过滤后的条目数

这些字段用于状态页诊断，不影响 posts 产物与站点主功能。

## 3) 状态页 UI 展示
在 `src/pages/zh/status.astro` 与 `src/pages/ja/status.astro` 中：
- 表格新增“重试/等待”列（attempts 与 waitMs）。
- 表格新增“解析”列（raw/filtered/itemCount）。
- 对缺失字段统一显示 `-`，保证兼容。

## 4) 类型与校验同步
- `src/lib/types.ts` 扩展 `SourceStatus` 类型，字段以可选形式引入，确保兼容性。
- `scripts/validate-generated-data.ts` 对新增字段做轻量校验（存在则必须是 number）。

## 5) 验证
- `npm run check`
- `npm run sync -- --days 3 --limit 400`（可配合最小化环境变量）
- `npm run validate`
- `npm run build`（`ACG_BASE=/ACG`）
- `npm run budget`

