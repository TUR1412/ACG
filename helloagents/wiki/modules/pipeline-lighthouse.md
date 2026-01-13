# pipeline-lighthouse

## 目的

提供 Lighthouse CI（LHCI）门禁：在 PR/手动触发时对关键页面做性能/可访问性/最佳实践/SEO 审计，生成报告并在不达标时给出可追踪的回归证据。

## 模块概述

- 职责：Build（base=/）→ Preview（本地 HTTP）→ LHCI autorun（collect/assert/upload）→ Job Summary 摘要输出 → 上传报告 Artifact
- 状态：✅稳定
- 最后更新：2026-01-13

## 规范

### 需求: CI 可复现（稳定门禁）

场景：不同机器/不同时间运行审计时，至少要保证阈值与采集 URL 的一致性，避免“跑分漂移”导致的误报。

- 预期结果：阈值与采集 URL 由 `.lighthouserc.json` 统一管理；workflow 固定 Node 版本与 LHCI 版本。

### 需求: 满分门禁（Score=1.0）

场景：需要将 Lighthouse 作为“体验质量门禁”，并追求在 CI 中稳定拿到满分（1.0），避免因为模拟节流/硬件差异导致的波动。

- 预期结果：LHCI 在关键页面上输出 `performance/a11y/best-practices/seo = 1.0` 的稳定基线结果。
- 实现要点：在 `.lighthouserc.json` 中使用 `settings.throttlingMethod = "provided"`
  （以当前运行环境的真实条件测量），减少模拟节流导致的漂移；如需模拟移动端网络/CPU，
  可使用独立的 `.lighthouserc.simulate.json`（`throttlingMethod: "simulate"`）或手动
  触发 `Lighthouse CI (Simulated)` workflow 做对比与追踪。

### 需求: 本地可运行（降低贡献者门槛）

场景：贡献者希望在本机复现 CI 跑分，但部分环境缺少 Chrome/Edge 或浏览器路径不可被 LHCI 自动发现。

- 预期结果：提供 `npm run lhci:local`：
  - 自动探测 `chromePath`（可用 `LHCI_CHROME_PATH` 显式指定）
  - 默认会先执行一次 build（`ACG_BASE=/`），避免 `dist/` 已存在但内容过期导致跑分与真实代码不一致
  - 可选：传入 `-- --skip-build` 跳过 build（仅在你明确知道 dist 最新时使用）

## 依赖

- `.github/workflows/lighthouse.yml`
- `.github/workflows/lighthouse-simulate.yml`
- `.lighthouserc.json`
- `.lighthouserc.simulate.json`
- `scripts/lhci-local.ts`
- `scripts/lhci-step-summary.ts`

## 产物

- `lhci_reports/manifest.json`（LHCI filesystem target 输出，包含各 URL 分数摘要）
- `lhci_reports_simulate/manifest.json`（模拟节流版本输出，用于“更真实”的对比与追踪）
- `.lighthouseci/manifest.json`（LHCI 本地临时目录，历史/兼容用途；默认在 `.gitignore` 中忽略）
- `lhci_reports/`（workflow 上传 artifact，用于 PR review 与回溯）
- `lhci_reports_simulate/`（模拟节流 workflow 上传 artifact，用于长期趋势对比）

> 注：`scripts/lhci-step-summary.ts` 支持通过 `LHCI_OUTPUT_DIR` 指定读取的报告目录
> （例如 `lhci_reports_simulate`），以便在同一仓库内并行维护多套 LHCI 输出。
