# 技术设计: UI 进化（Accent / 视图预设 / 深链分享 / Cmdk 扩展）

## 技术方案

### 核心技术

- Astro（静态页面渲染）
- TypeScript（前端交互层）
- Tailwind + 全局 CSS 变量（视觉系统）
- localStorage（本地持久化）
- CustomEvent（跨模块事件桥接）

### 实现要点

#### 1) Accent（强调色）

- 数据模型：`AccentMode = "neon" | "sakura" | "ocean" | "amber"`
- 存储：`localStorage["acg.accent.v1"]`
- DOM 驱动：`<html data-acg-accent="...">`
- 通知：`acg:accent-changed`（可用于后续可视化或分析）

#### 2) View Presets（视图预设）

- 存储：`localStorage["acg.viewPresets.v1"]`
- 结构：`{ version: 1, presets: Array<{ version: 1, id, name, createdAt, snapshot }> }`
- snapshot 统一包含：`q/scope/filters/view/density/theme/accent`
- UI：偏好面板提供保存/复制链接；列表提供应用/复制/重命名/删除

#### 3) 深链（可复现视图链接）

链接参数约定（与默认值做差分输出）：

- `q`：搜索
- `scope`：`page | all`
- `only` / `onlySources` / `hide` / `stable` / `dedup`：布尔开关，`1` 表示 true
- `lens`：`all | 2h | 6h | 24h`
- `sort`：`latest | pulse`
- `view`：`grid | list`
- `density`：`comfort | compact`
- `theme`：`auto | light | dark`
- `accent`：`neon | sakura | ocean | amber`

应用策略：

- 若 URL 仅携带 `q`：只预填搜索，不改动其他偏好（兼容旧链接）
- 若 URL 携带任一视图参数：按“完整快照”应用，并在应用后清理 URL 参数，避免刷新重复覆盖

#### 4) Cmdk 扩展

- 强调色切换：在命令面板追加 `accent_*` 命令
- 视图预设：动态读取本地预设列表，为每条预设生成“应用”命令
- 事件桥接：通过 `acg:apply-view-preset` 将“应用预设”的动作交给 `app.ts` 统一执行

## 安全与性能

- 安全：
  - localStorage 读写统一 try/catch，避免权限受限导致崩溃
  - URL 参数解析使用白名单枚举 + 默认值兜底，避免异常值污染状态
- 性能：
  - 视图预设 UI 与 Cmdk 均为轻量逻辑，不引入第三方依赖
  - 深链应用仅在初始化阶段执行一次，并清理 URL 以避免重复执行

## 测试与部署

- 测试门禁：
  - `npm test`
  - `npm run lint`
  - `npm run format:check`
  - `npm run check`
  - `npm run build`
- 部署：
  - GitHub Pages base path 由 `ACG_BASE` 控制（CI/Pages 设为 `/ACG`，本地默认 `/`）
