# How: 实施方案

## 1) 启动级错误边界（前端）
- 将 `src/client/app.ts` 的初始化拆分为“监控引导（bootstrap）”与“业务初始化（init）”两段。
- 先挂载 `wireTelemetry()` / `wireGlobalErrorMonitoring()` / `wirePerfMonitoring()`，再执行其余初始化。
- 对整体 init 做 try/catch：失败时记录 `bootstrap_fatal` telemetry，并尽量给出轻量 toast（不阻塞主内容阅读）。

## 2) 同步日志摘要（Actions）
- 新增脚本 `scripts/step-summary.ts`：读取 `src/data/generated/status.json` / `posts.json`（存在则读取）并输出 Markdown。
- 在 `.github/workflows/hourly-sync-and-deploy.yml` 中，在 `npm run sync` + `npm run validate` 后运行该脚本并写入 `$GITHUB_STEP_SUMMARY`。
- 脚本在本地/非 Actions 环境下退化为 stdout 输出，避免对开发流程造成负担。

## 3) 文档与版本
- README 简短补充“监控/稳定性”能力点。
- 版本号 SemVer Patch 升级；更新 `helloagents/CHANGELOG.md` 与 `helloagents/history/index.md`；迁移方案包至 `history/`。

