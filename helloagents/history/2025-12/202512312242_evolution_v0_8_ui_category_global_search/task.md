# 任务清单: evolution_v0_8_ui_category_global_search

目录: `helloagents/plan/202512312242_evolution_v0_8_ui_category_global_search/`

---

## 1. 分类页首屏瘦身 + 全站入口
- [√] 1.1 调整 `/zh/c/[category]` 静态渲染数量（120 → 60），并展示“显示数/总数”以避免误解
- [√] 1.2 调整 `/ja/c/[category]` 同步策略（120 → 60），保持中日一致
- [√] 1.3 在分类页快捷筛选区域新增“全站·本分类”按钮（`data-search-preset="cat:<category>"`）

## 2. 全站搜索预置（client-app）
- [√] 2.1 在 `wireGlobalSearch()` 内支持点击 `[data-search-preset]` 自动切换到全站并填充查询
- [√] 2.2 确保与现有“全站/本页”切换、toast、skeleton、虚拟列表兼容

## 3. 可访问性（Skip Link）
- [√] 3.1 新增 i18n 文案：Skip Link（中日）
- [√] 3.2 `SiteLayout.astro` 增加 skip link + `<main id="main" tabindex="-1">`
- [√] 3.3 `global.css` 增加 `.acg-skip-link` 样式（默认隐藏，focus 可见）

## 4. 知识库同步
- [√] 4.1 更新 `helloagents/wiki/modules/web-ui.md`（最后更新日期 + 规范补充）
- [√] 4.2 更新 `helloagents/wiki/modules/client-app.md`（预置入口说明）
- [√] 4.3 更新 `helloagents/CHANGELOG.md`（记录本次 UI/可访问性/性能改动）

## 5. 质量验证
- [√] 5.1 运行 `npm run check`
- [√] 5.2 运行 `npm run build`
- [√] 5.3 运行 `npm run budget`（观察分类页体积下降且门禁通过）

## 6. 收尾
- [√] 6.1 将方案包迁移至 `helloagents/history/2025-12/` 并更新 `helloagents/history/index.md`
- [√] 6.2 原子提交（独立 commit，便于回滚）


