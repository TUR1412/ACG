# 变更提案: evolution_v0_13_status_health_trend

## 需求背景
当前 `/status/` 已能展示每次同步的基础健康度（成功率、耗时、HTTP 状态、重试次数、解析 raw/filtered 统计）。但仍存在两个关键短板：

1) **缺少“趋势/历史语义”**  
仅看单次运行，很难判断某个来源是偶发失败还是连续失败，也无法直观看到来源是否“长期不更新/卡住”。  

2) **缺少“抓取数量性”的可见性**  
当前只展示本次抓取条目数，但无法回答“这一小时到底新增了多少条？”、“最近一条内容距现在多久？”等更接近用户感知的问题。

因此需要对 `status.json` 与状态页做一次升级：引入趋势字段（连续失败、增量条目、最新发布时间等），并在解析异常时更保守地回退到上一轮数据，避免“表面 OK、实际停更”。

## 目标与成功标准
- 状态页可以回答以下问题（无需翻日志）：
  - 某来源是否 **连续失败**（连续失败次数）
  - 某来源本轮 **新增条目数**（相对上一轮 remote posts）
  - 某来源 **最新发布时间**（用于判断是否停更/抓取卡住）
- 数据产物一致：`scripts/validate-generated-data.ts` 校验通过，`astro build` 与预算门禁通过。
- 兼容性优先：旧部署环境没有 “趋势字段” 时不报错；新字段缺失时 UI 保持可用。

## 影响范围
- pipeline-sync：`scripts/sync.ts`、`scripts/validate-generated-data.ts`
- shared-lib：`src/lib/types.ts`、`src/lib/generated-data.ts`（间接）
- web-ui：`src/pages/zh/status.astro`、`src/pages/ja/status.astro`
- 知识库：`helloagents/wiki/arch.md`、`helloagents/CHANGELOG.md`

## 核心场景

### 需求: 状态页可观测性升级（趋势语义）
**模块:** pipeline-sync / web-ui

#### 场景: 连续失败可见
当某来源连续多次失败时：
- 状态页能展示连续失败次数
- 建议文案更明确（例如提示“连续失败，需检查 URL/选择器/被拦截”）

#### 场景: 停更/卡住可见
当某来源长时间无新内容或抓取卡住时：
- 状态页能显示该来源最新发布时间（并可据此判断是否 stale）

### 需求: 抓取数量性（增量可见）
**模块:** pipeline-sync / web-ui

#### 场景: 新增条目数
每次同步后：
- 状态页显示每个来源“新增条目数”（相对上一轮 remote posts）
- 聚合层面可统计本次总新增条目（可选）

## 风险评估
- **风险:** 新增字段会影响旧版本 status.json 的解析  
  **缓解:** 所有新增字段均为可选字段（optional），UI/校验采用“存在则展示”的策略。
- **风险:** “新增条目”基于 remote posts 的回读，remote 不可用时无法计算  
  **缓解:** remote 不可用时退化为 `0`，不阻断同步与部署。

