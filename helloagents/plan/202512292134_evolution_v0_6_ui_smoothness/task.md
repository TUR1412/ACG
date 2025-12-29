# 任务清单: evolution_v0_6_ui_smoothness
目录: `helloagents/plan/202512292134_evolution_v0_6_ui_smoothness/`

---

## 1. 滚动期流畅度（核心）
- [√] 1.1 新增滚动期状态标记：`data-acg-scroll="1"`（passive + rAF 节流）
- [√] 1.2 滚动期视觉降级：禁用 backdrop-filter / 暂停 shimmer & 占位动效

## 2. 低成本微动效（观感增强）
- [√] 2.1 卡片入场：`IntersectionObserver` 打标 `data-acg-inview`（opacity/transform）
- [√] 2.2 交互过渡补齐：`clickable` 增加 opacity 过渡（更“丝滑”）

## 3. 转场与高开销效果治理
- [√] 3.1 View Transitions：移除 filter blur（仅保留 opacity/transform）
- [√] 3.2 WAAPI 降级：移除 filter blur（仅保留 opacity/transform）

## 4. 文档同步
- [√] 4.1 更新 `helloagents/CHANGELOG.md`
- [√] 4.2 更新模块文档：`helloagents/wiki/modules/web-ui.md`、`helloagents/wiki/modules/client-app.md`

## 5. 验证与发布
- [√] 5.1 验证：`npm run check` / `npm run build` / `npm run budget`
- [ ] 5.2 发布：提交并推送至 `origin/main`
- [ ] 5.3 方案包迁移至 `helloagents/history/2025-12/` 并更新 `helloagents/history/index.md`
- [ ] 5.4 按用户要求销毁本地克隆目录 `C:\\Users\\Kong\\ACG`
