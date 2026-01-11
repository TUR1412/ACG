# Why: Atomic Segmented + 键盘可访问性（RadioGroup）

## 背景
- 当前偏好面板（PreferencesPanel）中的分段控件（`acg-seg` / `acg-seg-item`）通过 `aria-checked` 标记状态，并由客户端脚本驱动主题/视图/密度/时间透镜/排序等偏好。
- 首页/分类页也存在 View/Density 的快捷 chips（同样使用 `role="radio"` + `aria-checked`），但缺少明确的 radiogroup 语义与键盘导航策略。

## 问题
- 键盘用户体验不够“商业级”：分段控件目前缺少方向键切换（Arrow keys）与 roving tabindex（理想情况下只有当前选中项可 Tab 聚焦）。
- 偏好面板中分段控件存在一定的结构重复，不利于后续按“原子设计”持续迭代与统一升级。

## 目标
- 保持核心架构与业务逻辑根基不变（保持现有 `data-*` 协议与状态存储），以增量方式：
  - 为 radiogroup 增加方向键切换与 roving tabindex（提升无障碍与交互质感）。
  - 抽象偏好面板分段控件为 atoms（`Segmented` / `SegmentedItem`），降低重复与后续改动风险。

