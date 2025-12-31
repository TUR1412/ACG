# 任务清单: evolution_v0_7_budget_data_split

目录: `helloagents/history/2025-12/202512312048_evolution_v0_7_budget_data_split/`

---

## 1. CI 体积门禁口径对齐
- [√] 1.1 在 `scripts/perf-budget.ts` 中拆分 `data/*.json` 与 core 页面统计口径，验证 why.md#核心场景-需求-ci-门禁稳定性-场景-每小时同步--构建--门禁
- [√] 1.2 在 `scripts/perf-budget.ts` 中更新预算输出（新增 data.json 指标），确保日志可解释性，依赖任务1.1

## 2. 文档与知识库同步
- [√] 2.1 更新 `helloagents/wiki/arch.md`：同步预算门禁的指标口径说明，验证 why.md#核心场景-需求-ci-门禁稳定性-场景-每小时同步--构建--门禁，依赖任务1.2
- [√] 2.2 更新 `helloagents/wiki/modules/pipeline-sync.md`：补充产物与门禁指标对应关系，依赖任务2.1
- [√] 2.3 更新 `helloagents/CHANGELOG.md`：记录本次口径调整与影响，依赖任务2.2

## 3. 安全检查
- [√] 3.1 执行安全检查（按G9: 不引入敏感信息/不新增不安全执行方式/不改变运行时信任边界）

## 4. 质量验证
- [√] 4.1 运行 `npm run check`
- [√] 4.2 运行 `npm run sync:dry`（确保抓取通路正常）
- [√] 4.3 运行 `npm run sync` → `npm run validate` → `npm run build` → `npm run budget`（预算门禁应通过）
