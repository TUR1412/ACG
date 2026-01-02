# 任务清单: evolution_v0_16（status-history 趋势 + search-pack v2 瘦身 + 来源扩量 + 翻译覆盖）

目录: `helloagents/plan/202601030352_evolution_v0_16_status_history_searchpack_v2_sources/`

---

## 1. 同步管线（status-history + search-pack v2 + 翻译策略）
- [√] 1.1 在 `scripts/sync.ts` 增加 `status-history.v1.json(.gz)` 生成：回读上一轮 → 追加 → 裁剪 → 写入（验证 why.md#需求-状态趋势可追溯）。
- [√] 1.2 在 `scripts/sync.ts` 增加 `search-pack.v2.json(.gz)` 生成（posts 字段裁剪 + v2 标识），并保持 v1 兼容（验证 why.md#需求-全站搜索首载更稳更轻）。
- [√] 1.3 在 `scripts/sync.ts` 优化翻译目标选择：优先处理缺翻译条目（验证 why.md#需求-翻译覆盖更均匀）。

## 2. Web UI（状态页趋势）
- [√] 2.1 在 `src/lib/generated-data.ts` 增加 `readGeneratedStatusHistory()`。
- [√] 2.2 在 `src/pages/zh/status.astro` 增加 7/30 轮趋势概览（SVG sparkline + 指标卡片）。
- [√] 2.3 在 `src/pages/ja/status.astro` 同步增加趋势概览（日文文案）。

## 3. Client App（全站搜索优先 v2）
- [√] 3.1 在 `src/client/constants.ts` 增加 v2 路径常量。
- [√] 3.2 在 `src/client/app.ts` 初始化 Worker 时优先传入 v2 indexUrl/indexGzUrl（回退到 v1）。
- [√] 3.3 在 `src/client/workers/search.worker.ts` 支持 search-pack v2 的解析与回退。

## 4. PWA（缓存新增 data 产物）
- [√] 4.1 在 `public/sw.js` 将 `status-history.v1.json(.gz)` 与 `search-pack.v2.json(.gz)` 纳入 data 缓存与离线兜底。

## 5. 数据质量（来源扩量）
- [√] 5.1 在 `src/lib/source-config.ts` 扩充 feed 来源并补齐 `lang`/`homepage`/`include`（验证 why.md#需求-来源扩量但可维护）。

## 6. 安全检查
- [√] 6.1 自检：新增 URL 均为公开可访问来源；无密钥/令牌写入仓库；无高风险命令/破坏性操作引入。

## 7. 质量验证
- [√] 7.1 更新 `scripts/validate-generated-data.ts`：新增 `status-history` 与 `search-pack.v2` 校验；保持 v1 校验。
- [√] 7.2 跑通 `npm run sync` / `npm run validate` / `npm run build` / `npm run budget`。

## 8. 知识库同步
- [√] 8.1 更新 `helloagents/wiki/modules/pipeline-sync.md`（新增产物、翻译策略、来源扩量说明）。
- [√] 8.2 更新 `helloagents/wiki/arch.md`：追加 ADR-016 索引。
- [√] 8.3 更新 `helloagents/CHANGELOG.md`：补充 Unreleased 条目。

## 9. 迁移方案包（强制）
- [√] 9.1 将本方案包迁移至 `helloagents/history/2026-01/202601030352_evolution_v0_16_status_history_searchpack_v2_sources/` 并更新 `helloagents/history/index.md`。
