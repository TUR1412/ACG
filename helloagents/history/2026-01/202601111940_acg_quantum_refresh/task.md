# 任务清单: ACG Quantum Refresh

目录: `helloagents/plan/202601111940_acg_quantum_refresh/`

---

## 1. 派生指标与洞察
- [√] 1.1 在 `src/lib/metrics.ts` 中实现 Pulse/时间窗/阅读时长/去重键计算，验证 why.md#需求-pulse-ranking-场景-hot-scan
- [√] 1.2 在 `src/lib/format.ts` 中补充时间透镜与标签格式化辅助，验证 why.md#需求-time-lens-filters-场景-time-focus
- [√] 1.3 在 `tests/index.test.ts` 中添加指标与筛选相关测试，验证 why.md#需求-pulse-ranking-场景-hot-scan

## 2. 首页洞察与布局
- [√] 2.1 在 `src/components/SignalBoard.astro` 中实现洞察模块（热点/时间透镜/来源健康度），验证 why.md#需求-immersive-ui-场景-home-discovery
- [√] 2.2 在 `src/pages/zh/index.astro` 中接入洞察模块与新布局，验证 why.md#需求-pulse-ranking-场景-hot-scan
- [√] 2.3 在 `src/pages/ja/index.astro` 中接入洞察模块与新布局，验证 why.md#需求-pulse-ranking-场景-hot-scan

## 3. 列表与卡片增强
- [√] 3.1 在 `src/components/PostCard.astro` 中输出 pulse/readTime/dupCount/sourceHealth 标记与 data 属性，验证 why.md#需求-read-depth-场景-read-plan
- [√] 3.2 在 `src/components/PostList.astro` 中调整列表结构与空态，验证 why.md#需求-smart-dedup-场景-noise-control
- [√] 3.3 在 `src/components/SourceBadge.astro` 中实现健康度徽章，验证 why.md#需求-source-trust-场景-trust-check

## 4. 筛选与偏好体系
- [√] 4.1 在 `src/client/constants.ts` 中升级 filters 版本与 UI 常量，验证 why.md#需求-time-lens-filters-场景-time-focus
- [√] 4.2 在 `src/client/app.ts` 中实现时间透镜/去重/稳定来源/热度排序逻辑，验证 why.md#需求-smart-dedup-场景-noise-control
- [√] 4.3 在 `src/components/PreferencesPanel.astro` 与 `src/components/PreferencesDrawer.astro` 中增加新开关，验证 why.md#需求-time-lens-filters-场景-time-focus

## 5. 视觉与性能
- [√] 5.1 在 `src/styles/global.css` 中重构设计系统（颜色/字体/背景/动效），验证 why.md#需求-immersive-ui-场景-home-discovery
- [√] 5.2 在 `src/layouts/SiteLayout.astro` 与 `src/components/SpotlightGrid.astro` 中实现未来感布局与交互动效，验证 why.md#需求-immersive-ui-场景-home-discovery
- [√] 5.3 在 `src/client/utils/virtual-grid.ts` 中调整虚拟化阈值与性能策略，验证 why.md#需求-smart-dedup-场景-noise-control

## 6. 文档更新
- [√] 6.1 在 `README.md` 中重写双语文档与使用指南，验证 why.md#需求-immersive-ui-场景-home-discovery
- [√] 6.2 在 `helloagents/wiki/overview.md` 与 `helloagents/wiki/modules/ui.md` 中更新模块说明，验证 why.md#需求-immersive-ui-场景-home-discovery
- [√] 6.3 更新 `helloagents/CHANGELOG.md` 记录版本变更

## 7. 安全检查
- [√] 7.1 执行安全检查（输入验证、外链安全、localStorage 迁移），符合 G9 要求

## 8. 测试
- [√] 8.1 运行 `npm run check` 与 `npm test` 验证基础质量
