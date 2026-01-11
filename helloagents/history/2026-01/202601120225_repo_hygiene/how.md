# How: 实施方案

## 1) `.gitattributes`
- 使用 `* text=auto eol=lf` 作为默认策略，保证提交到仓库的文本内容统一为 LF。
- 显式标注常见二进制类型为 `binary`（避免被错误当作文本处理）。
- 不执行 `git add --renormalize`，避免引入无关的大 diff（保持原子化、低风险）。

## 2) `CODEOWNERS`
- 添加 `.github/CODEOWNERS`，将默认责任归属到仓库所有者（`@TUR1412`）。
- 保持规则最小化：仅设置全局默认 owner，避免过度分层导致维护成本上升。

## 3) 验证 & 版本
- 更新 `helloagents/CHANGELOG.md` 与 `helloagents/history/index.md`，并做 SemVer Patch 升级。
- 运行测试与构建门禁。

