# 任务清单: evolution_v0_4_searchpack_perf

目录: `helloagents/plan/202512271504_evolution_v0_4_searchpack_perf/`

---

## 1. 同步管线：search-pack 产物
- [√] 1.1 在 `scripts/sync.ts` 生成 `src/data/generated/search-pack.v1.json` 与 `public/data/search-pack.v1.json(.gz)`
- [√] 1.2 保持产物 minify + gzip，并沿用现有 `.gitignore` 忽略策略

## 2. 校验门禁：validate 扩展
- [√] 2.1 在 `scripts/validate-generated-data.ts` 增加 search-pack 结构校验与一致性检查

## 3. 全站搜索：Worker 优先加载 + IDB 缓存升级
- [√] 3.1 扩展 Worker init 协议，新增 `indexUrl/indexGzUrl`
- [√] 3.2 IndexedDB 缓存升级为 v2（posts + index），并兼容迁移旧 v1
- [√] 3.3 Worker 优先加载 `search-pack.v1.json(.gz)`，失败回退 `posts.json(.gz)` 并补建索引

## 4. 60FPS 稳态：取消/截断/主线程防御
- [√] 4.1 Worker 搜索支持请求取消（activeRequestId）
- [√] 4.2 结果超过阈值返回 `truncated=true`，主线程提示用户收窄条件
- [√] 4.3 全站模式下空 query 且无过滤时不触发搜索请求，避免“全量渲染”

## 5. 视觉系统：性能自适应降级
- [√] 5.1 `SiteLayout.astro` 注入静态启发式（连接/设备信息）设置 `data-acg-perf="low"`
- [√] 5.2 `src/client/app.ts` 增加运行时 FPS 采样自动降级
- [√] 5.3 `src/styles/global.css` 增加 `:root[data-acg-perf="low"]` 降级令牌与动画禁用策略

## 6. PWA 缓存：data 请求覆盖
- [√] 6.1 `public/sw.js` 将 `search-pack.v1.json(.gz)` 纳入 data 缓存

## 7. 文档与历史归档
- [√] 7.1 更新 `helloagents/CHANGELOG.md`
- [√] 7.2 更新 `helloagents/wiki/modules/pipeline-sync.md`、`helloagents/wiki/modules/client-app.md`、`helloagents/wiki/modules/web-ui.md`
- [√] 7.3 更新 `helloagents/history/index.md` 并迁移方案包至 `helloagents/history/2025-12/`

