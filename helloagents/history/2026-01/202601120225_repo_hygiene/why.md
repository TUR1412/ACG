# Why: Repo 协作基线补强（换行/责任归属）

## 背景
在 Windows/Unix 混合协作环境中，换行符（LF/CRLF）与文件类型识别经常导致无意义 diff、CI 噪音或 review 成本上升；同时缺少 CODEOWNERS 时，PR 评审责任不明确。

## 目标
- 通过 `.gitattributes` 统一文本文件的 EOL 规范（以 LF 为准），降低跨平台漂移。
- 增加 `CODEOWNERS`，让 GitHub 能自动请求默认维护者评审（不改变核心架构与业务逻辑）。

## 成功标准
- 新增 `.gitattributes` 与 `.github/CODEOWNERS`，且不触发大规模内容重写（不做全量 renormalize）。
- CI 与构建流程不受影响（本地 `npm test`/`npm run check`/`npm run build`/`npm run budget` 通过）。

