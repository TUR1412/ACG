# 技术设计: evolution_v0_13_status_health_trend

## 技术方案

### 1) status.json 数据模型扩展（向后兼容）
扩展 `src/lib/types.ts` 中的 `SourceStatus`，新增（均为可选字段）：
- `newItemCount?: number`：本轮相对上一轮 remote posts 的新增条目数（按 post.id 去重）
- `latestPublishedAt?: string`：最终产物（pruned posts）中该来源最新一条的发布时间
- `visibleItemCount?: number`：最终产物（pruned posts）中该来源条目数（用于解释“抓取条目数 vs 站点可见条目数”的差异）
- `consecutiveFails?: number`：连续失败次数（成功则归零）

> 说明：`itemCount` 仍保留语义为“本轮抓取产出（或缓存回退）条目数”，新增 `visibleItemCount` 用于呈现最终页面可见数量。

### 2) 同步脚本增强（趋势计算 + 保守回退）
在 `scripts/sync.ts` 中：

1. **回读上一轮 remote status**  
新增 `ACG_REMOTE_STATUS_URL`（默认 `https://tur1412.github.io/ACG/data/status.json`），用于拿到上一轮每个来源的 `ok` 与 `consecutiveFails`（若存在）。

2. **计算连续失败**  
对每个来源：
- `ok === true` → `consecutiveFails = 0`
- `ok === false` → `consecutiveFails = (prev.consecutiveFails ?? (prev.ok === false ? 1 : 0)) + 1`

3. **计算新增条目数**  
在 `runSource` 中用 `previousBySource` 做对比：
- `newItemCount = count(posts where id not in previousIds)`
- 304/cached/fallback：`newItemCount = 0`

4. **解析异常时保守回退**  
当 HTTP 请求成功但解析器输出 `rawItemCount === 0` 时：
- 标记该来源 `ok=false`、`used="fallback"`、`error="parse_empty"`（可读错误信息）
- `posts` 回退到上一轮 `previous`
- `itemCount` 使用回退后的条目数，避免状态页显示 0 导致误判

5. **补齐最终“可见”统计与最新发布时间**  
在 `pruned`（最终 posts）生成后：
- 统计每个来源 `visibleItemCount`
- 计算每个来源 `latestPublishedAt`（max publishedAt）
- 回填到对应的 `SourceStatus` 条目

### 3) 状态页 UI 升级
在 `src/pages/zh/status.astro` 与 `src/pages/ja/status.astro`：
- 新增列：`新增`（newItemCount）、`最新`（latestPublishedAt）、`连续失败`（consecutiveFails）
- 对 stale（例如最新发布时间距本次生成时间 > 24h）给出更明确提示（文案/样式保守处理）
- 保持旧字段展示不变，新增字段缺失时显示 `-`

## 架构决策 ADR
### ADR-013: status.json 引入趋势字段（连续失败/增量/最新发布时间）
**上下文:** 单次状态无法定位“持续停更/持续失败/增量缺失”等问题，排障成本高。  
**决策:** 为 status.json 增加可选趋势字段，并在同步脚本中通过“回读上一轮 remote status/posts”计算。  
**理由:** 不引入后端的前提下获得“最小趋势”，对静态站/CI 同步模型最友好。  
**替代方案:** 引入持久化数据库记录历史 → 拒绝原因: 违背“伪全栈/无后端常驻”约束。  
**影响:** status.json 体积略增；需要更新类型/校验/页面展示，但兼容性可控（optional 字段）。

## 安全与性能
- 安全：仅回读公开的 GitHub Pages JSON，不涉及密钥与 PII；失败不阻断。
- 性能：status.json 增量字段体积极小；status 页只做常量级渲染；同步脚本仅多一次 fetch。

## 测试与部署
- `npm run check`
- `npm run build`（`ACG_BASE=/ACG`）
- `npm run budget`

