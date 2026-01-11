# Why: A11y 语义补齐（Quick Chips / Prefs Feedback）

## 背景
- 项目已具备较完整的 UI 交互体系（偏好面板、快捷 chips、Command Palette、Telemetry/Toast 等），并持续对标 Lighthouse 与可维护性。
- 近期已补齐 radiogroup 的键盘导航与原子组件化（Segmented），A11y 方向进入“细节打磨”阶段。

## 问题
- 快捷 chips（`data-quick-toggle|lens|sort`）目前仅通过 `data-active` 表达状态，对读屏用户不友好（缺少 `aria-pressed` 语义）。
- 偏好面板的即时反馈文案（`#acg-prefs-message`）缺少 live region 语义，屏幕阅读器可能无法及时播报更新。
- 关注词/屏蔽词的“删除按钮”缺少明确的 action 语义（仅有 title），对读屏用户不够清晰。

## 目标
- 保持现有业务逻辑与 DOM 协议不变（不改数据流），通过增量式补齐：
  - Quick chips 的状态语义（`aria-pressed`）
  - 偏好反馈消息的 live region（`role=status` / `aria-live`）
  - 词条删除按钮的 `aria-label`

