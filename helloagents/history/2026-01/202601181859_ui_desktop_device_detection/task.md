# 任务清单: 修复桌面端设备类型误判（desktop ↔ phone）

目录: `helloagents/plan/202601181859_ui_desktop_device_detection/`
类型: 轻量迭代

---

## 1. 问题定位

- [√] 1.1 复现桌面端 UI 异常（底部导航覆盖、布局节奏错误）
- [√] 1.2 确认根因：`html[data-acg-device="phone"]` 触发移动端样式覆盖

## 2. 修复实现

- [√] 2.1 在 `src/layouts/SiteLayout.astro` 增加桌面 UA 保护（Windows/X11/Macintosh）
- [√] 2.2 仅在非桌面 UA 下允许 `screen` 短边兜底判定 phone/tablet
- [√] 2.3 保留 iPadOS（桌面站点伪装 Mac）优先识别为 tablet

## 3. 文档同步（SSOT）

- [√] 3.1 更新 `helloagents/wiki/modules/web-ui.md`：补充 `data-acg-device` 判定策略与桌面保护说明
- [√] 3.2 更新 `helloagents/CHANGELOG.md`（Unreleased）：记录 UI 修复

## 4. 测试与质量门禁

- [√] 4.1 执行 `npm test`
- [√] 4.2 执行 `npm run lint`
- [√] 4.3 执行 `npm run format:check`
- [√] 4.4 执行 `npm run check`
- [√] 4.5 执行 `ACG_BASE=/ACG npm run build`

## 5. 发布

- [√] 5.1 提交并推送到 `origin/main`
- [√] 5.2 迁移方案包至 `helloagents/history/2026-01/` 并更新 `helloagents/history/index.md`
