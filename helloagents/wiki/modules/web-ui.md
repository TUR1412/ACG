# web-ui

## 目的
负责页面与组件的静态渲染，提供多语言路由、订阅导出与可访问的 UI 结构。

## 模块概述
- 职责：Astro 页面/组件渲染、RSS/JSON Feed/OPML 输出、SEO 元信息、布局与导航
- 状态：✅稳定
- 最后更新：2026-01-13

## 规范
### 需求: 订阅导出兼容
场景：用户希望将来源一键导入阅读器或程序消费信息流。
- 预期结果：提供 RSS（已有）+ JSON Feed + OPML，且中日双语路由一致。

### 需求: 视觉系统令牌化
场景：站点持续迭代时希望保持一致的排版、栅格与阴影层级，不再“每个页面手调一套”。
- 预期结果：栅格（gutter/gap）、排版尺度（黄金比例）与阴影层级（e1..e12）在全局可复用，并可通过 Tailwind utilities（如 `shadow-e*` / `text-phi-*` / `gap-grid` / `px-gutter`）与语义类（如 `.acg-grid-12` / `.acg-col-span-*` / `.acg-elev-*`）直接使用；玻璃与边框动效参数通过 CSS 变量统一调参；对低性能/省流量设备自动注入 `data-acg-perf="low"` 启用视觉降级，保证滚动与输入更稳定。

### 需求: 布局模式与信息密度（View/Density）
场景：用户希望在桌面端也能自由切换“网格卡片浏览”与“列表式高密度扫读”，并按场景选择更紧凑的排版密度。
- 预期结果：偏好设置中提供 View Mode（Grid/List）与 Density（Comfort/Compact）两组入口；默认保持现有网格与舒适密度。
- 实现要点：通过根节点 `data-acg-view` / `data-acg-density` 驱动样式覆盖（最小侵入），避免修改页面/组件的核心结构；切换仅影响表现层，不改变业务逻辑根基。
- 入口补强：首页/分类页的 chip 区域提供 View/Density 快捷按钮（含 Grid/List 图标），降低切换成本；与命令面板入口保持一致，形成“鼠标/触屏 + 键盘”双路径。

### 需求: Telemetry 偏好与自助排障
场景：静态站缺少后端监控，需要在不引入第三方 SDK 的前提下自助回溯错误/性能线索，并保持隐私可控。
- 预期结果：偏好面板提供上报开关/endpoint，以及本地 telemetry 的事件数/体积展示与导出/清空入口。
- 入口补强：提供 Telemetry Viewer 页面（`/zh/telemetry/` / `/ja/telemetry/`），用于本机可视化查看与筛选事件。

### 需求: Friendly 404
场景：用户打开旧链接/错误链接时，需要明确的“下一步”引导，而不是空白页或难以理解的默认 404。
- 预期结果：生成 `404.html`（语言选择 + 快捷入口），并尽量降低迷路成本。
- 实现要点：通过 `src/pages/404.astro` 生成 `dist/404.html`；链接统一走 `href()` 适配 GitHub Pages base path。

### 需求: Atomic UI（Atomic Design）
场景：信息流页面的 chips/按钮标记重复，后续做视觉与交互升级时成本偏高、容易不一致。
- 预期结果：按 Atomic Design 分层：
  - `src/components/atoms/`：最小 UI 原子（Chip / Segmented / Icon 等）
  - `src/components/molecules/`：组合型组件（例如徽章）
  - `src/components/organisms/`：页面级/模块级组件（卡片、面板、网格等）
  - `src/components/*.astro`：兼容入口（薄封装），用于保持既有 import 路径稳定，符合“开闭原则”的增量演进策略
- 可维护性约束：采用增量替换策略，避免一次性大重构带来风险；优先通过“新增目录 + 兼容层”的方式迁移。
- 可访问性约束：分段控件遵循 `role="radiogroup"` / `role="radio"` 语义，并支持 roving tabindex + 方向键切换（提升键盘路径体验）。

### 需求: 首页信号板与洞察
场景：首页首屏需要在不滚动的情况下给出趋势概览，并提供一键可执行的快捷动作。
- 预期结果：SignalBoard 汇总脉冲热榜、时间透镜计数、来源健康度与快捷动作（热度排序/稳定来源/去重视图），缺少数据时仍能提示状态与下一步。

### 需求: 卡片元信息与阅读节奏
场景：用户在信息流中需要快速判断“热度/阅读成本/重复量/来源可信度”。
- 预期结果：卡片显示热度分、预计阅读时长、重复计数与来源健康度徽章；在低性能模式下保持信息层级清晰、避免冗余动效。

