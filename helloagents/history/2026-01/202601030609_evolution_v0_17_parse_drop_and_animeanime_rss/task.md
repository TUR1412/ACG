# 任务清单: evolution_v0_17（修复 parse_drop 误报 + animeanime 改用 RSS）

目录: `helloagents/plan/202601030609_evolution_v0_17_parse_drop_and_animeanime_rss/`

---

## 1. 抓取稳定性（parse_drop 误报修复）
- [√] 1.1 调整 `scripts/sync.ts` 的 `parse_drop` 判定：基于 `rawItemCount`（解析前）而非过滤后的 `posts.length`，避免带 `include` 的来源被误判并触发 fallback。

## 2. 来源质量（animeanime 改用 RSS）
- [√] 2.1 将 `animeanime-list` 从 `kind: "html"` 切换为 `kind: "feed"`，并改用 `https://animeanime.jp/rss20/index.rdf` 作为源 URL。

## 3. 质量验证
- [√] 3.1 跑通 `npm run sync` / `npm run validate` / `npm run check`（至少确保 status 中不再出现上述 3 个来源的 parse_drop）。

## 4. 知识库同步
- [√] 4.1 更新 `helloagents/wiki/modules/pipeline-sync.md`（补充 parse_drop 判定口径变化）。
- [√] 4.2 更新 `helloagents/CHANGELOG.md`（补充 Unreleased 条目）。

## 5. 迁移方案包（强制）
- [√] 5.1 将本方案包迁移至 `helloagents/history/2026-01/202601030609_evolution_v0_17_parse_drop_and_animeanime_rss/` 并更新 `helloagents/history/index.md`。
