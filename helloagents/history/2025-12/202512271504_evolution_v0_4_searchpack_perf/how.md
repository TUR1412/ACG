# 技术设计: evolution_v0_4（全站搜索 60FPS：search-pack + 取消/截断 + 性能自适应降级）

## 技术方案

### 核心技术
- Astro（静态站点）+ Tailwind CSS + 全局 CSS 令牌
- Web Worker：全站搜索与筛选计算下沉
- IndexedDB：缓存 posts 与索引（支持版本迁移）
- Service Worker：data 文件缓存（stale-while-revalidate）

## 实现要点

### 1) search-pack（构建期生成）
- 在 `scripts/sync.ts` 增加 `SearchPackV1` 产物：
  - `posts`: 与站点消费的 posts 一致
  - `index`: 每条 post 的预计算索引行（小而稳定）
- 输出路径：
  - `src/data/generated/search-pack.v1.json`（站点构建期可读）
  - `public/data/search-pack.v1.json(.gz)`（客户端/Worker 拉取）

### 2) validate 作为 CI 门禁
- 在 `scripts/validate-generated-data.ts` 增加对 search-pack 的结构校验：
  - 基本结构（`v/generateAt/posts/index`）
  - `posts.length === index.length`
  - 抽样校验索引行字段类型（避免产物被污染）

### 3) Worker 优先加载 search-pack + 兼容回退
- Worker `init` 消息新增 `indexUrl/indexGzUrl`（对应 search-pack）。
- 加载策略：
  1. 优先拉取 `search-pack.v1.json(.gz)` 并解析得到 `{ posts, index }`
  2. 若失败：回退到 `posts.json(.gz)`，再在 Worker 内补建索引
- IndexedDB 缓存结构升级（v2）：
  - `v=1`: 仅 posts（旧）
  - `v=2`: posts + index（新）
  - 读到旧结构时自动迁移到 v2

### 4) 取消与截断：保证输入跟手
- Worker 维护 `activeRequestId`，每次搜索请求都会替换。
- 搜索循环分片检查取消信号，发现请求已被替换则尽快终止。
- 结果数超过阈值时提前结束并返回 `truncated=true`，主线程提示用户收窄条件。

### 5) 主线程防御：避免空查询“全量渲染”
- 全站模式下，当 query 为空且未开启任何过滤时不发起搜索请求，直接渲染空列表，避免巨量 DOM/虚拟列表压力与无意义计算。

### 6) 性能自适应降级（保持质感，优先稳定）
- `src/layouts/SiteLayout.astro`：启动时基于 `navigator.connection`、`deviceMemory`、`hardwareConcurrency` 等做静态启发式判定，设置 `data-acg-perf="low"`。
- `src/client/app.ts`：启动后做短时间 FPS 采样，低于阈值时自动切换 `data-acg-perf="low"`。
- `src/styles/global.css`：在 `:root[data-acg-perf="low"]` 下统一降低 blur/saturate、阴影强度与边框动画开销。

### 7) Service Worker 缓存补齐
- `public/sw.js` 将 `search-pack.v1.json(.gz)` 纳入 data 缓存策略（stale-while-revalidate）。

## 测试与部署
- CI：`npm run sync` → `npm run validate` → `npm run build`
- 本地建议：
  - `npm ci`
  - `npm run check`
  - `npm run build`
  - （可选）`npm run sync` + `npm run validate` 进行全链路验证

