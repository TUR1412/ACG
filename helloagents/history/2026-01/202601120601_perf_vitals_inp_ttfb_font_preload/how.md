# How: 实施方案

## 1) 字体 Preload（首屏性能）
- 在 `src/layouts/SiteLayout.astro` 中对首屏必需的 woff2 进行 `preload`：
  - `Outfit`（标题/展示字体）latin 子集
  - `Space Grotesk`（正文字体）latin 子集
- 通过 Vite 资产导入获得带 hash 的最终路径，自动适配 `ACG_BASE`。
- 只 preload latin 子集，避免为少量用户场景引入不必要的首屏带宽占用；latin-ext 继续按需加载。

## 2) perf_vitals 扩展（TTFB/INP）
- 在 `src/client/utils/monitoring.ts` 的 `wirePerfMonitoring()` 中增量采集：
  - **TTFB**：从 `performance.getEntriesByType("navigation")` 获取 `responseStart`（有值时记录）。
  - **INP（近似）**：基于 `PerformanceObserver` 的 `event` entries，按 `interactionId` 聚合每次交互的最大 duration，并在页面隐藏/离开时取近似 p98（样本少时取 max），记录为 `inpMs`。
- 降级策略：
  - `data-acg-perf="low"` 时不启用 INP 观测（避免“为了观测而影响体验”）。
  - 所有 observer 注册均以 try/catch 包裹，确保在不支持 `event`/`navigation` 的环境下静默退化。

## 3) 文档与版本闭环
- bump 版本：`0.5.10` → `0.5.11`（SemVer patch）
- 更新知识库：
  - `helloagents/CHANGELOG.md` 新增条目
  - `helloagents/wiki/modules/client-app.md` 同步更新 Observability 能力描述（补齐 TTFB/INP）
  - `helloagents/history/index.md` 追加索引
- 迁移方案包：`helloagents/plan/...` → `helloagents/history/2026-01/...`

