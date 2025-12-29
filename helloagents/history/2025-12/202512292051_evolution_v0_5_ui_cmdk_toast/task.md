# 任务清单: evolution_v0_5_ui_cmdk_toast

目录: `helloagents/history/2025-12/202512292051_evolution_v0_5_ui_cmdk_toast/`

---

## 1. Command Palette：视觉强化
- [√] 1.1 分组标题（导航/搜索/过滤/系统/分享）
- [√] 1.2 关键词高亮（title/desc）
- [√] 1.3 列表滚动条与 focus-visible（可访问性细节）
- [√] 1.4 弹层入场动效微调（更贴合玻璃拟态体系）

## 2. Toast：商业级反馈
- [√] 2.1 variant 图标（info/success/error）
- [√] 2.2 hover 阴影提升（更明确的交互反馈）
- [√] 2.3 点击消失 + 离场动画（更可控，避免堆叠干扰）

## 3. 性能与降级
- [√] 3.1 `data-acg-perf="low"` 下禁用 Command Palette backdrop blur（减少合成开销）

## 4. 文档与发布
- [√] 4.1 更新 `README.md`（命令面板 UI 能力说明）
- [√] 4.2 更新 `helloagents/CHANGELOG.md` 与模块文档（client-app / web-ui）
- [√] 4.3 验证：`npm run check` / `npm run build` / `npm run budget`
- [√] 4.4 发布：提交并推送至 `origin/main`
