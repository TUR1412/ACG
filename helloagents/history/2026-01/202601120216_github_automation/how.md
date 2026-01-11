# How: 实施方案

## 1) GitHub Automation
- 添加 `.github/dependabot.yml`：npm 依赖每周更新（minor/patch 自动分组），GitHub Actions 每月更新。
- 添加 `.github/workflows/codeql.yml`：对 `javascript-typescript` 执行 CodeQL 扫描。

## 2) Repo Hygiene
- 添加 `.editorconfig`：统一编码/换行/缩进与去尾空格规则（Markdown 例外）。

## 3) Docs
- README 顶部补充 CI/CodeQL badges，作为仓库健康状态入口。

## 4) 验证
- 运行测试与构建门禁，确保增量改动不破坏核心链路。

