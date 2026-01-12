# pipeline-sync

## 目的
在 CI 或本地执行抓取与清洗，将外部来源转为站点可消费的静态 JSON 产物。

## 模块概述
- 职责：拉取来源（RSS/HTML）→ 去重排序 → 补图/预览增强 → 翻译字段（限量）→ 生成搜索包/状态趋势 → 写入 `src/data/generated` 与 `public/data`
- 状态：✅稳定
- 最后更新：2026-01-12

## 规范
### 需求: 同步管线可验证
场景：每小时执行同步后，产物结构与关键不变量必须满足约束；否则阻断部署并暴露错误。
- 预期结果：`npm run validate` 在 CI 中对数据结构做强校验，失败即退出并阻止部署。

### 需求: 同步日志可读性（CI 友好）
场景：同步管线在 GitHub Actions 中运行时，需要日志更易读、更可定位问题，并尽量减少“翻半天纯文本”的排障成本。
- 预期结果：提供轻量 logger（支持分组与 annotations），并在关键脚本中统一使用，提升 CI 可观测性。

### 需求: 来源适配可扩量（插件式）
场景：来源数量扩展后，不应在同步主流程中出现“按 source.id 特判”的维护负担。
- 预期结果：HTML 来源解析器按 `source.id` 注册到统一入口；同步主流程通过统一解析函数路由到对应解析器。

### 需求: URL 规范化（去追踪参数）
场景：同一新闻在不同入口携带 `utm_*` / `fbclid` 等追踪参数，导致重复条目与去重失败。
- 预期结果：同步阶段对 URL 做规范化：
  - 仅允许 `http(s)` 协议（非 http(s) 直接丢弃，避免安全与数据污染）
  - 保守剥离常见追踪参数，提升去重与数据质量。

### 需求: 抓取稳定性（保守重试 + jitter）
场景：整点触发时可能遇到瞬时网络抖动、429/5xx 等，导致来源误报失败。
- 预期结果：对可重试失败做少量重试并加入 jitter 退避；失败仍可回退到缓存/历史数据，不影响全站部署。
- 预期结果：来源抓取支持有限并发（`ACG_SOURCE_CONCURRENCY`，默认 `3`），降低整轮同步耗时与整点波动；抓取阶段仅更新内存 http cache，结束后统一落盘，避免并发写入竞态并减少 IO。
- 预期结果：当解析输出为空（`parse_empty`）或解析输出明显异常缩水（`parse_drop`）时，保守回退上一轮数据，避免“静默停更”；其中 `parse_drop` 判定基于解析前的 `rawItemCount`，避免带 `include` 的来源因过滤后条目较少而误触发 fallback。

### 需求: 状态页可观测性（重试/解析统计）
场景：来源偶发失败或解析器受页面结构影响时，需要快速判断“是否重试、重试成本、解析产出是否异常”。
- 预期结果：`status.json` 为每个来源记录抓取 `attempts/waitMs` 与解析 `rawItemCount/filteredItemCount`，状态页可直接展示用于排障。

### 需求: 状态趋势可追溯（status-history）
场景：仅看“本轮 status”难以判断近期是否持续波动/持续失败/长期停更，需要趋势视角辅助排障。
- 预期结果：同步阶段生成 `status-history.v1.json(.gz)`（回读上一轮并追加裁剪），状态页可展示最近 7/30 轮趋势。

## 依赖
- `scripts/sync.ts`
- `scripts/lib/*`
- `scripts/sources/*`
- `src/lib/source-config.ts`（来源配置 SSOT）
- `src/lib/search/pack.ts`（search-pack 构建与索引生成的共享实现）

## 产物
- `src/data/generated/posts.json` / `public/data/posts.json(.gz)`
- `src/data/generated/status.json` / `public/data/status.json(.gz)`
- `src/data/generated/status-history.v1.json` / `public/data/status-history.v1.json(.gz)`（状态趋势：按每次同步聚合）
- `src/data/generated/search-pack.v1.json` / `public/data/search-pack.v1.json(.gz)`（全站搜索包 v1：posts + 预计算索引）
- `src/data/generated/search-pack.v2.json` / `public/data/search-pack.v2.json(.gz)`（全站搜索包 v2：面向 Worker 的瘦身产物，优先加载）

## 质量门禁
- `npm run validate`：结构与关键不变量校验（失败阻断部署）
- `npm run budget`：`dist/` 体积预算门禁（入口页 vs 数据载荷）
  - `html/xml/json(core)`：不计入 `dist/data/*.json`
  - `data.json`：`dist/data/*.json`（默认仅观测；可用 `ACG_BUDGET_DATA_JSON_KB` 启用门禁）
  - `data.gz`：`dist/data/*.json.gz`
