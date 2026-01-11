# Why: GitHub 文档打磨 + Telemetry Viewer 细节增强

## 背景
项目已具备中日双语 UI 与较完整的工程化能力，但 README 中“架构/开发/环境变量/隐私”等公共信息以中文为主，对日语读者不够友好；同时 Telemetry Viewer 作为自助排障工具，缺少“一键复制事件 JSON”的效率入口。

## 目标
- 让 README 的公共章节对中日读者都可直接阅读（无需来回跳转或依赖第三方翻译）。
- 在不改变核心架构与业务逻辑的前提下，为 Telemetry Viewer 补齐高频操作的“复制”能力，提高排障效率。

## 成功标准
- README 公共章节标题与关键说明达到中日双语可读（至少标题/表格/隐私说明）。
- Telemetry Viewer 可在单条事件中一键复制 JSON，并通过全局 Toast 反馈结果。
- `npm test`、`npm run check`、`npm run build`、`npm run budget` 通过。

