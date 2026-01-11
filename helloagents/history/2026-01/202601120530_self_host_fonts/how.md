# How: 实施方案

## 1) 获取并托管字体文件
- 使用 Google Fonts 提供的 woff2 字体文件（仅拉取 `latin`/常用子集，控制体积）。
- 将字体文件放入 `src/assets/fonts/`，交由 Vite 处理并生成带 hash 的静态资源路径（自动适配 `ACG_BASE`）。

## 2) 全局样式接入
- 在 `src/styles/global.css` 中添加 `@font-face`（`font-display: swap`）。
- 保留现有 CSS 变量 `--font-sans` / `--font-display` 与 fallback 栈，避免破坏排版逻辑。

## 3) 移除外链
- 从 `src/layouts/SiteLayout.astro` 移除 Google Fonts 的 `<link rel="preconnect">` 与 `<link rel="stylesheet">`。

## 4) 版本与知识库
- 版本号 SemVer Patch 升级；更新 `helloagents/CHANGELOG.md` 与 `helloagents/history/index.md`；迁移方案包至 `history/`。

