# How: 实施方案

## 1) Atomic UI：分段控件抽象
- 新增 atoms：
  - `src/components/atoms/Segmented.astro`：分段容器（`role="radiogroup"` + `aria-label`）
  - `src/components/atoms/SegmentedItem.astro`：分段项（`role="radio"` + 默认 `aria-checked="false"`，透传 `data-*`）
- 在 `src/components/PreferencesPanel.astro` 中替换重复的 `acg-seg` / `acg-seg-item` DOM，保证 class 与 data 属性兼容原有 CSS/JS。

## 2) A11y：roving tabindex + 方向键切换
- 在 `src/client/app.ts` 中实现通用 radiogroup 键盘交互：
  - 在每个 `[role="radiogroup"]` 内，对 `[role="radio"]` 做 roving tabindex：
    - 当前 `aria-checked="true"` 的项 `tabindex=0`
    - 其余项 `tabindex=-1`
    - 无选中项时，首项 `tabindex=0`
  - 支持键盘：
    - `ArrowLeft/ArrowUp` → 上一个
    - `ArrowRight/ArrowDown` → 下一个
    - `Home/End` → 首/尾
    - 切换时触发 `click`（复用既有逻辑，不新增状态分叉）
- 为首页与分类页的 View/Density chips 增加 `role="radiogroup"` 包裹（仅语义增强，不改变布局与功能）。

## 3) 文档与版本闭环
- bump 版本：`0.5.11` → `0.5.12`
- 更新知识库与历史索引：
  - `helloagents/CHANGELOG.md`
  - `helloagents/wiki/modules/web-ui.md`（Atoms：Segmented）
  - `helloagents/wiki/modules/client-app.md`（Keyboard/A11y：radiogroup）
  - `helloagents/history/index.md` + 方案包迁移到 `history/2026-01/`

