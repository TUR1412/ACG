# 任务清单: evolution_v0_11_status_observability

目录: `helloagents/plan/202601022104_evolution_v0_11_status_observability/`

---

## 1. pipeline-sync：抓取可观测性
- [√] 1.1 增强 `scripts/lib/http-cache.ts#fetchTextWithCache`：返回 attempts / waitMs，并在 304 时刷新缓存时间戳
- [√] 1.2 更新 `scripts/sync.ts#runSource`：将 attempts / waitMs 写入 status，并追加 rawItemCount/filteredItemCount

## 2. web-ui：状态页展示增强
- [√] 2.1 更新 `src/pages/zh/status.astro`：展示 attempts/waitMs 与 raw/filtered 统计
- [√] 2.2 更新 `src/pages/ja/status.astro`：展示 attempts/waitMs 与 raw/filtered 统计

## 3. 类型与门禁
- [√] 3.1 更新 `src/lib/types.ts`：扩展 `SourceStatus`
- [√] 3.2 更新 `scripts/validate-generated-data.ts`：对新增字段做轻量校验

## 4. 知识库同步
- [√] 4.1 更新 `helloagents/wiki/modules/pipeline-sync.md`
- [√] 4.2 更新 `helloagents/wiki/modules/web-ui.md`
- [√] 4.3 更新 `helloagents/CHANGELOG.md`

## 5. 质量验证
- [√] 5.1 `npm run check`
- [√] 5.2 `npm run sync`（最小化参数）+ `npm run validate`
- [√] 5.3 `npm run build` + `npm run budget`

