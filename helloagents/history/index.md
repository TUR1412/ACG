# 变更历史索引

本文件记录所有已完成变更的索引，便于追溯和查询。

## 索引

| 时间戳 | 功能名称 | 类型 | 状态 | 方案包路径 |
|--------|----------|------|------|------------|
| 202512252117 | evolution_v0_2 | 功能/重构 | ✅已完成 | history/2025-12/202512252117_evolution_v0_2/ |
| 202512252322 | evolution_v0_3 | 功能/重构 | ✅已完成 | history/2025-12/202512252322_evolution_v0_3/ |
| 202512271504 | evolution_v0_4_searchpack_perf | 功能/重构 | ✅已完成 | history/2025-12/202512271504_evolution_v0_4_searchpack_perf/ |
| 202512292051 | evolution_v0_5_ui_cmdk_toast | UI/体验 | ✅已完成 | history/2025-12/202512292051_evolution_v0_5_ui_cmdk_toast/ |
| 202512292134 | evolution_v0_6_ui_smoothness | UI/体验 | ✅已完成 | history/2025-12/202512292134_evolution_v0_6_ui_smoothness/ |
| 202512312048 | evolution_v0_7_budget_data_split | 修复/重构 | ✅已完成 | history/2025-12/202512312048_evolution_v0_7_budget_data_split/ |
| 202512312242 | evolution_v0_8_ui_category_global_search | UI/体验 | ✅已完成 | history/2025-12/202512312242_evolution_v0_8_ui_category_global_search/ |
| 202601021014 | evolution_v0_9_fulltext_perf_pipeline | 功能/重构 | ✅已完成 | history/2026-01/202601021014_evolution_v0_9_fulltext_perf_pipeline/ |
| 202601021845 | evolution_v0_10_fulltext_worker | 功能/重构 | ✅已完成 | history/2026-01/202601021845_evolution_v0_10_fulltext_worker/ |

## 按月归档

### 2025-12

- 202512252117_evolution_v0_2 (2025-12/202512252117_evolution_v0_2/) - 来源配置SSOT + OPML/JSON Feed + PWA + CI门禁
- 202512252322_evolution_v0_3 (2025-12/202512252322_evolution_v0_3/) - 视觉系统令牌化 + 转场/骨架/高级筛选 + 本地埋点
- 202512271504_evolution_v0_4_searchpack_perf (2025-12/202512271504_evolution_v0_4_searchpack_perf/) - 全站搜索 search-pack + 取消/截断 + 性能自适应降级
- 202512292051_evolution_v0_5_ui_cmdk_toast (2025-12/202512292051_evolution_v0_5_ui_cmdk_toast/) - Cmdk 分组/高亮 + Toast 图标/点击消失 + 弹层细节打磨
- 202512292134_evolution_v0_6_ui_smoothness (2025-12/202512292134_evolution_v0_6_ui_smoothness/) - 滚动期降级 + 卡片入场微动效 + 转场去 blur（更顺滑）
- 202512312048_evolution_v0_7_budget_data_split (2025-12/202512312048_evolution_v0_7_budget_data_split/) - Perf Budget 指标拆分（data.json 独立统计，避免入口页 core 门禁误报）
- 202512312242_evolution_v0_8_ui_category_global_search (2025-12/202512312242_evolution_v0_8_ui_category_global_search/) - 分类页首屏瘦身（120→60）+ 全站·本分类预置 + Skip Link

### 2026-01

- 202601021014_evolution_v0_9_fulltext_perf_pipeline (2026-01/202601021014_evolution_v0_9_fulltext_perf_pipeline/) - 全文预览性能分阶段（idle 后处理 + 低性能/滚动期降级）+ 同步管线插件化与稳定性增强
- 202601021845_evolution_v0_10_fulltext_worker (2026-01/202601021845_evolution_v0_10_fulltext_worker/) - 全文预览 Worker 化（渲染/翻译重计算迁移到 Worker，主线程只做 DOM 注入 + idle 后处理，并保留回退与低性能策略）

