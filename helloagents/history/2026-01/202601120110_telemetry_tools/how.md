# 技术设计: Telemetry 自助排障（导出/清空 + 统计）

## 设计原则

- **开闭原则（OCP）**：通过增量扩展实现，不改变既有 telemetry 记录与上传机制。
- **最小侵入**：仅在偏好面板（UI）与 telemetry-prefs（wiring）增加能力，不改动核心业务路径。
- **隐私优先**：导出/清空由用户显式点击触发，默认无上传行为。

## 实现要点

### 1) UI（web-ui）

- 在 `PreferencesPanel.astro` 的 Telemetry 详情区域增加：
  - `导出` / `清空` 两个按钮
  - 事件数（count）与体积（size）展示
- 文案通过 i18n key 提供 zh/ja 双语。

### 2) Wiring（client-app）

- 在 `src/client/features/telemetry-prefs.ts` 中：
  - 读取 `localStorage[acg.telemetry.v1]` 并解析 `version/events` 计算 count
  - 使用 `Blob.size` 估算占用体积并格式化显示（B/KB/MB）
  - 导出：构造 JSON Blob → `URL.createObjectURL` → 触发下载
  - 清空：`localStorage.removeItem`
  - 通过 Toast 轻提示反馈（复用 `acg:toast` 事件桥接）

## 风险与缓解

- **风险：** 导出时 payload 较大可能造成短暂卡顿
  - **缓解：** telemetry 有上限（MAX_EVENTS），导出由用户主动触发，且仅序列化已有 raw JSON 字符串
- **风险：** 清空后再 track 会“回填”新的事件
  - **缓解：** 清空操作不再调用 track，避免产生“清空后又出现一条”的违和感
