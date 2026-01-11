# How: 实施方案

## 1) PWA Icons
- 新增 `public/icons/`：输出 `icon-192.png`、`icon-512.png`、`apple-touch-icon.png` 等基础图标资源。
- 更新 `public/manifest.webmanifest`：补齐 PNG icons（sizes/type/purpose），保留现有 SVG favicon 作为通用 fallback。
- 更新 `src/layouts/SiteLayout.astro`：补齐 `apple-touch-icon` 等必要 link，提升跨端一致性。

## 2) robots.txt & sitemap.xml
- 新增 `src/pages/robots.txt.ts`：使用 `APIContext.site` + `BASE_URL` 输出可缓存的 robots（包含 sitemap 指令）。
- 新增 `src/pages/sitemap.xml.ts`：输出关键入口页的 sitemap；当生成数据存在时（`src/data/generated/posts.json` 可读）可追加更多页面（如分类/文章页）。

## 3) 文档与版本
- README 更新：补齐 PWA/SEO 相关说明（简短即可）。
- 版本号按 SemVer Patch 升级，并同步 `helloagents/CHANGELOG.md` / `helloagents/history/index.md`，方案包迁移至 `helloagents/history/`。

