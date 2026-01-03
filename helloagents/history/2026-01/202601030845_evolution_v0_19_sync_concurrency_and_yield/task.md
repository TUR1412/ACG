# 任务清单: evolution_v0_19（同步提速 + 抓取数量性提升）

目录: `helloagents/plan/202601030845_evolution_v0_19_sync_concurrency_and_yield/`

---

## 1. 抓取稳定性 / 性能（Sync 管线提速）
- [√] 1.1 为来源抓取引入“有限并发”（可配置），降低整轮同步耗时并减少整点波动。
- [√] 1.2 调整 HTTP cache 写盘策略：抓取阶段仅更新内存，阶段结束统一落盘，避免并发写入风险与频繁 IO。

## 2. 抓取数量性（来源产出提升）
- [√] 2.1 调整低产出的来源 include 规则（或移除过严过滤），提升抓取条目数与搜索覆盖。
- [√] 2.2 同步后跑通 `npm run sync:dry`，确认来源均可正常抓取且无显著退化。

## 3. 质量验证
- [√] 3.1 跑通 `npm run check` / `npm run build` / `npm run budget` / `npm run validate`。

## 4. 知识库同步
- [√] 4.1 更新 `helloagents/wiki/data.md`（记录并发参数与抓取阶段写盘策略）。
- [√] 4.2 更新 `helloagents/CHANGELOG.md`（补充 Unreleased 条目）。

## 5. 迁移方案包（强制）
- [√] 5.1 迁移至 `helloagents/history/2026-01/202601030845_evolution_v0_19_sync_concurrency_and_yield/` 并更新 `helloagents/history/index.md`。
