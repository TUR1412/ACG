# 任务清单: Atomic Segmented + 键盘可访问性

目录: `helloagents/plan/202601120620_atomic_segmented_a11y/`

---

## 1. Atomic UI
- [√] 1.1 新增 `Segmented` / `SegmentedItem` atoms
- [√] 1.2 `PreferencesPanel` 替换为 atoms（保持 data-* 协议不变）

## 2. A11y（键盘）
- [√] 2.1 `app.ts` 增加 radiogroup roving tabindex
- [√] 2.2 `app.ts` 增加方向键/Home/End 切换并触发 click
- [√] 2.3 首页/分类页 View/Density chips 增加 radiogroup 包裹

## 3. 知识库与版本
- [√] 3.1 版本号升级（SemVer Patch）
- [√] 3.2 更新 `helloagents/CHANGELOG.md`
- [√] 3.3 更新 `helloagents/wiki/modules/web-ui.md`
- [√] 3.4 更新 `helloagents/wiki/modules/client-app.md`
- [√] 3.5 更新 `helloagents/history/index.md` 并迁移方案包至 `history/`

## 4. 自测
- [√] 4.1 `npm test`
- [√] 4.2 `npm run check`
- [√] 4.3 `npm run build`
- [√] 4.4 `npm run budget`
