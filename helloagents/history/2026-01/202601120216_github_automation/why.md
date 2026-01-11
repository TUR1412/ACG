# Why: GitHub 自动化与安全基线补齐

## 背景
项目已经具备稳定的 CI 与定时部署，但在 GitHub 生态中仍可补齐一些“行业默认”的自动化与安全基线，用更低的维护成本保持依赖更新与安全扫描。

## 目标
- 自动化依赖更新（Dependabot），减少“长期不更新导致的一次性大升级风险”。
- 增加静态安全扫描（CodeQL），提升对常见安全问题的早发现能力。
- 统一基础编辑器规范（.editorconfig），降低跨平台协作的格式漂移。

## 成功标准
- 新增 `Dependabot` 与 `CodeQL` 配置，且不影响现有 CI/部署流程。
- README 增加对应徽章，便于快速查看仓库健康状态。
- `npm test` / `npm run check` / `npm run build` / `npm run budget` 可通过。

