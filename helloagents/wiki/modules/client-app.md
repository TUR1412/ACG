# client-app

## 目的
在浏览器端提供“本地优先”的交互与个性化能力，并尽量保证弱网/离线可用。

## 模块概述
- 职责：收藏/已读/过滤/搜索/封面治理/全文预览等交互增强；PWA 与缓存策略协作
- 状态：✅稳定
- 最后更新：2025-12-27

## 规范
### 需求: 弱网与离线体验
场景：用户在网络不稳定或离线时仍希望打开站点并看到最近浏览内容/数据文件。
- 预期结果：Service Worker 对站点资源与数据文件做缓存与回退策略，失败时不影响在线体验。

### 需求: 多级筛选引擎
场景：用户希望在不请求后端的前提下，通过组合条件快速定位内容。
- 预期结果：搜索支持 `tag:` / `source:` / `cat:` / `before:` / `after:` / `is:` 等语法（含 `-` 反选），并与关注词/屏蔽词/已读过滤/来源开关协同。

### 需求: 全站搜索预取（60FPS）
场景：本页仅渲染最新/分类的一部分内容，但用户希望在同一个搜索框里检索全量数据，并保持滚动与输入流畅。
- 预期结果：支持在“本页搜索/全站搜索”之间切换；全站模式下优先由 Web Worker 预取/解压 `public/data/search-pack.v1.json(.gz)`（posts + 预计算索引行），必要时回退到 `public/data/posts.json(.gz)` 并在 Worker 内补建索引；IndexedDB 缓存 posts+index（含版本迁移）；支持搜索请求取消与结果截断提示以保证输入/滚动 60FPS；已读变更通过 `acg:read-changed` 触发全站结果刷新；提供 `?` 快捷键提示筛选语法。
- 状态存储：使用 localStorage `acg.search.scope.v1` 记忆用户上次选择的搜索范围。

### 需求: 用户行为埋点（本地优先）
场景：希望在不引入后端复杂度的情况下，获得“可观测性”来定位体验瓶颈。
- 预期结果：关键交互记录到本地队列；默认不上传，仅在用户显式开启且配置 endpoint 后才尝试 sendBeacon/fetch 上报。

## 依赖
- `src/client/app.ts`
- `src/client/workers/search.worker.ts`
- `src/client/features/fulltext.ts`
- `src/client/utils/http.ts`
- `src/client/utils/telemetry.ts`
- `public/sw.js`

