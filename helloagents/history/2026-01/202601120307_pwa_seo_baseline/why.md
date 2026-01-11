# Why: PWA 图标 & SEO 基线补齐

## 背景
当前站点已具备 PWA（manifest + service worker）、性能预算门禁（Perf Budget）与 Lighthouse CI 回归门禁，但仍存在两类“行业默认项”缺口：

1) **PWA 图标规范不完整**：manifest 目前仅提供 SVG icon，部分平台/审计规则期望提供 192/512 PNG 与（可选）maskable icon，影响“可安装性”和跨端一致性。
2) **SEO 基线缺失**：缺少 `robots.txt` 与 `sitemap.xml`（至少应包含关键入口页），会导致 Lighthouse SEO 相关审计出现不必要的扣分或不稳定项。

## 目标
- 在不改变核心架构（静态构建 + GitHub Pages）与现有业务逻辑的前提下，补齐 PWA/SEO 的基础设施文件与页面输出。
- 为 Lighthouse CI 提供更稳定、可预期的 PWA/SEO 分数基线，减少“缺少文件导致的硬性扣分”。

## 成功标准
- `manifest.webmanifest` 包含 192/512 PNG icon（并提供 maskable 目的/或等效设计）。
- 站点构建产物中生成 `robots.txt` 与 `sitemap.xml`（至少覆盖关键入口页；有生成数据时可增量覆盖更多页面）。
- 本地 `npm test` / `npm run check` / `npm run build` / `npm run budget` 通过。

