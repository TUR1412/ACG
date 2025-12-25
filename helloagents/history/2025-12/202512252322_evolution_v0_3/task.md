# 任务清单: evolution_v0_3

目录: `helloagents/plan/202512252322_evolution_v0_3/`

---

## 1. 视觉系统（令牌化）
- [√] 1.1 在 `src/styles/global.css` 中建立栅格/排版/阴影/渐变边框令牌，并在暗黑模式下覆盖关键令牌
- [√] 1.2 在 `tailwind.config.ts` 中映射令牌为 utilities（`gap-grid`、`px-gutter`、`shadow-e1..e12`、`text-phi-*` 等）
- [√] 1.3 在 `src/layouts/SiteLayout.astro` 与首页/分类页中替换关键容器间距为令牌化 spacing（`px-gutter`、`gap-grid`）

## 2. 视觉细节（玻璃/渐变/路径动画）
- [√] 2.1 升级 `glass` / `glass-card`：动态渐变边框 + hover 动画（遵循 reduced-motion）
- [√] 2.2 为封面占位的 SVG path 注入绘制动效（仅占位显示时运行）

## 3. 交互进化（转场/骨架/性能）
- [√] 3.1 在 `src/styles/global.css` 中增加 View Transitions 动效（header/main）
- [√] 3.2 在 `src/client/app.ts` 中增加 WAAPI 转场降级（仅不支持 View Transitions 时启用）
- [√] 3.3 升级收藏页骨架屏为 shimmer（`acg-skeleton`）

## 4. 功能矩阵补强（筛选/预取/埋点/网络）
- [√] 4.1 在 `src/client/app.ts` 中实现多级筛选语法解析（tag/source/cat/before/after/is + 反选）
- [√] 4.2 为列表卡片补充索引字段（来源/分类/发布时间），并触发惰性初始化以完成“预提取”
- [√] 4.3 新增本地优先埋点模块 `src/client/utils/telemetry.ts` 并接入关键交互
- [√] 4.4 在 `src/client/utils/http.ts` 中为重试退避加入 jitter，提升稳定性

## 5. 文档与变更记录
- [√] 5.1 更新 `helloagents/CHANGELOG.md`
- [√] 5.2 更新 `helloagents/wiki/modules/web-ui.md` 与 `helloagents/wiki/modules/client-app.md`
- [√] 5.3 更新 `helloagents/history/index.md` 并迁移方案包至 `helloagents/history/2025-12/`

