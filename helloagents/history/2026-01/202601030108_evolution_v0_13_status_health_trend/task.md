# 任务清单: evolution_v0_13_status_health_trend

目录: `helloagents/plan/202601030108_evolution_v0_13_status_health_trend/`

---

## 1. pipeline-sync：status 趋势字段生成
- [√] 1.1 在 `src/lib/types.ts` 扩展 `SourceStatus`（newItemCount/latestPublishedAt/visibleItemCount/consecutiveFails）
- [√] 1.2 在 `scripts/sync.ts` 回读 remote status，并计算 `consecutiveFails`
- [√] 1.3 在 `scripts/sync.ts` 的 `runSource` 计算 `newItemCount`，并在 `rawItemCount===0` 时保守回退 previous
- [√] 1.4 在 `scripts/sync.ts` 生成 `pruned` 后回填 `latestPublishedAt` 与 `visibleItemCount`

## 2. web-ui：状态页展示升级
- [√] 2.1 更新 `src/pages/zh/status.astro`：新增列（新增/最新/连续失败），缺失时展示 `-`
- [√] 2.2 更新 `src/pages/ja/status.astro`：与中文一致

## 3. 质量门禁与文档同步
- [√] 3.1 更新 `scripts/validate-generated-data.ts`：新增字段为可选校验（存在则校验类型）
- [√] 3.2 更新 `helloagents/wiki/arch.md`：追加 ADR-013 索引
- [√] 3.3 更新 `helloagents/CHANGELOG.md`：记录本次升级

## 4. 质量验证
- [√] 4.1 `npm run check`
- [√] 4.2 `npm run build`（`ACG_BASE=/ACG`）
- [√] 4.3 `npm run budget`
