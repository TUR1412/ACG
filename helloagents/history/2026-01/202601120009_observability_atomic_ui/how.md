# 技术设计: 观测增强（错误捕获 + 性能埋点）与 Atomic UI 组件化

## 技术方案

### 核心技术
- `src/client/utils/telemetry.ts`（既有，本地优先埋点）
- `window.addEventListener("error" | "unhandledrejection")`（全局错误捕获）
- `PerformanceObserver`（LCP/CLS/longtask 观测）
- Astro 组件抽象（atoms）用于 UI 复用

### 实现要点

#### 1) 全局错误捕获（OCP 增量扩展）
- 新增 `src/client/utils/monitoring.ts`（或同类模块）：
  - `wireGlobalErrorMonitoring()`：注册 `error` / `unhandledrejection` 监听，生成可序列化、可截断的 payload，并 `track()` 写入 telemetry。
  - 内置 **去重 + 节流**：同类错误短时间内只记录一次，避免噪音与性能回退。
  - 通过派发 `acg:toast` 事件给出轻提示（复用现有 toast bridge）。

#### 2) 性能观测（LCP/CLS/longtask）
- 新增 `wirePerfMonitoring()`：
  - LCP：记录最新值，页面隐藏/离开时写入 telemetry。
  - CLS：只累计 `hadRecentInput=false` 的 shift，页面隐藏时写入 telemetry。
  - longtask：抽样记录（例如每 N 秒最多 1 条）以控制体量。
- 所有逻辑 **惰性、可降级**：浏览器不支持时自动跳过。

#### 3) Atomic UI（atoms）组件化
- 新增 `src/components/atoms/Chip.astro` 作为基础原子：
  - 支持 `button/a` 两种渲染
  - 支持 icon slot 或 icon props（复用 `Icon.astro`）
  - 支持透传 `data-*`、`aria-*` 与 `role`，保持现有行为不变
- 采用增量替换：先覆盖首页/分类页/信号板，避免一次性大改导致风险不可控。

#### 4) 单元测试
- 新增/扩展纯函数测试（Node 环境可跑）：
  - 错误归一化（message/stack 截断、去噪 key 生成）
  - 采样/节流策略的边界条件
- 避免在单元测试中依赖 DOM/PerformanceObserver，保证稳定性。

## 架构决策 ADR

### ADR-001: 使用本地优先 telemetry 承载错误与性能观测
**上下文:** 项目为静态站，默认不引入后端；需要可回溯线索但不牺牲隐私。
**决策:** 错误与性能事件默认写入 localStorage telemetry；仅在用户显式开启上传后才尝试发送。
**理由:** 满足隐私与可观测性平衡；不改变核心架构。
**替代方案:** 引入第三方监控 SDK。→ 拒绝原因: 增加依赖与隐私风险，且违背“轻量/可长期跑”目标。
**影响:** telemetry 事件类型扩充，但体量受控（节流/采样）。

### ADR-002: Atomic UI 以增量替换方式落地
**上下文:** UI 组件数量较多，直接全量迁移风险高。
**决策:** 先引入 atoms（Chip），在关键入口页面替换；其他区域按需迁移。
**理由:** 最小风险路径；逐步提升复用度与一致性。

## 安全与性能
- **安全:** 不记录敏感信息；错误与栈信息截断并去除明显的 URL query；默认不上传。
- **性能:** 观测逻辑惰性注册；longtask 采样；toast 仅在必要时提示且带节流；不引入大体积依赖。

## 测试与部署
- `npm test`
- `npm run check`
- `npm run build`
- `npm run budget`
- 合并策略：基于 `origin/main` rebase/merge（不强制覆盖），确保可追溯。

