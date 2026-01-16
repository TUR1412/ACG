# 任务清单: UI 进化（Accent / 视图预设 / 深链分享 / Cmdk 扩展）

目录: `helloagents/plan/202601162150_ui-evolution/`

---

## 1. 客户端交互（client-app）

- [√] 1.1 在 `src/client/constants.ts` 增加 Accent/View Presets 相关 localStorage key
- [√] 1.2 在 `src/client/app.ts` 实现 Accent 模式（dataset + localStorage + 事件）
- [√] 1.3 在 `src/components/organisms/PreferencesPanel.astro` 增加 Accent 选择 UI
- [√] 1.4 在 `src/client/app.ts` 增加 View Presets：保存/应用/重命名/删除/复制链接
- [√] 1.5 在 `src/client/app.ts` 实现“从 URL 应用视图快照”的逻辑，并在应用后清理 URL
- [√] 1.6 在 `src/client/features/cmdk.ts` 增加 Accent 命令与 View Presets 应用命令

## 2. 视觉系统（web-ui / global css）

- [√] 2.1 在 `src/styles/global.css` 增加基于 `data-acg-accent` 的 CSS 变量与氛围光斑动效

## 3. 安全检查

- [√] 3.1 执行安全检查（按G9：输入验证、敏感信息处理、权限控制、EHRB 风险规避）
  > 备注: 本次变更不涉及外部密钥写入；URL 参数解析使用白名单枚举+默认值兜底；localStorage 全部 try/catch 容错；浏览器端无 console 输出。

## 4. 文档更新

- [√] 4.1 更新 `README.md`：补齐 Accent/View Presets/深链分享 的说明与演示占位
- [√] 4.2 更新 `helloagents/wiki/modules/client-app.md` 与 `helloagents/wiki/modules/web-ui.md`
- [√] 4.3 更新 `helloagents/CHANGELOG.md`（Unreleased）

## 5. 测试与质量门禁

- [√] 5.1 执行 `npm test`
- [√] 5.2 执行 `npm run lint`
- [√] 5.3 执行 `npm run format:check`
- [√] 5.4 执行 `npm run check`
- [√] 5.5 执行 `npm run build`

## 6. 发布准备

- [ ] 6.1 生成规范提交（Conventional Commits），并尝试推送到远端
- [ ] 6.2 完成后迁移方案包到 `helloagents/history/2026-01/` 并更新 `helloagents/history/index.md`
