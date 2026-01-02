# 任务清单: evolution_v0_12_fulltext_progressive_dom

目录: `helloagents/plan/202601022255_evolution_v0_12_fulltext_progressive_dom/`

---

## 1. client-app：全文预览渐进渲染
- [√] 1.1 新增 `renderMarkdownToHtmlBlocks`：渲染输出按 block 切分（列表支持分块）
- [√] 1.2 更新 `src/client/workers/fulltext.worker.ts`：render_result 返回 blocks
- [√] 1.3 更新 `src/client/features/fulltext.ts`：长文 DOM 注入采用渐进渲染，并保持回退策略

## 2. 知识库同步
- [√] 2.1 更新 `helloagents/wiki/modules/client-app.md`
- [√] 2.2 更新 `helloagents/wiki/arch.md`（追加 ADR-012）
- [√] 2.3 更新 `helloagents/CHANGELOG.md`

## 3. 质量验证
- [√] 3.1 `npm run check`
- [√] 3.2 `npm run build`（`ACG_BASE=/ACG`）
- [√] 3.3 `npm run budget`
