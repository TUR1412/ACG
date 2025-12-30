# client-app

## 目的
在浏览器端提供“本地优先”的交互与个性化能力，并尽量保证弱网/离线可用。

## 模块概述
- 职责：收藏/已读/过滤/搜索/封面治理/全文预览等交互增强；PWA 与缓存策略协作
- 状态：✅稳定
- 最后更新：2025-12-29

## 规范
### 需求: 弱网与离线体验
场景：用户在网络不稳定或离线时仍希望打开站点并看到最近浏览内容/数据文件。
- 预期结果：Service Worker 对站点资源与数据文件做缓存与回退策略，失败时不影响在线体验。

### 需求: 多级筛选引擎
场景：用户希望在不请求后端的前提下，通过组合条件快速定位内容。
- 预期结果：搜索支持 `tag:` / `source:` / `cat:` / `before:` / `after:` / `is:` 等语法（含 `-` 反选），并与关注词/屏蔽词/已读过滤/来源开关协同。
- 实现要点：查询解析逻辑在页面内过滤与全站搜索 Worker 之间共享，避免行为差异。

### 需求: 命令面板（Command Palette）
场景：重度用户希望通过键盘快速导航与切换常用开关，而无需频繁移动鼠标或滚动到面板。
- 预期结果：`Ctrl/⌘ + K` 打开命令面板，支持搜索命令（导航/过滤/主题/语言/复制链接等）；命令面板为 lazy chunk，未触发时不影响首屏加载。
- 深链补强：支持 `/#search` 聚焦搜索、`/#prefs` 打开偏好设置抽屉、`/#cmdk` 直接打开命令面板（与键盘入口一致）。
- 实现要点：命令面板通过 `acg:toast` 事件桥接复用全局 Toast；剪贴板复制逻辑复用 `src/client/utils/clipboard.ts`（避免重复实现与分叉）；列表支持分组标题与关键词高亮。
- UI 细节：命令面板入场动效与滚动条样式统一；Toast 增加图标与点击消失动画（低性能模式或滚动期自动降级 backdrop blur）。

### 需求: 滚动期流畅度（UI Perf Hints）
场景：在移动端或性能较弱的设备上，滚动时 backdrop-filter/常驻动画更容易导致掉帧与“卡顿感”。
- 预期结果：滚动期自动注入 `data-acg-scroll="1"`，临时禁用固定层/大面积 blur，并暂停 shimmer/占位动效；停止滚动后恢复质感。
- 低成本增强：列表卡片使用 `IntersectionObserver` 打标 `data-acg-inview`，仅用 transform/opacity 做入场层次（`prefers-reduced-motion` 与 `data-acg-perf="low"` 自动关闭）。

### 需求: 全站搜索预取（60FPS）
场景：本页仅渲染最新/分类的一部分内容，但用户希望在同一个搜索框里检索全量数据，并保持滚动与输入流畅。
- 预期结果：支持在“本页搜索/全站搜索”之间切换；全站模式下优先由 Web Worker 预取/解压 `public/data/search-pack.v1.json(.gz)`（posts + 预计算索引行），必要时回退到 `public/data/posts.json(.gz)` 并在 Worker 内补建索引；IndexedDB 缓存 posts+index（含版本迁移）；支持搜索请求取消与结果截断提示以保证输入/滚动 60FPS；已读变更通过 `acg:read-changed` 触发全站结果刷新；提供 `?` 快捷键提示筛选语法。
- 状态存储：使用 localStorage `acg.search.scope.v1` 记忆用户上次选择的搜索范围。

### 需求: 用户行为埋点（本地优先）
场景：希望在不引入后端复杂度的情况下，获得“可观测性”来定位体验瓶颈。
- 预期结果：关键交互记录到本地队列；默认不上传，仅在用户显式开启且配置 endpoint 后才尝试 sendBeacon/fetch 上报。

## 依赖
- `src/client/app.ts`
- `src/lib/search/query.ts`
- `src/lib/search/pack.ts`
- `src/client/workers/search.worker.ts`
- `src/client/features/cmdk.ts`
- `src/client/features/fulltext.ts`
- `src/client/utils/http.ts`
- `src/client/utils/telemetry.ts`
- `public/sw.js`

