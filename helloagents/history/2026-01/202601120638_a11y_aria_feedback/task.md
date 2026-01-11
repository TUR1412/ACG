# 任务清单: A11y 语义补齐（Quick Chips / Prefs Feedback）

目录: `helloagents/plan/202601120638_a11y_aria_feedback/`

---

## 1. Quick Chips
- [√] 1.1 `wireQuickToggles` 同步写入 `aria-pressed`

## 2. Prefs Feedback
- [√] 2.1 `#acg-prefs-message` 增加 live region 语义（status/live/atomic）
- [√] 2.2 `setPrefsMessage` 调整更新顺序以提升播报稳定性

## 3. Word Chips
- [√] 3.1 关注词/屏蔽词删除按钮补齐 `aria-label`

## 4. 知识库与版本
- [√] 4.1 版本号升级（SemVer Patch）
- [√] 4.2 更新 `helloagents/CHANGELOG.md`
- [√] 4.3 更新 `helloagents/wiki/modules/client-app.md`
- [√] 4.4 更新 `helloagents/wiki/modules/web-ui.md`
- [√] 4.5 更新 `helloagents/history/index.md` 并迁移方案包至 `history/`

## 5. 自测
- [√] 5.1 `npm test`
- [√] 5.2 `npm run check`
- [√] 5.3 `npm run build`
- [√] 5.4 `npm run budget`
