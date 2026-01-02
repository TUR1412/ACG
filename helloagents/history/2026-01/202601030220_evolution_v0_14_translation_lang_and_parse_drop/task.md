# task（任务清单）

> 标记说明：`[ ]` 待执行 / `[√]` 已完成 / `[X]` 失败 / `[-]` 跳过

- [√] 为来源配置增加 `lang`（`en|ja|zh|unknown`），并在 scripts 侧透传
- [√] 同步翻译策略：按来源语言跳过同语种自翻译；已有翻译字段不重复生成
- [√] 抓取兜底：新增 `parse_drop`（异常缩水）回退机制，避免静默停更
- [√] 状态页：新增全局汇总指标与 `parse_*` 错误建议（zh/ja）
- [√] 补充文档：README/知识库同步（变更说明、ADR）
- [√] 运行校验：`npm run check` / `npm run validate` / `ACG_BASE=/ACG npm run build` / `npm run budget`
