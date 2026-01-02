# task（任务清单）

> 标记说明：`[ ]` 待执行 / `[√]` 已完成 / `[X]` 失败 / `[-]` 跳过

- [√] SW：数据请求按类型兜底，`.json.gz` 失败时返回 504 触发回退
- [√] SW：install 阶段预缓存 `data/status.json`，离线页可展示最近更新时间
- [√] 离线页：展示“最近一次数据更新时间（可能为缓存）”并增加 status 快捷入口
- [√] 客户端：online/offline 状态变化 Toast 轻提示（节流）
- [√] 文档/知识库：更新 CHANGELOG / ADR / history 索引
- [√] 运行校验：`npm run check` / `npm run validate` / `ACG_BASE=/ACG npm run build` / `npm run budget`