### 需求: 无障碍与键盘路径
场景：键盘用户或使用辅助技术的用户希望快速跳过导航并进入主内容。
- 预期结果：提供 Skip Link（跳到主要内容），并为 `<main>` 提供稳定锚点 `id="main"`（可聚焦），与全局 `:focus-visible` 样式一致。
- A11y 细节：Quick chips 同步写入 `aria-pressed`；偏好面板提示消息使用 live region（`role="status"` / `aria-live="polite"`）；词条删除动作补齐 `aria-label` 语义。

### 需求: 分类页首屏性能（体积）
场景：分类页静态渲染条目较多时，HTML 体积会显著上升并影响移动端加载/解析成本。
- 预期结果：分类页默认仅渲染“最新一段”（例如 36 条）以降低 HTML 体积；同时提供“一键切换到全站搜索并自动套用 `cat:<category>` 过滤”的入口，保证用户可达全量内容。

### 需求: 首屏 LCP 稳定性（Spotlight/封面）
场景：部分来源封面为外链（第三方域），在移动端/模拟网络下容易引入不可预测的加载波动，导致 Lighthouse/LHCI 的 LCP 漂移；同时 Spotlight 模块通常位于首屏下方，不应参与首屏渲染竞争。
- 预期结果：在不破坏既有“封面加载/重试/占位”逻辑根基的前提下，让首屏渲染更可预测，避免 LCP 被下方大块内容拖慢。
- 实现要点：
  - Spotlight 容器启用 `content-visibility: auto`（配合 `contain-intrinsic-size`），使离屏内容不参与首屏渲染/合成。
  - 首页/随机推荐等大图封面：SSR 仅在 cover 已解析为本地静态路径时输出 `<img>`；外链封面改为占位背景，仍由封面加载器在客户端渐进增强。

### 需求: 详情页体积优化（相关推荐）
场景：在“生成大量详情页（数千页）”的构建模式下，详情页 SSR 输出的“相关推荐”区域会放大 HTML 与 dist 总体积，导致 perf-budget 在有生成数据时不稳定。
- 预期结果：在不改变业务逻辑（相关推荐仍可用）的前提下，提供更轻的展示变体，降低详情页 HTML 体积与构建产物体积波动。
- 实现要点：`PostList` 增加 `variant="compact"`（默认仍为 card），相关推荐使用 compact 变体配合 `PostLinkItem` 输出轻量条目。

### 需求: 弹层与微交互一致性
场景：Toast / Command Palette 等浮层需要“商业级”视觉反馈，同时在低性能设备上避免不必要开销。
- 预期结果：命令面板支持分组标题、关键词高亮与滚动条样式；Toast 提供 variant 图标、hover 阴影与点击消失动画；在 `data-acg-perf="low"` 或滚动期 `data-acg-scroll="1"` 下自动禁用 backdrop blur 等高开销效果，并暂停 shimmer/占位动画以保证滚动稳定。

### 需求: 页面转场动效
场景：在页面跳转时获得更连贯的阅读节奏，并兼容不支持新 API 的浏览器。
- 预期结果：支持 View Transitions 动效；不支持时降级到 WAAPI 的淡入淡出，且遵循 prefers-reduced-motion；动效以 opacity/transform 为主，避免 filter blur 造成合成开销。

### 需求: 状态页可观测性（来源级）
场景：当来源偶发失败/解析波动时，需要在静态站内快速定位原因，而不依赖 CI 日志全文排查。
- 预期结果：`/status` 展示来源级重试指标（attempts/waitMs）与解析统计（raw/filtered），帮助快速判断“网络波动 vs 解析失效”。

### 需求: 状态页趋势（近 7/30 轮）
场景：单次 status 只能看到“这一轮”，但排障更需要趋势：偶发波动 vs 持续异常、来源停更 vs 抓取失败等。
- 预期结果：同步管线生成 `status-history.v1.json(.gz)`（回读上一轮并追加裁剪），`/status` 页面以静态 SVG sparkline + 指标卡展示近 7/30 轮趋势（成功率/异常来源数/新增条目）；历史不足时提示“至少需要 2 轮记录”。

## 依赖
- `tailwind.config.ts`
- `src/styles/global.css`
- `src/layouts/SiteLayout.astro`
- `src/pages/*`
- `src/components/atoms/*`
- `src/components/molecules/*`
- `src/components/organisms/*`
- `src/components/*.astro`
- `src/lib/feeds.ts`
- `src/lib/source-config.ts`
