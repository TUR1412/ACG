# 任务清单: 启动级错误边界 & 同步日志摘要

目录: `helloagents/plan/202601120506_monitoring_boundary/`

---

## 1. 启动级错误边界（前端）
- [√] 1.1 重构 `src/client/app.ts`：监控先行 + init try/catch
- [√] 1.2 失败降级：记录 telemetry 事件（必要时 toast 轻提示）

## 2. 同步日志摘要（Actions）
- [√] 2.1 新增 `scripts/step-summary.ts`（Step Summary 生成）
- [√] 2.2 更新 `hourly-sync-and-deploy.yml`：写入 `$GITHUB_STEP_SUMMARY`

## 3. 文档与版本
- [√] 3.1 README 补充稳定性/监控要点
- [√] 3.2 更新 `helloagents/CHANGELOG.md`
- [√] 3.3 更新 `helloagents/history/index.md` 并迁移方案包至 `history/`
- [√] 3.4 版本号升级（SemVer Patch）

## 4. 自测
- [√] 4.1 `npm test`
- [√] 4.2 `npm run check`
- [√] 4.3 `npm run build`
- [√] 4.4 `npm run budget`
