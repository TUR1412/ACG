# 任务清单: Telemetry Viewer（本地事件查看）与隐私加固

目录: `helloagents/plan/202601120130_telemetry_viewer_privacy/`

---

## 1. Telemetry Viewer（页面 + wiring）
- [√] 1.1 新增 Telemetry Viewer 页面（zh/ja），并提供入口链接
- [√] 1.2 新增 client feature：渲染列表/过滤/导出/清空/统计
- [√] 1.3 在 `src/client/app.ts` 中按需 lazy import（仅 telemetry 页加载）

## 2. 隐私加固
- [√] 2.1 telemetry：`path` 不再包含 query/hash；`referrer` 剥离 query/hash
- [√] 2.2 monitoring：`sanitizeOneLine` 剥离 URL query/hash

## 3. 测试与文档
- [√] 3.1 新增/更新单元测试覆盖 sanitization 行为
- [√] 3.2 README（双语）补充 Telemetry Viewer 入口与说明
- [√] 3.3 wiki 同步 `client-app` / `web-ui` 模块文档
- [√] 3.4 更新 `helloagents/CHANGELOG.md` 并升级版本号（SemVer）

## 4. 自测
- [√] 4.1 `npm test`
- [√] 4.2 `npm run check`
- [√] 4.3 `npm run build`
- [√] 4.4 `npm run budget`
