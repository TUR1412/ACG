# 任务清单: evolution_v0_10_fulltext_worker

目录: `helloagents/plan/202601021845_evolution_v0_10_fulltext_worker/`

---

## 1. 全文预览 Worker（client-app）
- [√] 1.1 新增 `src/client/workers/fulltext.worker.ts`：支持 render/translate 请求-响应协议
- [√] 1.2 更新 `src/client/features/fulltext.ts`：优先使用 Worker 执行渲染与翻译；失败回退主线程
- [√] 1.3 更新 `src/client/features/fulltext.ts`：低性能模式下默认不自动加载/翻译（保留手动入口）
- [√] 1.4 更新 `src/client/utils/cover.ts`：使其在 Worker 环境可安全调用（使用 `globalThis.location` 而非 `window`）

## 2. 文档与知识库同步
- [√] 2.1 更新 `helloagents/wiki/modules/client-app.md`（全文预览 Worker 化、回退策略、低性能策略）
- [√] 2.2 更新 `helloagents/wiki/arch.md`（追加 ADR-010）
- [√] 2.3 更新 `helloagents/CHANGELOG.md`

## 3. 质量验证
- [√] 3.1 `npm run check`
- [√] 3.2 `npm run build`
- [√] 3.3 `npm run budget`
- [√] 3.4 `npm run sync`（最小化参数）+ `npm run validate`

