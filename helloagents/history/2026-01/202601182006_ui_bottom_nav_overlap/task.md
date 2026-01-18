# 任务清单: 修复底部导航遮挡/重叠（tablet/触控兜底 + 大视口）

目录: `helloagents/plan/202601182006_ui_bottom_nav_overlap/`
类型: 轻量迭代

---

## 1. 问题定位

- [√] 1.1 确认重叠表现：底部导航启用时，主内容/Footer/浮层在大视口（≥1024）下可能被遮挡
- [√] 1.2 确认根因：
  - `--acg-bottom-nav-h` 仅在 `max-width: 1023px` 与 `data-acg-device="phone"` 下设置
  - `data-acg-device="tablet"` 与触控 CSS 兜底在大视口启用底部导航时，变量仍为 0
  - 同时 `lg:py-8` 会把 `.acg-main` 的 `padding-bottom` 降到 32px，导致与 fixed 底部导航重叠

## 2. 修复实现

- [√] 2.1 `src/styles/global.css`：为 `data-acg-device="tablet"` 补齐 `--acg-bottom-nav-h: 78px`
- [√] 2.2 `src/styles/global.css`：让 `.acg-main/.acg-footer` 在 tablet 场景也强制补齐 `padding-bottom`
- [√] 2.3 `src/styles/global.css`：触控 CSS 兜底仅在 `hover: none` 场景触发，并在兜底时设置 `--acg-bottom-nav-h`

## 3. 文档同步（SSOT）

- [√] 3.1 更新 `helloagents/wiki/modules/web-ui.md`：补充 `--acg-bottom-nav-h` 的启用场景与约束
- [√] 3.2 更新 `helloagents/CHANGELOG.md`（Unreleased）：记录重叠修复

## 4. 测试与质量门禁

- [√] 4.1 执行 `npm test`
- [√] 4.2 执行 `npm run format:check`

## 5. 发布

- [√] 5.1 提交并推送到 `origin/main`
- [√] 5.2 迁移方案包至 `helloagents/history/2026-01/` 并更新 `helloagents/history/index.md`
