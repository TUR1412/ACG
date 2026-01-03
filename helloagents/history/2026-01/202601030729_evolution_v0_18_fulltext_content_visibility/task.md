# 任务清单: evolution_v0_18（全文预览滚动更稳：content-visibility 分块渲染）

目录: `helloagents/plan/202601030729_evolution_v0_18_fulltext_content_visibility/`

---

## 1. 性能/体验（移动端全文预览卡顿）
- [√] 1.1 为全文预览容器 `data-fulltext-content` 的块级子元素启用 `content-visibility: auto`，让浏览器跳过离屏块渲染，减少长文滚动时的掉帧与长任务影响。
- [√] 1.2 为常见块（列表/画廊等）设置合理的 `contain-intrinsic-size` 兜底，避免离屏占位导致的明显滚动跳动。

## 2. 质量验证
- [√] 2.1 跑通 `npm run check` / `npm run build` / `npm run budget`（确保无 UI/构建退化）。

## 3. 知识库同步
- [√] 3.1 更新 `helloagents/wiki/modules/client-app.md`（补充全文预览滚动优化策略）。
- [√] 3.2 更新 `helloagents/CHANGELOG.md`（补充 Unreleased 条目）。

## 4. 迁移方案包（强制）
- [√] 4.1 将本方案包迁移至 `helloagents/history/2026-01/202601030729_evolution_v0_18_fulltext_content_visibility/` 并更新 `helloagents/history/index.md`。
