# Why: 启动级错误边界 & 同步日志摘要

## 背景
项目已具备端侧 Telemetry（本地优先）与 GitHub Actions 同步管线，但仍存在两个可改进点：

1) **启动级错误边界缺失**：`src/client/app.ts` 的初始化链较长，任何早期异常可能导致整段 JS 失效，并且可能发生在全局错误监听挂载之前，影响可观测性与降级体验。
2) **同步流程日志可读性不足**：Hourly Sync 产出包含大量结构化数据（posts/status/status-history/search-pack），但 Actions 侧缺少“可一眼扫读”的摘要（数量、耗时、健康度、失败来源等），不利于快速定位问题。

## 目标
- 以增量方式加固前端启动链：让“监控先行”，并在初始化失败时提供保守降级与可追溯事件。
- 为 Hourly Sync 增加 Step Summary 摘要（不破坏原同步与部署逻辑），作为轻量监控基线。

## 成功标准
- 即使初始化链中某处抛错，仍能记录关键错误事件（localStorage telemetry）并避免雪崩式影响。
- Hourly Sync workflow 中新增 Summary 输出，能在 Actions UI 中快速查看关键指标。
- 本地 `npm test` / `npm run check` / `npm run build` / `npm run budget` 通过。

