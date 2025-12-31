# web-ui

## 目的
负责页面与组件的静态渲染，提供多语言路由、订阅导出与可访问的 UI 结构。

## 模块概述
- 职责：Astro 页面/组件渲染、RSS/JSON Feed/OPML 输出、SEO 元信息、布局与导航
- 状态：✅稳定
- 最后更新：2025-12-31

## 规范
### 需求: 订阅导出兼容
场景：用户希望将来源一键导入阅读器或程序消费信息流。
- 预期结果：提供 RSS（已有）+ JSON Feed + OPML，且中日双语路由一致。

### 需求: 视觉系统令牌化
场景：站点持续迭代时希望保持一致的排版、栅格与阴影层级，不再“每个页面手调一套”。
- 预期结果：栅格（gutter/gap）、排版尺度（黄金比例）与阴影层级（e1..e12）在全局可复用，并可通过 Tailwind utilities（如 `shadow-e*` / `text-phi-*` / `gap-grid` / `px-gutter`）与语义类（如 `.acg-grid-12` / `.acg-col-span-*` / `.acg-elev-*`）直接使用；玻璃与边框动效参数通过 CSS 变量统一调参；对低性能/省流量设备自动注入 `data-acg-perf="low"` 启用视觉降级，保证滚动与输入更稳定。

### 需求: 无障碍与键盘路径
场景：键盘用户或使用辅助技术的用户希望快速跳过导航并进入主内容。
- 预期结果：提供 Skip Link（跳到主要内容），并为 `<main>` 提供稳定锚点 `id="main"`（可聚焦），与全局 `:focus-visible` 样式一致。

### 需求: 分类页首屏性能（体积）
场景：分类页静态渲染条目较多时，HTML 体积会显著上升并影响移动端加载/解析成本。
- 预期结果：分类页默认仅渲染“最新一段”（例如 60 条）以降低 HTML 体积；同时提供“一键切换到全站搜索并自动套用 `cat:<category>` 过滤”的入口，保证用户可达全量内容。

### 需求: 弹层与微交互一致性
场景：Toast / Command Palette 等浮层需要“商业级”视觉反馈，同时在低性能设备上避免不必要开销。
- 预期结果：命令面板支持分组标题、关键词高亮与滚动条样式；Toast 提供 variant 图标、hover 阴影与点击消失动画；在 `data-acg-perf="low"` 或滚动期 `data-acg-scroll="1"` 下自动禁用 backdrop blur 等高开销效果，并暂停 shimmer/占位动画以保证滚动稳定。

### 需求: 页面转场动效
场景：在页面跳转时获得更连贯的阅读节奏，并兼容不支持新 API 的浏览器。
- 预期结果：支持 View Transitions 动效；不支持时降级到 WAAPI 的淡入淡出，且遵循 prefers-reduced-motion；动效以 opacity/transform 为主，避免 filter blur 造成合成开销。

## 依赖
- `tailwind.config.ts`
- `src/styles/global.css`
- `src/layouts/SiteLayout.astro`
- `src/pages/*`
- `src/components/*`
- `src/lib/feeds.ts`
- `src/lib/source-config.ts`

