# 技术设计: evolution_v0_12_fulltext_progressive_dom

## 1) 输出改为“块级 HTML”
将全文预览的 Markdown 渲染输出从“单个大字符串”升级为“块级 HTML 列表”（blocks）：
- 每个 block 对应一个完整的顶层结构（`<p>`/`<h*>`/`<blockquote>`/`<pre>`/`<ul|ol>...</ul|ol>` 等）
- 对超长列表支持按一定 item 数切块，避免单块过大

这样主线程可以安全地把每个 block 解析成 DOM fragment 并分批追加，而不会破坏标签层级。

## 2) 主线程渐进式 DOM 注入
在 `src/client/features/fulltext.ts` 中：
- 小文本：继续一次性注入（更省开销）
- 长文本/低性能：先同步注入少量 blocks 以快速可见，再通过 `requestIdleCallback`（或 setTimeout 兜底）按时间预算分批追加
- 渲染令牌（renderSeq）继续用于防止错序更新，并支持中途切换/重试取消旧渲染

## 3) Worker 协议扩展（render_result 返回 blocks）
`src/client/workers/fulltext.worker.ts`：
- `render` 返回 `blocks: string[]`（同时保留 `html` 兼容字段，便于回退）

## 4) 验证
- `npm run check`
- `npm run build`（`ACG_BASE=/ACG`）
- `npm run budget`

