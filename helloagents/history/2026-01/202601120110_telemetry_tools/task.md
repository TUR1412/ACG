# 任务清单: Telemetry 自助排障（导出/清空 + 统计）

目录: `helloagents/plan/202601120110_telemetry_tools/`

---

## 1. UI（Preferences）
- [√] 1.1 在 Telemetry 区域新增“导出/清空”按钮，并展示事件数与体积
- [√] 1.2 补齐 i18n keys（zh/ja）

## 2. Wiring（telemetry-prefs）
- [√] 2.1 读取本地 telemetry 并同步 count/size 展示
- [√] 2.2 实现导出（download json）与清空（removeItem）动作，并用 Toast 反馈

## 3. 文档同步
- [√] 3.1 README：Telemetry 小节补充导出/清空说明（zh/ja）
- [√] 3.2 wiki：同步 `client-app` / `web-ui` 模块文档
- [√] 3.3 CHANGELOG：新增版本条目并升级版本号（SemVer）

## 4. 自测
- [√] 4.1 `npm test`
- [√] 4.2 `npm run check`
- [√] 4.3 `npm run build`
- [√] 4.4 `npm run budget`
