# 任务清单: 自托管字体（移除 Google Fonts 依赖）

目录: `helloagents/plan/202601120530_self_host_fonts/`

---

## 1. 字体资源
- [√] 1.1 新增 `src/assets/fonts/`（woff2 字体文件）
- [√] 1.2 更新 `src/styles/global.css`：添加 `@font-face` 并使用本地字体
- [√] 1.3 更新 `src/layouts/SiteLayout.astro`：移除 Google Fonts 外链

## 2. 版本与知识库
- [√] 2.1 更新 `helloagents/CHANGELOG.md`
- [√] 2.2 更新 `helloagents/history/index.md` 并迁移方案包至 `history/`
- [√] 2.3 版本号升级（SemVer Patch）

## 3. 自测
- [√] 3.1 `npm test`
- [√] 3.2 `npm run check`
- [√] 3.3 `npm run build`
- [√] 3.4 `npm run budget`
