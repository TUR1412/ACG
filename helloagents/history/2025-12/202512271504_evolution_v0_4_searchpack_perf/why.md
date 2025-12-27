# 变更提案: evolution_v0_4（全站搜索 60FPS：search-pack + 取消/截断 + 性能自适应降级）

## 需求背景
站点已具备“本地优先 + Web Worker 全站搜索”的产品能力，但当数据规模增长（来源增多、条目累积）时，运行时构建索引与长列表筛选会放大性能波动：输入卡顿、滚动掉帧、以及弱网下冷启动等待时间变长。

本次演进以“不引入后端/不改变静态站点部署”作为前提，通过把计算从运行时前移到构建期，并在前端引入可取消/可截断与自动性能分级，确保在极端大数据下依旧保持 60FPS 的交互稳定性。

## 目标与成功标准
- **性能:** 全站搜索在海量数据下，输入与滚动保持稳定（目标 60FPS）。
- **体验:** 弱网/离线场景下，搜索数据具备可缓存与可回退策略，减少“空白等待”。
- **稳定性:** Worker 支持请求取消、结果截断（提示用户收窄条件），并具备 IndexedDB 缓存与版本迁移。
- **视觉一致性:** 保持国漫风格玻璃拟态质感；低性能/省流量设备自动降级昂贵效果以避免掉帧。

## 变更内容
1. **构建期 search-pack 产物**
   - 同步管线在生成 `posts.json` 的同时生成 `search-pack.v1.json(.gz)`（posts + 预计算索引行）。
2. **全站搜索 Worker 升级**
   - 优先加载 search-pack（否则回退 posts 并在 Worker 内补建索引）。
   - IndexedDB 缓存升级为 posts+index（含版本迁移），减少重复计算。
   - 加入请求取消与结果截断，避免长时间占用 Worker 导致“输入跟不上”。
3. **性能自适应视觉降级**
   - 基于连接/设备信息做启动时初判，并在运行时通过短时间 FPS 采样自动切换 `data-acg-perf="low"`，统一降低 blur/阴影/边框动画开销。
4. **PWA 缓存完善**
   - Service Worker 将 search-pack 纳入 data 缓存策略（stale-while-revalidate），改善冷启动与弱网体验。
5. **知识库同步**
   - 更新 pipeline-sync、client-app、web-ui 的模块文档与变更日志，确保文档与代码一致。

## 影响范围
- **模块:**
  - pipeline-sync
  - client-app
  - web-ui
  - pwa（Service Worker）
- **文件:**
  - `scripts/sync.ts`
  - `scripts/validate-generated-data.ts`
  - `public/sw.js`
  - `src/client/constants.ts`
  - `src/client/workers/search.worker.ts`
  - `src/client/app.ts`
  - `src/layouts/SiteLayout.astro`
  - `src/styles/global.css`
  - `helloagents/wiki/modules/pipeline-sync.md`
  - `helloagents/wiki/modules/client-app.md`
  - `helloagents/wiki/modules/web-ui.md`
  - `helloagents/CHANGELOG.md`

## 风险评估
- **风险:** search-pack 体积增长导致弱网加载变慢  
  **缓解:** gzip + SW 缓存 + Worker 优先走压缩资源。
- **风险:** IndexedDB 版本迁移导致旧缓存不一致  
  **缓解:** 兼容旧版本结构并自动迁移；解析时做越界过滤与抽样校验。
- **风险:** 自动性能分级误判（过度降级）  
  **缓解:** 静态启发式 + 运行时 FPS 采样双保险；降级仅针对昂贵效果，保留基本视觉质感。

