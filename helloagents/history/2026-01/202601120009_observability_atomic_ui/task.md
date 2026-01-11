# 任务清单: 观测增强（错误捕获 + 性能埋点）与 Atomic UI 组件化

目录: `helloagents/plan/202601120009_observability_atomic_ui/`

---

## 1. 观测增强（client-app）
- [√] 1.1 新增全局错误捕获模块（`error`/`unhandledrejection`，含去重/节流/截断），并接入 telemetry（验证 why.md#需求-未捕获异常可回溯-场景-promise-未处理拒绝）
- [√] 1.2 新增性能观测模块（LCP/CLS/longtask，含采样/降级），并接入 telemetry（验证 why.md#需求-性能问题可定位-场景-采集并记录-web-vitals）
- [√] 1.3 在 `src/client/app.ts` 中以最小侵入方式接入监控 wiring（不改变既有业务逻辑路径）

## 2. Atomic UI 组件化（web-ui）
- [√] 2.1 新增 `src/components/atoms/Chip.astro` 并在首页/分类页/信号板增量替换（验证 why.md#需求-atomic-ui-降低重复-场景-首页分类页-chips-统一渲染）

## 3. 单元测试覆盖
- [√] 3.1 为新增的“错误归一化/采样/节流”等纯函数补齐测试用例，保证 Node 环境可跑

## 4. 安全检查
- [√] 4.1 执行安全检查（G9）：确认不引入密钥/隐私泄露路径；确认不新增危险命令

## 5. 文档与知识库同步
- [√] 5.1 更新 `README.md`（双语）：补充观测能力与 Atomic UI 结构
- [√] 5.2 更新 `helloagents/wiki/modules/client-app.md` 与 `helloagents/wiki/modules/web-ui.md`
- [√] 5.3 更新 `helloagents/CHANGELOG.md` 并按 SemVer 升级版本号

## 6. 测试
- [√] 6.1 运行 `npm test`
- [√] 6.2 运行 `npm run check`
- [√] 6.3 运行 `npm run build`
- [√] 6.4 运行 `npm run budget`
