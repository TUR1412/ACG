# 变更提案: evolution_v0_11_status_observability

## 需求背景
项目目前已经具备基础状态页（/status）与来源级别的 OK/ERR、HTTP、耗时、条目数等信息，但在“整点波动/偶发失败/缓存回退”场景下仍缺少关键可观测性信号：

- **抓取稳定性排障成本高**：同样是 `HTTP 429/5xx`，我们无法从 status.json 快速看出“是否触发了重试、重试了几次、等待了多久”。
- **数据质量波动不易被发现**：来源解析器偶尔会被页面结构变更影响，导致 `rawItems -> filtered -> posts` 的数量异常，但 status 只显示最终 itemCount，定位不够直观。

因此本轮升级聚焦“状态页可观测性”，让问题在 UI 上更快暴露、更容易定位，且不改变站点“静态站 + CI 同步”的低运维结构。

## 目标与成功标准
- status.json 增加抓取可观测性字段：
  - 每个来源的抓取 **attempts/重试等待** 指标（用于判断是否遭遇波动与退避）。
  - 解析阶段的 **rawItemCount / filteredItemCount**（用于判断适配器是否失效或过滤规则是否过严）。
- 状态页 UI 展示新增字段，并保持可读性（表格可横向滚动）。
- 对现有同步流程与校验门禁影响最小：新增字段仅为增强，不改变既有字段语义。

## 影响范围
- pipeline-sync：`scripts/lib/http-cache.ts`、`scripts/sync.ts`
- web-ui：`src/pages/zh/status.astro`、`src/pages/ja/status.astro`
- shared-lib types：`src/lib/types.ts`、`scripts/validate-generated-data.ts`
- 知识库：`helloagents/wiki/modules/pipeline-sync.md`、`helloagents/wiki/modules/web-ui.md`、`helloagents/CHANGELOG.md`

## 风险评估
- 风险：扩展 status.json 字段可能引入轻微的类型/渲染适配成本。
- 缓解：字段以可选/兼容方式引入；UI 对缺失字段显示 `-`；校验脚本仅做轻量类型检查。

