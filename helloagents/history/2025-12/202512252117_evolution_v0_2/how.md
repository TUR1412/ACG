# 技术设计: evolution_v0_2

## 技术方案

### 核心技术
- Astro 静态路由输出（新增 `feed.json` 与 `opml.xml` 的 API 路由）
- Node.js 校验脚本（零新增依赖，使用内置模块实现）
- Service Worker（手写缓存策略，避免引入额外 PWA 依赖）

### 实现要点
1. 来源配置 SSOT
   - 新增 `src/lib/source-config.ts`：
     - 定义 `SourceConfig`（包含 `includePattern` 等可序列化规则）
     - 导出 `SOURCE_CONFIGS`
   - `scripts/sources/index.ts`：
     - 从 `SOURCE_CONFIGS` 构造脚本侧 `SOURCES`（将 includePattern 编译为 include 函数）
   - About/OPML/未来导出均使用 SSOT，避免页面从 scripts 目录直接引用实现细节。

2. OPML 导出
   - 新增 `src/lib/opml.ts`：渲染 OPML XML（含分类信息与链接）。
   - 新增路由：
     - `/zh/opml.xml`
     - `/ja/opml.xml`

3. JSON Feed
   - 新增 `src/lib/json-feed.ts`：渲染 JSON Feed v1.1。
   - 新增路由：
     - `/zh/feed.json`
     - `/ja/feed.json`

4. PWA
   - `public/manifest.webmanifest`：声明名称、起始 URL、display、theme_color 等（使用现有 svg icon）。
   - `public/sw.js`：
     - install：`skipWaiting`
     - activate：清理旧 cache + `clients.claim`
     - fetch：
       - 导航请求：network-first，失败回退到 cache（“最近可用页面”）
       - 静态资源与 JSON：stale-while-revalidate
       - 图片：cache-first（可用则直接返回）
   - `src/layouts/SiteLayout.astro` 与根 `src/pages/index.astro`：
     - 注入 manifest link
     - 注入 SW 注册脚本（静默失败，不阻塞）

5. CI 质量门禁
   - 新增 `scripts/validate-generated-data.ts`：
     - 校验 posts/status 结构与关键不变量
     - 输出可读错误并以非零退出码阻断
   - 新增 `scripts/perf-budget.ts`：
     - 遍历 dist 目录统计体积
     - 对关键资源（JS/CSS/HTML/JSON）分别设定预算阈值（可用 env 覆盖）
   - 修改 `.github/workflows/hourly-sync-and-deploy.yml`：
     - Sync 后运行 validate
     - Build 后运行 budget

## 架构决策 ADR

### ADR-001: 来源配置改为单一事实来源（SSOT）
上下文：来源列表既用于同步抓取，也用于站点展示/导出；重复维护会导致不一致与维护成本上升。
决策：新增 `src/lib/source-config.ts`，脚本与页面统一从此导入；脚本侧将可序列化规则编译为函数。
理由：降低耦合、减少重复、便于扩展导出格式与 UI 展示。
替代方案：
- 方案：继续在 scripts 与页面各维护一份列表 → 拒绝原因：一致性风险高，扩展成本大。
影响：来源维护入口更清晰；后续新增导出能力更简单。

### ADR-002: 增加 OPML 与 JSON Feed 订阅导出
上下文：RSS 对程序消费与阅读器导入支持有限，且缺少来源列表一键导入能力。
决策：新增 OPML 与 JSON Feed 两类导出，保持与现有 RSS 一致的多语言路由结构。
理由：兼容更多阅读器与自动化工作流；属于低风险的增量能力。
影响：新增两个静态 API 路由与少量渲染工具代码。

### ADR-003: 引入 PWA 基础（Manifest + SW）
上下文：弱网与离线体验缺少兜底，移动端用户体验可提升。
决策：不引入额外 PWA 依赖，手写 service worker 与 manifest，保证可控与轻量。
理由：依赖更少、可控性更高、维护成本更低。
影响：需要谨慎的 cache 版本管理与策略选择，避免缓存污染。

### ADR-004: CI 增加数据校验与体积预算门禁
上下文：同步来源可能变动，产物可能悄然损坏或膨胀；需要自动阻断与可观测反馈。
决策：新增 validate 与 budget 两个脚本并纳入 GitHub Actions。
理由：质量可持续、长期演进更安全。
影响：CI 可能因为数据异常或体积超标而失败，需要维护阈值与修复策略。

## 安全与性能
- 安全：
  - 订阅导出与 JSON 输出均进行字段 escape/规范化（避免注入风险）。
  - Service Worker 仅拦截同源 GET 请求，避免误缓存敏感写操作。
- 性能：
  - Service Worker 对静态资源采用 SWR 或 cache-first，减少重复请求。
  - CI 增加体积预算，防止包体积长期膨胀。

## 测试与部署
- 测试：
  - `npm run check`
  - `npm run build`
  - `npm run sync`（可选，需联网）
  - `npm run validate`
  - `npm run budget`
- 部署：沿用现有 GitHub Pages 工作流，仅新增门禁步骤。

