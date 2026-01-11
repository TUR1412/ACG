# 变更提案: Layout Modes & Client State Refactor

## 需求背景
当前站点的“信息密度”和“可读性”已经很强，但在不同用户/设备/场景下仍存在两类典型需求：

1. **重度刷资讯**：希望在桌面端也能像移动端一样以更高密度的“列表节奏”快速扫过（更少封面、更少摘要、更高吞吐）。
2. **轻度阅读/舒适浏览**：希望保持现有网格卡片的视觉表现，同时能一键切换为更“紧凑”的排版以减少滚动成本。

此外，`src/client/app.ts` 已承担了大量“本地状态 + UI wiring + DOM 行为”职责，继续迭代会逐渐降低可维护性与变更可控性；需要在不破坏现有运行逻辑根基的前提下，对本地存储与状态加载逻辑做一次“原子级”解耦。

## 产品分析

### 目标用户与场景
- **用户群体:** ACG 资讯重度用户、通勤碎片阅读用户、桌面端多标签阅读用户
- **使用场景:** 桌面端快速扫热点、工作间隙短时间浏览、低性能设备/省电模式下的“少动效/高密度”阅读
- **核心痛点:** 桌面端信息密度切换成本高；当前 UI 主要围绕“网格卡片展示”，缺少“列表/紧凑”可控开关

### 价值主张与成功指标
- **价值主张:** 在不改变核心信息架构与数据管线的前提下，为用户提供“视图模式/密度”的可控切换，并提升客户端状态代码的可维护性。
- **成功指标:**
  - 用户可在偏好设置中一键切换 `Grid/List` 与 `Comfort/Compact`
  - 切换仅影响表现层（CSS/布局），不影响抓取/生成数据协议
  - `npm test` / `npm run check` / `npm run build` / `npm run budget` 全部通过
  - JS/CSS 体积预算不明显上升（目标：不新增独立大型依赖）

### 人文关怀
- 继续坚持“本地优先”：视图与密度设置仅写入 `localStorage`，不上传
- 继续支持 reduced-motion 与低性能降级策略：布局切换不引入重动画

## 变更内容
1. 新增“视图模式 View Mode”：Grid / List
2. 新增“信息密度 Density”：Comfort / Compact
3. 客户端状态与本地存储逻辑重构：抽离 `localStorage` 解析与存储工具，降低 `app.ts` 复杂度
4. 样式系统细化：为 list/compact 提供 CSS 覆盖层（尽量不改动现有组件结构）
5. 文档升级：README（双语）、知识库与变更记录同步

## 影响范围
- **模块:** client-app / web-ui / styles / shared-lib / docs
- **文件:** `src/client/*`、`src/components/*`、`src/styles/global.css`、`src/i18n/i18n.ts`、`README.md`、`helloagents/wiki/*`、`helloagents/CHANGELOG.md`
- **API:** 无新增外部 API
- **数据:** 不改变同步产物 schema；仅新增浏览器端本地偏好字段

## 核心场景

### 需求: View Mode（视图模式）
**模块:** client-app / web-ui
让用户在桌面端也能选择“列表式高密度浏览”。

#### 场景: Desktop Scan
用户在桌面端快速扫过最新资讯。
- 一键切换为 List 模式（更紧凑、更少视觉噪音）
- 列表模式保持关键元信息（来源/时间/热度/阅读时长）

### 需求: Density（信息密度）
**模块:** client-app / styles
让用户用更少滚动完成浏览。

#### 场景: Compact Reading
用户希望在网格卡片基础上减少留白与摘要占比。
- 一键切换为 Compact（减少 padding/行数/标签展示）
- 不改变筛选、收藏、已读等核心逻辑

### 需求: Client State Refactor
**模块:** client-app
降低 `src/client/app.ts` 的复杂度，提升可维护性与可测试性。

#### 场景: Safer Iteration
后续增加偏好项/交互时，不需要在一个超大文件里重复编写 JSON parse / localStorage try-catch。
- 抽离 storage helper（向后兼容）
- 行为不变、风险可控

## 风险评估
- **风险:** 新增偏好项导致 localStorage 兼容问题
  - **缓解:** 新 key 采用独立版本号（`acg.view.v1` / `acg.density.v1`），默认值与容错解析
- **风险:** list/compact 样式覆盖与现有 Tailwind 响应式类冲突
  - **缓解:** 使用更高优先级的全局 CSS 覆盖（最小范围 + 明确选择器），并保持默认行为不变
- **风险:** UI 变化过多影响熟悉用户
  - **缓解:** 默认保持现有 grid + comfort；新增选项是“可选增强”

