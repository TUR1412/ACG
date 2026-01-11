# 变更提案: Telemetry Viewer（本地事件查看）与隐私加固

## 背景

项目采用“静态站 + GitHub Actions 定时同步 + GitHub Pages 部署”的架构，端侧交互能力密度较高。当前已具备本地优先 telemetry（错误捕获 + 性能线索 + 可选上报）以及偏好面板中的导出/清空能力，但仍缺少一个面向排障/自检的“可视化查看入口”，并存在少量可优化的隐私风险点：

- 维护/排障需要“快速看一眼”事件类型、数量、最近发生时间与 payload，而不必导出后再手动打开 JSON。
- telemetry 事件的 `path` 与 `referrer` 可能包含 query/hash（例如 token、跳转参数），导出或上报时存在潜在隐私泄露风险。

## 目标与成功标准

- 新增 Telemetry Viewer 页面（zh/ja 各一份），用于**本机可视化查看** localStorage 中的 telemetry：
  - 支持过滤、导出、清空、事件数/体积展示
  - 仅在该页面加载相关 JS，不影响首页/分类页关键路径
- 隐私加固：
  - telemetry `path` 默认只记录 `pathname`（不记录 query/hash）
  - telemetry `referrer` 默认剥离 query/hash
  - monitoring 的一行错误文本去除 URL query/hash（与 stack 的处理对齐）
- 保持核心架构与业务逻辑根基不变；所有改动均为增量扩展（OCP）。
- `npm test`、`npm run check`、`npm run build`、`npm run budget` 通过。

## 非目标

- 不引入第三方监控 SDK
- 不引入后端服务或自动上报逻辑变更（仍为用户显式开启）
