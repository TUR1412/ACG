# web-ui

## 目的
负责页面与组件的静态渲染，提供多语言路由、订阅导出与可访问的 UI 结构。

## 模块概述
- 职责：Astro 页面/组件渲染、RSS/JSON Feed/OPML 输出、SEO 元信息、布局与导航
- 状态：✅稳定
- 最后更新：2025-12-26

## 规范
### 需求: 订阅导出兼容
场景：用户希望将来源一键导入阅读器或程序消费信息流。
- 预期结果：提供 RSS（已有）+ JSON Feed + OPML，且中日双语路由一致。

### 需求: 视觉系统令牌化
场景：站点持续迭代时希望保持一致的排版、栅格与阴影层级，不再“每个页面手调一套”。
- 预期结果：栅格（gutter/gap）、排版尺度（黄金比例）与阴影层级（e1..e12）在全局可复用，并可通过 Tailwind utilities（如 `shadow-e*` / `text-phi-*` / `gap-grid` / `px-gutter`）与语义类（如 `.acg-grid-12` / `.acg-col-span-*` / `.acg-elev-*`）直接使用；玻璃与边框动效参数通过 CSS 变量统一调参。

### 需求: 页面转场动效
场景：在页面跳转时获得更连贯的阅读节奏，并兼容不支持新 API 的浏览器。
- 预期结果：支持 View Transitions 动效；不支持时降级到 WAAPI 的淡入淡出，且遵循 prefers-reduced-motion。

## 依赖
- `tailwind.config.ts`
- `src/styles/global.css`
- `src/layouts/SiteLayout.astro`
- `src/pages/*`
- `src/components/*`
- `src/lib/feeds.ts`
- `src/lib/source-config.ts`

