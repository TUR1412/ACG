# 技术设计: GitHub 文档体系 + 布局/密度快捷控制增强

## 技术方案

### 核心技术
- Astro + Tailwind（现有）
- 纯前端偏好持久化：`localStorage` + `documentElement.dataset`（现有）
- GitHub Issue Forms（YAML）+ PR Template（Markdown）

### 实现要点
- **Quick Chips（页面层）:** 在首页/分类页的 chip 区域新增 `data-view-mode` / `data-density-mode` 按钮。
  - 复用 `src/client/app.ts` 中的 `wireViewMode()` 与 `wireDensityMode()` 的事件代理与状态同步逻辑。
  - 使用 `data-active` 与 `aria-checked` 与现有样式/可访问性保持一致。
- **Command Palette（客户端）:** 在 `src/client/features/cmdk.ts` 增加布局/密度命令。
  - 优先通过 `click('[data-view-mode="..."]')` 复用既有逻辑；
  - 若目标按钮不存在，则回退为直接写入 `localStorage` 并更新 `documentElement.dataset`，再提示用户。
- **Icon 扩展:** 在 `src/components/Icon.astro` 新增 `grid` / `list`（必要时补充密度相关图标）。

## 架构设计
本次不新增运行时服务，不改变“定时同步 → 静态构建 → 部署”的核心架构；仅补齐：
- GitHub 协作元数据（.github + 根目录 Markdown）
- 前端交互的“入口层”（chips/cmdk）与现有偏好状态层的联动

## 架构决策 ADR

### ADR-001: 布局/密度快捷入口复用现有 wireViewMode/wireDensityMode
**上下文:** 布局/密度已具备持久化与应用逻辑，新增入口不应引入重复状态机。
**决策:** 页面 chip 使用 `data-view-mode` / `data-density-mode`，复用 `wireViewMode()` / `wireDensityMode()` 的既有行为。
**理由:** 最小改动、最小风险；避免在 quick toggle 层引入第二套持久化与状态同步。
**替代方案:** 扩展 `wireQuickToggles()` 增加 `data-quick-view`/`data-quick-density`。→ 拒绝原因: 引入重复语义与更多分支，且与现有 `data-view-mode` 的一致性较差。
**影响:** 页面会新增少量按钮，但逻辑复用，行为稳定。

## 安全与性能
- **安全:** 不引入外部密钥/令牌；GitHub 模板与文档不包含任何敏感信息；客户端新增命令仅写入本地偏好键。
- **性能:** chips 为静态标记；cmdk 命令仅在触发时执行，且优先复用已有事件路径；不增加关键路径计算。

## 测试与部署
- **测试:**
  - `npm test`
  - `npm run check`
  - `npm run build`
  - `npm run budget`
- **部署:** 走现有 GitHub Actions（不修改核心部署逻辑）；本次提交直接推送 `main`。

