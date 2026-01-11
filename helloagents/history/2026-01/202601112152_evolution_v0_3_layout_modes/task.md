# 任务清单: Layout Modes & Client State Refactor

目录: `helloagents/plan/202601112152_evolution_v0_3_layout_modes/`

---

## 1. client-app（状态与存储）
- [√] 1.1 新增 `src/client/state/storage.ts`：封装安全 JSON parse 与 localStorage 读写辅助，降低重复 try/catch，验证 why.md#需求-client-state-refactor-场景-safer-iteration
- [√] 1.2 在 `src/client/constants.ts` 增加 `STORAGE_KEYS.VIEW_MODE` / `STORAGE_KEYS.DENSITY`，并在 `src/client/app.ts` 接入读写与 dataset 同步，验证 why.md#需求-view-mode（视图模式）-场景-desktop-scan 与 why.md#需求-density（信息密度）-场景-compact-reading

## 2. web-ui（偏好面板与i18n）
- [√] 2.1 在 `src/i18n/i18n.ts` 增加 View/Density 文案 key（zh/ja），并在 `src/components/PreferencesPanel.astro` 新增对应 segmented controls，验证 why.md#需求-view-mode（视图模式）-场景-desktop-scan

## 3. styles（表现层覆盖）
- [√] 3.1 在 `src/styles/global.css` 增加 `data-acg-view` / `data-acg-density` 的覆盖样式，使 list/compact 只影响表现层且默认不变，验证 why.md#需求-density（信息密度）-场景-compact-reading

## 4. 安全检查
- [√] 4.1 执行安全检查（按G9：输入验证、敏感信息处理、权限控制、避免引入明文密钥）

## 5. 文档更新
- [√] 5.1 更新 `README.md`（对齐新增偏好项与快捷入口说明，保持双语）
- [√] 5.2 同步更新知识库：`helloagents/wiki/modules/client-app.md`、`helloagents/wiki/modules/web-ui.md`、`helloagents/wiki/project.md`（如需）以及 `helloagents/CHANGELOG.md`

## 6. 测试
- [√] 6.1 `npm test`
- [√] 6.2 `npm run check`
- [√] 6.3 `npm run build`
- [√] 6.4 `npm run budget`
