# How: 实施方案

## 1) README 公共章节双语化（不引入重复）
- 将“架构 / 本地开发 / 数据同步 / 质量与性能 / 环境变量 / 隐私”等公共章节改为中日双语标题。
- 环境变量表格增加日语说明（使用 `<br/>` 分行），避免复制两份表。
- 在中日各自语言段落中补充协作入口（CONTRIBUTING / CODE_OF_CONDUCT / SECURITY）。

## 2) Telemetry Viewer：事件 JSON 一键复制
- 在 `src/client/features/telemetry-viewer.ts` 的事件详情中增加“复制 JSON”按钮。
- 复用 `copyToClipboard` 与全局 `acg:toast` 事件桥接，保持现有交互一致性。
- 不新增依赖、不改变 telemetry 采集/上报策略（仍保持本地优先与用户显式授权）。

## 3) 验证
- 运行测试与构建门禁，确保改动不影响现有流程。

