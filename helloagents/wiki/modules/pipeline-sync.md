# pipeline-sync

## 目的
在 CI 或本地执行抓取与清洗，将外部来源转为站点可消费的静态 JSON 产物。

## 模块概述
- 职责：拉取来源（RSS/HTML）→ 去重排序 → 补图/预览增强 → 翻译字段（限量）→ 写入 `src/data/generated` 与 `public/data`
- 状态：✅稳定
- 最后更新：2025-12-31

## 规范
### 需求: 同步管线可验证
场景：每小时执行同步后，产物结构与关键不变量必须满足约束；否则阻断部署并暴露错误。
- 预期结果：`npm run validate` 在 CI 中对数据结构做强校验，失败即退出并阻止部署。

## 依赖
- `scripts/sync.ts`
- `scripts/lib/*`
- `src/lib/source-config.ts`（来源配置 SSOT）
- `src/lib/search/pack.ts`（search-pack 构建与索引生成的共享实现）

## 产物
- `src/data/generated/posts.json` / `public/data/posts.json(.gz)`
- `src/data/generated/status.json` / `public/data/status.json(.gz)`
- `src/data/generated/search-pack.v1.json` / `public/data/search-pack.v1.json(.gz)`（全站搜索包：posts + 预计算索引）

## 质量门禁
- `npm run validate`：结构与关键不变量校验（失败阻断部署）
- `npm run budget`：`dist/` 体积预算门禁（入口页 vs 数据载荷）
  - `html/xml/json(core)`：不计入 `dist/data/*.json`
  - `data.json`：`dist/data/*.json`（默认仅观测；可用 `ACG_BUDGET_DATA_JSON_KB` 启用门禁）
  - `data.gz`：`dist/data/*.json.gz`

