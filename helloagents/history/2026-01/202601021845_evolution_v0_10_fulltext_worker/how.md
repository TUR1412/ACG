# 技术设计: evolution_v0_10_fulltext_worker

## 技术方案

### 核心技术
- Web Worker（Vite module worker）
- 既有全文预览逻辑（fetch + 归一化 + 渲染 + 去壳/增强 + 翻译）

### 实现要点

#### 1) Worker 协议（message schema）
新增 `src/client/workers/fulltext.worker.ts`，使用 `postMessage` 进行请求-响应：
- `render`：输入 Markdown + baseUrl，输出 HTML 字符串（可直接注入 `innerHTML`）。
- `translate`：输入原文 Markdown + target，输出翻译 Markdown（保留现有 gtx 行为）。

输出以 `requestId` 关联，主线程用 `renderSeq`/`requestId` 双保险避免错序渲染：
- 用户切换“原文/翻译”、点击“重新加载”时，旧请求结果会被丢弃。

#### 2) 主线程职责收敛
`src/client/features/fulltext.ts`：
- 只负责：状态文案、按钮状态、localStorage 缓存、DOM 注入、以及把去壳/增强延后到 idle 的调度。
- 若 Worker 创建失败：回退到原有主线程渲染/翻译函数。

#### 3) 低性能与滚动期策略一致化
- 继续沿用 `data-acg-perf="low"` / `data-acg-scroll="1"`：
  - 低性能：默认不自动翻译；并可进一步将 autoload 视为关闭（用户点击按钮再加载）。
  - 滚动期：延后自动翻译，避免抢占主线程。

## 架构决策 ADR

### ADR-010: 全文预览渲染/翻译迁移到 Web Worker
**上下文:** 长文渲染与翻译切块处理会造成主线程短时阻塞，移动端体感明显。
**决策:** 引入 module worker 承担渲染与翻译重计算，主线程仅做 UI 与 DOM 注入。
**理由:** 显著降低主线程阻塞风险，提升滚动/交互稳定性；且可回退保证可用性。
**替代方案:** 继续在主线程做分片渲染/translate → 实现复杂且仍占主线程。
**影响:** 增加 worker 文件与消息协议，但换来可观的移动端体验提升。

## 测试与部署
- `npm run check`
- `npm run build`
- `npm run budget`
- （本地）`npm run sync`（最小化参数）→ `npm run validate`

