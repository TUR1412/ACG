# 技术设计: Telemetry Viewer（本地事件查看）与隐私加固

## 1) Telemetry Viewer 页面

### 路由
- 中文：`/zh/telemetry/`
- 日本語：`/ja/telemetry/`

### 页面结构（Astro）
- 使用 `SiteLayout.astro` 维持站点一致性（玻璃拟态/栅格/主题）
- 页面仅提供“容器 DOM + data 标记”，具体渲染交由 client feature 处理

### Client wiring
- 新增 `src/client/features/telemetry-viewer.ts`
- 在 `src/client/app.ts` 中检测 `[data-telemetry-viewer]` 存在时才动态 import 并执行，避免影响其他页面首屏
- UI 交互：
  - 过滤：按 type/path/data 的 JSON 文本匹配（大小写不敏感）
  - 导出：下载本地 telemetry JSON
  - 清空：删除本地 telemetry key 并刷新列表
  - 统计：事件数 + 占用体积（B/KB/MB）

## 2) 隐私加固（Telemetry / Monitoring）

### telemetry.ts
- `event.path`：记录 `window.location.pathname`（不含 `search/hash`）
- `page_view.referrer`：剥离 URL 的 query/hash

### monitoring.ts
- `sanitizeOneLine()`：对文本中的 URL 执行 query/hash 剥离（与 stack 的处理对齐），再做空白归一与长度截断

## 3) 测试策略

- 单元测试补充 `sanitizeOneLine` 的 URL query/hash 剥离用例
- 其余变更通过 `astro check` / build / budget 进行回归验证
