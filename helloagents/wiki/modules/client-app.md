# client-app

## 目的
在浏览器端提供“本地优先”的交互与个性化能力，并尽量保证弱网/离线可用。

## 模块概述
- 职责：收藏/已读/过滤/搜索/封面治理/全文预览等交互增强；PWA 与缓存策略协作
- 状态：✅稳定
- 最后更新：2026-01-12

## 规范
### 需求: 弱网与离线体验
场景：用户在网络不稳定或离线时仍希望打开站点并看到最近浏览内容/数据文件。
- 预期结果：Service Worker 对站点资源与数据文件做缓存与回退策略，失败时不影响在线体验。

### 需求: 多级筛选引擎
场景：用户希望在不请求后端的前提下，通过组合条件快速定位内容。
- 预期结果：搜索支持 `tag:` / `source:` / `cat:` / `before:` / `after:` / `is:` 等语法（含 `-` 反选），并与关注词/屏蔽词/已读过滤/来源开关协同。
- 实现要点：查询解析逻辑在页面内过滤与全站搜索 Worker 之间共享，避免行为差异。
- 可访问性：关注词/屏蔽词的“删除”按钮补齐 `aria-label`（含中/日文案），避免仅依赖 `title` 造成读屏歧义。
- 可访问性：偏好面板的即时反馈消息采用 live region（`role="status"` / `aria-live="polite"`），便于读屏及时播报更新。

### 需求: 时间透镜与热度排序
场景：用户需要在不同时间窗内聚焦最新趋势，并按热度优先查看重点内容。
- 预期结果：过滤状态新增 timeLens/sortMode，提供快捷按钮与偏好面板双入口，并持久化到 localStorage；页面内过滤逻辑与 UI 状态保持一致。
- 可访问性：timeLens/sortMode 等快捷 chips 同步写入 `aria-pressed`，让辅助技术可感知 toggle 状态。

### 需求: 布局模式与信息密度（View/Density）
场景：同一批内容在不同用户/设备/场景下需要不同的浏览节奏（桌面端高密度扫读 vs 网格卡片浏览）。
- 预期结果：提供 View Mode（Grid/List）与 Density（Comfort/Compact）两组偏好项，并持久化到 localStorage（`acg.view.v1` / `acg.density.v1`）。
- 表现层约束：布局/密度仅影响展示（CSS 覆盖 + dataset 开关），不改变数据过滤/排序/收藏/已读等核心逻辑。
- 实现要点：偏好项使用独立 key（避免与 filters schema 耦合）；根节点注入 `data-acg-view` / `data-acg-density` 驱动样式切换；localStorage 读写统一走容错工具，避免异常阻断交互。
- 入口补强：首页/分类页提供布局/密度快捷 chip（就地切换）；命令面板新增 `layout` / `density` 相关命令（键盘路径），并在页面缺少控件时回退为“仅保存偏好”提示。
- 可访问性：View/Density 使用 `radiogroup` + roving tabindex，并支持方向键/Home/End 切换（触发 click 复用既有逻辑）。

### 需求: 去重视图与稳定来源
场景：资讯转发噪音和不稳定来源会干扰阅读节奏。
- 预期结果：客户端支持 dedup 与 onlyStableSources 过滤，与派生指标层的去重键与来源健康度联动。

### 需求: 命令面板（Command Palette）
场景：重度用户希望通过键盘快速导航与切换常用开关，而无需频繁移动鼠标或滚动到面板。
- 预期结果：`Ctrl/⌘ + K` 打开命令面板，支持搜索命令（导航/过滤/主题/语言/复制链接等）；命令面板为 lazy chunk，未触发时不影响首屏加载。
- 能力补强：命令面板覆盖 View/Density（布局/密度）切换（含 toggle 与直达设置），确保不离开键盘即可改变阅读节奏。
- 深链补强：支持 `/#search` 聚焦搜索、`/#prefs` 打开偏好设置抽屉、`/#cmdk` 直接打开命令面板（与键盘入口一致）。
- 实现要点：命令面板通过 `acg:toast` 事件桥接复用全局 Toast；剪贴板复制逻辑复用 `src/client/utils/clipboard.ts`（避免重复实现与分叉）；列表支持分组标题与关键词高亮。
- UI 细节：命令面板入场动效与滚动条样式统一；Toast 增加图标与点击消失动画（低性能模式或滚动期自动降级 backdrop blur）。

### 需求: 滚动期流畅度（UI Perf Hints）
场景：在移动端或性能较弱的设备上，滚动时 backdrop-filter/常驻动画更容易导致掉帧与“卡顿感”。
- 预期结果：滚动期自动注入 `data-acg-scroll="1"`，临时禁用固定层/大面积 blur，并暂停 shimmer/占位动效；停止滚动后恢复质感。
- 低成本增强：列表卡片使用 `IntersectionObserver` 打标 `data-acg-inview`，仅用 transform/opacity 做入场层次（`prefers-reduced-motion` 与 `data-acg-perf="low"` 自动关闭）。

