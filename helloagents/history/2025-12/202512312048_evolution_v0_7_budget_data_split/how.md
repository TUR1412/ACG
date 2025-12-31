# 技术设计: evolution_v0_7_budget_data_split

## 技术方案

### 核心技术
- Node.js + TypeScript（现有脚本 `scripts/perf-budget.ts`）
- 以 `dist/` 产物为唯一事实来源进行体积扫描

### 实现要点
- 调整 `scripts/perf-budget.ts` 的分类逻辑：
  - **core 页面预算**：仅统计 `dist/` 下的入口 `html/xml`（并保持排除详情页 `/p/<id>/index.html` 的现有策略）。
  - **数据载荷**：把 `dist/data/*.json` 作为 data.json 单独统计；`dist/data/*.json.gz` 继续计入 data.gz。
  - 其他分类（js/css/covers/total）保持不变。
- 保持脚本对环境变量的兼容性与可覆盖能力（不引入破坏性参数变更）。

## 架构决策 ADR

### ADR-005: Perf Budget 指标按“入口页 vs 数据载荷”拆分
**上下文:** Hourly 流水线会生成 `dist/data/*.json(.gz)`，其规模随抓取窗口与来源数量增长；将其计入 core 入口预算会造成误报并阻断部署。  
**决策:** core 预算仅约束入口页（html/xml，排除详情页），`data/*.json` 独立为 data.json 指标，`data/*.json.gz` 继续作为 data.gz 门禁。  
**理由:** 入口页体积与数据载荷的增长驱动不同，应分别观察与门禁；同时保持数据压缩体积（data.gz）作为网络与缓存成本的主要约束。  
**替代方案:**
- 方案A：直接提高 `ACG_BUDGET_HTML_KB` → 拒绝原因：掩盖入口页模板膨胀，且继续混淆指标含义。
- 方案B：减少同步窗口（`--days`）或减少 posts 数量 → 拒绝原因：属于产品回退，不应通过“砍功能”修门禁。
- 方案C：不再生成 `data/*.json` 仅保留 `.gz` → 拒绝原因：降低兼容性与容错（无 DecompressionStream 环境会受影响）。
**影响:** Hourly 门禁更稳定；预算报告更可解释；仍保留 data.gz 与 dist 总体积约束，避免数据无限膨胀。

## 安全与性能
- **安全:** 仅调整构建期脚本统计口径，不引入运行时风险；不涉及外部依赖变更。
- **性能:** 预算脚本扫描逻辑保持线性遍历；分类判断增加的成本可忽略。

## 测试与部署
- **测试（本地）:**
  - `npm run sync`（生成数据）
  - `npm run build`
  - `npm run budget`（应通过）
- **部署（CI）:**
  - Hourly workflow 继续保持 `sync → validate → build → budget → deploy` 的门禁顺序。

