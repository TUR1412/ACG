# How: 实施方案

## 1) Quick Chips：aria-pressed
- 在 `src/client/app.ts` 的 `wireQuickToggles()` 中：
  - 继续用 `data-active` 控制视觉态
  - 同步写入 `aria-pressed="true|false"`（状态语义）

## 2) Prefs Feedback：live region
- 在 `src/components/PreferencesPanel.astro` 的 `#acg-prefs-message` 上增加：
  - `role="status"`
  - `aria-live="polite"`
  - `aria-atomic="true"`
- 在 `setPrefsMessage()` 中调整更新顺序：先显示再写入文本，提升被播报概率。

## 3) Word Chips：aria-label
- 在 `renderWordChips()` 中为每个删除按钮设置 `aria-label`（中日文），明确“删除关注/删除屏蔽 + 关键词”的动作语义。

## 4) 版本与知识库闭环
- bump 版本：`0.5.12` → `0.5.13`
- 更新：
  - `helloagents/CHANGELOG.md`
  - `helloagents/wiki/modules/client-app.md`（A11y/语义补齐）
  - `helloagents/wiki/modules/web-ui.md`（UI atoms / feedback 语义）
  - `helloagents/history/index.md` + 方案包迁移归档

