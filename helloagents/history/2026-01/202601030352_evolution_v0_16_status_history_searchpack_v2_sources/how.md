# 技术设计: evolution_v0_16（status-history 趋势 + search-pack v2 瘦身 + 来源扩量 + 翻译覆盖）

## 技术方案

### 1) status-history.v1（同步阶段生成趋势数据）

**目标：** 在不引入后端/数据库的前提下，为 `/status` 提供可视化趋势数据。

**数据结构（建议，v1）：**
- `public/data/status-history.v1.json(.gz)`
  - `v: 1`
  - `generatedAt: string`（本次生成时间）
  - `entries: StatusHistoryEntry[]`（按时间排序，旧→新；长度限制）

`StatusHistoryEntry` 为“单次同步”的汇总快照，字段以“可视化 + 排障”优先：
- `generatedAt` / `durationMs`
- `totalSources` / `okSources` / `errSources`
- `totalItems` / `totalNewItems`
- `flakySources`（连续失败≥3）
- `staleSources`（最新发布时间距本次生成时间≥阈值）
- `parseEmpty` / `parseDrop`（错误类型计数）

**生成策略：**
1. 同步结束得到 `status.json` 后，聚合生成 `entry`。
2. 回读上一轮 `status-history.v1.json`（默认从 Pages URL；可通过 env 覆盖），解析成功则 append；失败则从空开始。
3. 做去重/裁剪：
   - 若最后一条的 `generatedAt` 与本次相同则替换（避免重复写入）。
   - 保留最近 N 条（默认 240；可通过 env 覆盖）。
4. 写入：
   - `src/data/generated/status-history.v1.json`（构建期读取）
   - `public/data/status-history.v1.json(.gz)`（运行时与 SW 缓存）

### 2) 状态页趋势展示（Astro 静态渲染）

**目标：** 不引入新依赖与运行时图表库，用最小代价展示趋势。

**实现要点：**
- 在 `src/lib/generated-data.ts` 增加 `readGeneratedStatusHistory()`。
- `/zh/status`、`/ja/status`：
  - 读取 history，取最近 7/30 条；
  - 用内联 `<svg>` 绘制 sparkline（折线/面积），并展示关键数值（成功率/错误数/新增条目等）。

### 3) search-pack.v2（更轻的全站搜索包）

**目标：** 在保持 v1 兼容与回退路径的基础上，为全站搜索提供更轻的默认加载。

**产物：**
- `src/data/generated/search-pack.v2.json`
- `public/data/search-pack.v2.json(.gz)`

**结构（v2）：**
- `v: 2`
- `generatedAt`
- `posts: Post[]`（字段裁剪：只保留全站搜索结果渲染所需；移除 preview* / coverOriginal 等冗余字段）
- `index: SearchPackIndexRow[]`（复用现有索引行结构，避免 Worker/解析器大改）

**兼容策略：**
- Worker 加载顺序：v2 → v1 → posts.json（构建 index）。
- Service Worker data 缓存：新增 v2 文件，并保持 v1/旧路径不变。

### 4) 来源扩量（以 feed 为主）

**目标：** 在不显著增加维护成本的前提下提高覆盖面。

**实现：**
- 在 `src/lib/source-config.ts` 增加多个 feed 来源：
  - 优先 RSS/Atom/RDF（`kind: "feed"`）
  - 对“泛资讯”源使用 `include` 正则做二次过滤，避免引入大量噪声
  - 标注 `lang`（提升翻译策略准确性）

### 5) 翻译覆盖策略优化

**目标：** 在相同 `ACG_TRANSLATE_MAX_POSTS` 限制下，让窗口内的缺翻译条目更快被补齐。

**实现：**
- 将翻译目标集合从 `posts.slice(0, limit)` 改为：
  - `posts.filter(needsTranslate).slice(0, limit)`
  - `needsTranslate` 按来源 `lang` 与字段缺失判断（标题/摘要/预览分别考虑）

## 架构决策 ADR

### ADR-016: 无后端趋势数据采用“回读上一轮 + 追加裁剪”策略
**上下文:** 需要 status 趋势，但不引入 DB/后端常驻。
**决策:** 同步阶段回读上一轮 `status-history` 并追加本轮汇总，保留最近 N 条。  
**理由:** 产物完全静态可缓存；实现简单；兼容 GitHub Pages；可持续演进（v1→v2）。  
**替代方案:** 引入数据库/服务端存储 → 拒绝原因: 违背“无后端常驻”原则，维护成本高。  
**影响:** 需要一个新的 data 文件与轻量 UI 组件；history 的精度以“每次同步”为粒度。  

## 安全与性能

- 安全：
  - 不引入新的敏感信息与密钥持久化。
  - 新增来源优先使用公开 feed，减少反爬/版权争议风险。
- 性能：
  - status-history 与 search-pack.v2 产物均提供 `.gz` 版本，Worker/SW 优先 gzip。
  - 状态页趋势使用静态 SVG，不增加运行时图表脚本体积。

## 测试与部署

- 本地验证（或 CI）：`npm run sync` → `npm run validate` → `npm run build` → `npm run budget`
- 部署：沿用 GitHub Actions 每小时同步 + Pages 部署流程

