# 变更提案: evolution_v0_16（status-history 趋势 + search-pack v2 瘦身 + 来源扩量 + 翻译覆盖）

## 需求背景

当前项目已具备抓取稳定性回退（`parse_empty/parse_drop`）、状态页可观测字段与 PWA 离线兜底，但仍存在几个“继续升级”的可见瓶颈：

1. **状态页缺少趋势视角**：`/status` 仅展示“本轮”来源明细，无法快速回答“最近 24h/7 天是不是持续波动”“是否在变好/变差”。
2. **来源数量偏少**：默认来源仅覆盖少量站点，内容密度与覆盖面不足，难以体现“资讯雷达”的价值。
3. **翻译覆盖不均匀**：同步阶段的翻译有 `ACG_TRANSLATE_MAX_POSTS` 上限，但当前仅处理最新 N 条，导致窗口内较旧条目可能长期缺翻译。
4. **数据体积增长风险**：来源扩量会直接增加 `posts.json(.gz)` 与 `search-pack` 的体积，存在触发 `perf-budget` 数据载荷门禁的风险；同时全站搜索首载也可能变慢。

## 变更内容

1. **新增 status-history.v1（趋势数据）**
   - 同步阶段生成 `public/data/status-history.v1.json(.gz)`（并同步写入 `src/data/generated` 供构建期读取）。
   - 以“每次同步”为粒度追加一条汇总记录，并做长度上限裁剪（避免无限增长）。
2. **状态页增加趋势卡片**
   - `/zh/status`、`/ja/status` 在现有明细表之上展示最近 7/30 轮的趋势（成功率、异常来源数、新增条目数等），用静态渲染的轻量 SVG sparkline 实现（不引入新依赖/不增加运行时 JS）。
3. **新增 search-pack.v2（面向全站搜索的瘦身产物）**
   - 在保持 `search-pack.v1` 兼容的前提下，新增 v2 产物并让 Worker 优先加载 v2，失败自动回退 v1 / posts.json。
   - v2 的 posts 子集仅保留全站搜索结果渲染必需字段（减少冗余字段与重复文本）。
4. **来源扩量（以 feed 为主，降低维护成本）**
   - 在 `src/lib/source-config.ts` 增加更多 RSS/Atom/RDF 来源，优先选择结构稳定、无需 HTML 解析的站点。
5. **翻译覆盖策略优化**
   - 同步翻译阶段优先选择“仍缺翻译”的条目（而非仅取最新 N 条），在相同的 `maxPosts` 限制下提升窗口内翻译覆盖与一致性。

## 影响范围

- **模块**
  - pipeline-sync（同步产物生成、趋势聚合、翻译策略）
  - web-ui（状态页趋势展示）
  - client-app（全站搜索 Worker 优先读取 v2）
  - pwa（Service Worker 缓存新增 data 产物）
  - shared-lib（类型/读取生成数据的辅助函数）
- **文件**
  - `scripts/sync.ts`
  - `scripts/validate-generated-data.ts`
  - `src/lib/types.ts`
  - `src/lib/generated-data.ts`
  - `src/pages/zh/status.astro`
  - `src/pages/ja/status.astro`
  - `src/client/constants.ts`
  - `src/client/app.ts`
  - `src/client/workers/search.worker.ts`
  - `public/sw.js`
  - `src/lib/source-config.ts`

## 核心场景

### 需求: 状态趋势可追溯
**模块:** web-ui / pipeline-sync

场景：用户打开状态页，希望快速判断最近是否稳定、是否持续失败、是否停更或抓取卡住。
- 预期结果：状态页提供“最近 7/30 轮”的趋势概览（无需打开 CI 日志）。

### 需求: 全站搜索首载更稳、更轻
**模块:** client-app / pipeline-sync / pwa

场景：用户切换到全站搜索模式，首次需要加载搜索数据。
- 预期结果：优先加载更轻的 `search-pack.v2.json(.gz)`；失败则自动回退到 v1 或 posts.json。

### 需求: 来源扩量但可维护
**模块:** pipeline-sync / shared-lib

场景：新增来源后，不应引入大量“按 source.id 特判”的维护负担。
- 预期结果：优先采用 feed 来源；HTML 来源仍保持注册表插件式扩展。

### 需求: 翻译覆盖更均匀
**模块:** pipeline-sync

场景：30 天窗口内的条目应尽量都有中/日翻译，避免“只有最新的翻译了，稍旧的永远缺”。
- 预期结果：翻译阶段优先填补缺失字段；在 `maxPosts` 不变情况下提升覆盖率。

## 风险评估

- **风险：来源扩量导致失败率上升**
  - 缓解：继续沿用 `parse_empty/parse_drop` 回退策略与状态页提示；新增来源默认以 feed 为主降低结构变化风险。
- **风险：search-pack v2 与旧缓存/旧版本不兼容**
  - 缓解：保留 v1 产物；Worker 兼容 v1/v2；SW 兜底与回退路径不变。
- **风险：数据体积触发 budget 门禁**
  - 缓解：search-pack v2 瘦身；必要时通过 limit/窗口策略或字段裁剪控制体积。

