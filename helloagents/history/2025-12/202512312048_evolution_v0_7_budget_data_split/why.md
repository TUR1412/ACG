# 变更提案: evolution_v0_7_budget_data_split

## 需求背景

当前 CI 门禁 `npm run budget` 的 **HTML/XML/JSON(core)** 统计口径会把 `dist/data/*.json` 一并计入“核心入口页”预算。

在 Hourly Sync & Deploy 流程中，`npm run sync` 会生成：
- `public/data/posts.json(.gz)`（信息流数据）
- `public/data/search-pack.v1.json(.gz)`（全站搜索包：posts + 预计算索引）

这些文件属于“运行时数据载荷”，并不等同于入口 HTML 的结构膨胀；当它们被纳入 core 预算时，会导致 **在核心页面结构未显著变化的情况下**，预算门禁仍然被数据规模增长触发，进而阻断定时部署，降低流水线可靠性。

## 变更内容

1. **体积门禁口径对齐**
   - 将 `dist/data/*.json` 从 **HTML/XML/JSON(core)** 统计中剥离，单独作为数据载荷指标统计（并继续保留 `.json.gz` 的 data.gz 指标）。
2. **可观测性增强（不牺牲门禁能力）**
   - 在预算报告中显式输出 `data.json` 与 `data.gz`，避免“看似通过但数据膨胀无人察觉”的盲区。

## 影响范围

- **模块:** pipeline-sync / CI gate
- **文件:**
  - `scripts/perf-budget.ts`
  - `helloagents/wiki/arch.md`（预算门禁说明口径同步）
  - `helloagents/wiki/modules/pipeline-sync.md`（产物与门禁指标说明同步）
  - `helloagents/CHANGELOG.md`

## 核心场景

### 需求: CI 门禁稳定性
**模块:** pipeline-sync / CI

#### 场景: 每小时同步 + 构建 + 门禁
当 `npm run sync` 产生的数据量随来源/天数增长时：
- 入口页（`/zh/`、`/ja/`、分类页、About/Status 等）体积门禁应只反映“页面结构/模板膨胀”。
- 数据载荷（`/data/*.json(.gz)`）应被单独统计与约束，避免误伤入口页门禁。

## 风险评估

- **风险:** core 预算不再直接约束 `data/*.json` 的增长。
- **缓解:**
  - 继续保留 `data.gz` 与 `dist 总体积` 门禁；
  - 额外输出 `data.json` 指标用于可观测，必要时可再引入独立阈值。

