# 变更提案: evolution_v0_12_fulltext_progressive_dom

## 需求背景
在 v0.10 中全文预览的 Markdown 渲染/翻译已迁移到 Web Worker，显著降低了主线程的字符串重计算压力。但移动端仍可能出现“卡一下”的结构性原因：

- **超长 HTML 一次性 `innerHTML` 注入** 仍会触发浏览器在主线程做大块 HTML 解析与 DOM 构建，形成长任务（Long Task），在弱设备上更明显。

因此需要把“DOM 注入”也做成渐进式：优先渲染首屏可见内容，剩余内容在 idle/空闲时间分批追加，进一步降低滑动与交互卡顿概率。

## 目标与成功标准
- 长文全文预览在移动端切换「查看原文/查看翻译」时，主线程长任务更少、体感更顺滑。
- 保持现有策略不变：
  - 仍然是 lazy chunk；
  - 仍然保留 idle 后处理（去壳/图墙/链接增强）；
  - 仍然保留低性能/滚动期更保守的策略。
- 兼容性优先：渐进渲染仅作为优化层，失败时回退为一次性渲染，不影响可用性。

## 影响范围
- client-app：`src/client/features/fulltext.ts`、`src/client/workers/fulltext.worker.ts`
- 知识库：`helloagents/wiki/modules/client-app.md`、`helloagents/wiki/arch.md`、`helloagents/CHANGELOG.md`