### 需求: 全文预览（实验）性能策略
场景：全文预览属于“重型能力”（跨站抓取 + 清洗 + 渲染 + 可选翻译），在移动端更容易造成“卡一下”。
- 预期结果：全文预览为 lazy chunk，仅在详情页存在 `[data-fulltext]` 时加载。
- 预期结果：渲染/翻译的字符串重计算优先由 Web Worker 执行，主线程只做 DOM 注入与 idle 后处理调度；Worker 不可用时回退到主线程实现。
- 预期结果：长文/低性能模式下，DOM 注入采用“块级 HTML（blocks）+ 渐进式追加”：先渲染少量首屏 blocks，其余内容在 idle 中按时间预算分批追加；失败时回退一次性渲染，确保可用性优先。
- 预期结果：为全文预览正文块启用 `content-visibility: auto`（`[data-fulltext-content] > *`），让浏览器跳过离屏块渲染，减少长文滚动时的掉帧与长任务影响（不支持时自动退化）。
- 预期结果：渲染后处理（去壳/图墙治理/链接增强）延后到 idle 执行；在 `data-acg-perf="low"` 下对增强做阈值限制，优先保证滚动与交互。
- 预期结果：自动翻译仅在非低性能模式且非滚动期触发；低性能模式默认不自动翻译（保留手动入口）。

### 需求: 全站搜索预取（60FPS）
场景：本页仅渲染最新/分类的一部分内容，但用户希望在同一个搜索框里检索全量数据，并保持滚动与输入流畅。
- 预期结果：支持在“本页搜索/全站搜索”之间切换；全站模式下优先由 Web Worker 预取/解压 `public/data/search-pack.v2.json(.gz)`（posts 瘦身子集 + 预计算索引），失败回退到 `public/data/search-pack.v1.json(.gz)`，仍失败则回退到 `public/data/posts.json(.gz)` 并在 Worker 内补建索引；IndexedDB 缓存 posts+index（含版本迁移）；支持搜索请求取消与结果截断提示以保证输入/滚动 60FPS；已读变更通过 `acg:read-changed` 触发全站结果刷新；提供 `?` 快捷键提示筛选语法。
- 快捷入口：支持通过 `[data-search-preset]` 一键切换到全站并预填查询（例如分类页 `cat:<category>`），降低学习成本。
- 状态存储：使用 localStorage `acg.search.scope.v1` 记忆用户上次选择的搜索范围。

### 需求: 用户行为埋点（本地优先）
场景：希望在不引入后端复杂度的情况下，获得“可观测性”来定位体验瓶颈。      
- 预期结果：关键交互记录到本地队列；默认不上传，仅在用户显式开启且配置 endpoint 后才尝试 sendBeacon/fetch 上报。

### 需求: 错误与性能观测（Observability）
场景：当出现“卡住/无响应/掉帧/抖动”等体验问题时，需要在不引入后端的前提下获得可回溯线索。
- 预期结果：捕获全局 `error` / `unhandledrejection` 并写入本地 telemetry；采集 TTFB/LCP/CLS/INP（近似）/longtask 等基础指标并在页面隐藏/离开时记录；低性能模式下自动降级采样项与提示频率。
- 隐私约束：默认只本地记录（`acg.telemetry.v1`）；仅当用户显式开启 upload 并设置 http(s) endpoint 时才尝试发送。
- 自助排障：偏好面板提供本地 telemetry 的导出/清空，并显示事件数与占用体积。
- 自助排障：提供 Telemetry Viewer 页面（`/zh/telemetry/` / `/ja/telemetry/`），用于本机可视化查看与筛选事件。
- 实现要点：错误提示走 `acg:toast` 事件桥接（轻提示 + 去重/节流）；性能观测通过 `PerformanceObserver` 惰性注册并可降级。

## 依赖
- `src/client/app.ts`
- `src/client/constants.ts`
- `src/client/state/storage.ts`
- `src/client/utils/virtual-grid.ts`
- `src/lib/metrics.ts`
- `src/lib/format.ts`
- `src/lib/search/query.ts`
- `src/lib/search/pack.ts`
- `src/client/workers/search.worker.ts`
- `src/client/workers/fulltext.worker.ts`
- `src/client/features/cmdk.ts`
- `src/client/features/fulltext.ts`
- `src/client/features/telemetry-prefs.ts`
- `src/client/utils/http.ts`
- `src/client/utils/monitoring.ts`
- `src/client/utils/telemetry.ts`
- `public/sw.js`
