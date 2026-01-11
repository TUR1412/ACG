# How: 实施方案

## 1) Lighthouse 配置
- 添加 `.lighthouserc.json`：使用 `startServerCommand` 启动 `astro preview`（固定端口 4173），对关键入口页（/、/zh/、/ja/、/zh/status/、/ja/status/）进行采样跑分。
- Assertions 采取 `warn` 级别的最低分阈值（避免 CI 因少量波动而频繁红灯），同时保留可逐步调高阈值的空间。

## 2) GitHub Actions Workflow
- 添加 `.github/workflows/lighthouse.yml`：在 PR 与手动触发时执行：
  - `npm ci`
  - `npm run build`（显式 `ACG_BASE=/`，以便本地 server 下资源路径一致）
  - 运行 Lighthouse CI（`npx @lhci/cli autorun`）
  - 将 `lhci_reports/` 作为构件上传（便于回溯与排障）

## 3) 文档与版本
- README 增加 Lighthouse workflow badge（可快速检查仓库健康状态）。
- 更新 `helloagents/CHANGELOG.md`、`helloagents/history/index.md` 并做 SemVer Patch 升级。

