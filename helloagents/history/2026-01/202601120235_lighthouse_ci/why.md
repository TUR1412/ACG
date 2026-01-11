# Why: Lighthouse CI（性能回归门禁）

## 背景
项目已具备体积预算（Perf Budget）与 CI，但仍缺少“真实页面渲染”的体验回归门禁：当 CSS/JS 或关键页面结构变化时，仍可能出现性能/SEO/可访问性回退而不自知。

## 目标
- 引入 Lighthouse CI，在 PR/手动触发时对关键页面进行跑分与报告，形成持续回归门禁。
- 保持现有核心架构与业务逻辑不变（静态站 + 定时同步 + Pages 部署）。

## 成功标准
- 新增 Lighthouse workflow 与配置文件，可在 GitHub Actions 上运行并产出报告。
- 不影响现有 CI / Hourly Sync & Deploy 流程。
- 本地 `npm test` / `npm run check` / `npm run build` / `npm run budget` 通过。

