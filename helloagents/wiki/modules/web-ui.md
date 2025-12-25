# web-ui

## 目的
负责页面与组件的静态渲染，提供多语言路由、订阅导出与可访问的 UI 结构。

## 模块概述
- 职责：Astro 页面/组件渲染、RSS/JSON Feed/OPML 输出、SEO 元信息、布局与导航
- 状态：✅稳定
- 最后更新：2025-12-25

## 规范
### 需求: 订阅导出兼容
场景：用户希望将来源一键导入阅读器或程序消费信息流。
- 预期结果：提供 RSS（已有）+ JSON Feed + OPML，且中日双语路由一致。

## 依赖
- `src/pages/*`
- `src/components/*`
- `src/lib/feeds.ts`
- `src/lib/source-config.ts`

