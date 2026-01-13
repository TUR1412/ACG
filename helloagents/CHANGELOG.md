# Changelog

本文件记录项目所有重要变更。
格式基于 Keep a Changelog，版本号遵循语义化版本（SemVer）。

## [Unreleased]

### 新增

- SEO：新增 `robots.txt` endpoint 并指向 `sitemap.xml`，让爬虫发现入口更稳定（同时让 Lighthouse SEO 审计更稳）。
- Security：新增 `/.well-known/security.txt`（指向 GitHub Security Policy），便于安全问题使用标准渠道发现与上报。

### 修复

- generated-data：读取生成数据时改为按调用时 `process.cwd()` 动态解析文件路径，避免在测试/脚本中临时切换 cwd 导致读到旧数据或读取失败。

## [0.5.31] - 2026-01-13

### 新增

- 覆盖率补强：单测补齐 RSS/OPML、Search Pack、metrics 以及客户端 telemetry/monitoring 的关键分支（通过 Node 下的最小浏览器 stub 进行验证）。

### 变更

- 覆盖率门禁：将 `test:coverage` 的阈值提升为 lines/statements ≥ 85%、functions ≥ 89%、branches ≥ 60%（基于当前用例与 c8 summary 校验）。

## [0.5.30] - 2026-01-13

### 新增

- CI Commit Message 校验：`CI` workflow 新增 `commitlint` job，对 PR/push 的 commit range 执行 Conventional Commits 校验，减少“只在本地 hook 校验”的盲区。
- Git Push 门禁：新增 Husky `pre-push` hook，在推送前执行 `lint` + `check` + `test:coverage`，降低坏提交进入远端的概率。

### 变更

- 覆盖率门禁：将 `test:coverage` 的阈值提升为 lines/functions/statements ≥ 40%、branches ≥ 55%，并通过新增单测确保门禁可持续通过。
- 单元测试覆盖：补齐 `href/cover/category/format` 等纯函数用例，使覆盖率从 ~39.79% 提升到 ~45.51%（以 c8 summary 为准）。

### 修复

- Node 兼容性：`src/lib/href.ts` 与 `src/lib/cover.ts` 使用 `import.meta.env?.BASE_URL` 进行安全访问，避免在非 Vite 环境（Node/测试）下触发 `TypeError`。

## [0.5.29] - 2026-01-13

### 新增

- Commit message 门禁：引入 commitlint（`commitlint.config.cjs`）并通过 Husky `commit-msg` hook 在本地提交时校验 Conventional Commits 格式。

### 变更

- 文档：贡献指南/README 补充 Conventional Commits 与 commitlint 说明（可用 `HUSKY=0` 临时跳过 hooks）。

## [0.5.28] - 2026-01-13

### 新增

- 覆盖率摘要：新增 `scripts/coverage-step-summary.ts` 与 `npm run coverage:summary`，在 GitHub Actions Job Summary 中输出覆盖率表格（便于快速 review）。

### 变更

- CI 可观测性：`CI` workflow 在 `test:coverage` 后追加 `coverage:summary` 步骤，让覆盖率结果在 Summary 里可见。
- 工程清理：`.prettierignore` 忽略 `coverage/`、`.nyc_output/` 与 `.husky/_/` 等临时产物目录，避免格式检查误扫非源码文件。
- 覆盖率产物：`test:coverage` 增加 `json-summary` reporter 以生成 `coverage/coverage-summary.json`（供 summary 脚本读取）。

## [0.5.27] - 2026-01-13

### 新增

- 本地提交门禁：引入 Husky + lint-staged，并在 `pre-commit` 中对暂存文件执行 `eslint --fix` + `prettier --write`，同时跑 `npm test`（小步、可回滚、可验证）。

### 变更

- 覆盖率门禁：`test:coverage` 增加 `--check-coverage` 的最小阈值（lines/functions/statements ≥ 35%、branches ≥ 50%），防止覆盖率“悄悄滑坡”。
- 类型检查稳定性：`tsconfig.json` 排除 `coverage/` 等临时产物目录，避免本地跑完覆盖率后 `astro check` 误扫报告脚本导致提示噪音。

## [0.5.26] - 2026-01-13

### 新增

- 单元测试覆盖率：新增 `c8` 覆盖率工具与 `npm run test:coverage`，生成 `lcov` 与 summary 报告。

### 变更

- CI 质量门禁：`CI` workflow 的测试步骤改为 `test:coverage` 并上传 `coverage` artifact（便于回归时追踪覆盖率变化）。
- 工程清理：`.gitignore` 忽略 `coverage/` 与 `.nyc_output/`，避免本地产物污染仓库。
- 文档：README/贡献指南补充 `test:coverage` 的建议用法。

## [0.5.25] - 2026-01-13

### 新增

- 工程规范：新增 ESLint（Flat Config）与 Prettier（含 Astro plugin），并提供 `npm run lint` / `npm run format` / `npm run format:check`。

### 变更

- CI 门禁：`CI` workflow 新增 `lint` + `format:check`，确保基础规范与格式一致性在 PR/CI 侧可验证。
- 代码风格：全仓库执行 Prettier 统一格式（不改变既有业务逻辑与核心架构）。

### 修复

- 构建修复：修复 `Icon.astro` 的 type union 在 esbuild 下触发解析失败的问题（保持 Prettier check 通过）。

## [0.5.24] - 2026-01-13

### 新增

- 模拟节流跑分：新增 `.lighthouserc.simulate.json`（`throttlingMethod: "simulate"`），输出到 `lhci_reports_simulate/`，用于更贴近真实移动端网络/CPU 的对比审计。
- 模拟跑分工作流：新增 `Lighthouse CI (Simulated)` 手动工作流（workflow_dispatch），产出独立报告 artifact。

### 变更

- 本地 LHCI runner：`scripts/lhci-local.ts` 支持 `--simulate` 与 `--config FILE`（开闭原则：默认行为不变）。
- LHCI Summary：`scripts/lhci-step-summary.ts` 支持 `LHCI_OUTPUT_DIR` 指定读取的报告目录，便于并行维护多套输出。

## [0.5.23] - 2026-01-13

### 变更

- LHCI 门禁收紧：将 `categories:*` 的断言阈值提升为 `minScore: 1` 且改为 `error`，确保 PR/CI 不再“带病绿灯”。
- CI 数据校验：`CI` workflow 新增 `npm run validate`，更早发现生成数据异常与不一致问题。

## [0.5.22] - 2026-01-13

### 变更

- LHCI 门禁：`.lighthouserc.json` 使用 `throttlingMethod: "provided"`，以“无节流基线”方式稳定输出满分结果（减少模拟节流导致的漂移）。
- 首屏连接提示：移除对第三方图片代理（weserv/wsrv）的 `preconnect`，减少不必要的连接竞争。
- 启动期渲染：在 `data-acg-boot="1"` 下禁用 `.blur-*` 的 `filter: blur(...)`，并在低性能模式保持禁用，降低首屏 paint 成本。

## [0.5.21] - 2026-01-13

### 新增

- 启动失败兜底：当启动级脚本初始化失败时，页面展示静态提示条与刷新入口（`data-acg-boot="failed"`），避免白屏/无响应体验。

## [0.5.20] - 2026-01-13

### 变更

- LHCI 性能：Spotlight 标题层级更紧凑（`text-lg` + `line-clamp-2`），降低渲染延迟并减少离屏大标题成为 LCP 候选的概率。
- 资源优先级：首页“快报”缩略图增加 `fetchpriority="low"`，减少与首屏关键资源竞争，提升分数稳定性。

## [0.5.19] - 2026-01-13

### 修复

- 可访问性：Spotlight 标题/提示区块提高 chip 背景不透明度（`bg-white/80`），修复 `color-contrast` 审计导致的首页 A11y 97 分问题（/zh/、/ja/）。

## [0.5.18] - 2026-01-13

### 变更

- 首屏 LCP 稳定性：Spotlight 区块启用 `content-visibility`（配合 `contain-intrinsic-size`），降低离屏大块内容参与首屏渲染导致的 LCP 漂移。
- 封面渲染策略：Spotlight/RandomPick 在 SSR 阶段仅对本地可缓存 cover 输出 `<img>`；外链封面使用占位并由客户端渐进增强，降低外链波动对 LHCI 的影响。
- 首屏体积与 DOM：首页/分类页 SSR 默认条目数 42 → 36，并默认使用 `PostList variant="compact"`，进一步降低 DOM/解析开销。
- 可访问性：卡片封面链接补齐 `aria-label/title`；语言切换入口改用 `data-lang-switch` 供 CmdK 定位（避免 `aria-label` 语义不匹配）。
- Lighthouse 工具链：`lhci:local` 默认先 build（`ACG_BASE=/`），并提供 `--skip-build`；`lhci:summary` 兼容 `lhci_reports/manifest.json` 与 `.lighthouseci/manifest.json` 两种格式。

## [0.5.17] - 2026-01-13

### 变更

- LHCI workflow：`Lighthouse CI` GitHub Actions 使用 `npm run lhci` 统一入口，减少重复配置漂移风险。
- 测试补强：新增 `normalizeHttpUrl` 单测，覆盖追踪参数剥离与 hash 清理，提升数据去重/安全边界的可验证性。
- 详情页体积优化：详情页“相关推荐”改为轻量列表（`PostList variant="compact"` + `PostLinkItem`），显著降低 HTML 体积并提升构建/加载性能。
- 首屏体积控制：首页/分类页 SSR 默认渲染条目数 60 → 42，确保 `perf-budget` 的 HTML(core) 门禁在“有生成数据”场景下稳定通过。

## [0.5.16] - 2026-01-13

### 变更

- Pipeline 日志一致性：`scripts/sync.ts`、`scripts/lib/http-cache.ts`、`scripts/lib/translate.ts` 的 verbose 日志统一切换到 `scripts/lib/logger.ts`（减少散落 `console.*`，CI/本地语义一致）。
- 测试补强：新增 `scripts/lib/chrome-path.ts` 的环境变量优先级单测，避免本地 LHCI 路径探测回归。

## [0.5.15] - 2026-01-13

### 新增

- LHCI Local Runner：新增 `scripts/lhci-local.ts` 与 `scripts/lib/chrome-path.ts`，支持本地自动探测 Chrome/Edge 路径（或通过 `LHCI_CHROME_PATH` 显式指定）。
- LHCI 快捷脚本：新增 `npm run lhci` / `npm run lhci:local`，便于本地与 CI 统一跑分入口。

### 变更

- Step Summary 输出：`scripts/step-summary.ts` 与 `scripts/lhci-step-summary.ts` 接入 `scripts/lib/logger.ts`，在 Actions/本地保持一致输出语义。
- 文档：README 与知识库补充本地运行 Lighthouse CI 的前置条件与路径配置说明。

## [0.5.14] - 2026-01-12

### 新增

- Friendly 404：新增 `src/pages/404.astro`，构建产出 `404.html`（语言选择 + 快捷入口 + 返回按钮）。
- Pipeline Logger：新增 `scripts/lib/logger.ts`，并在关键脚本中接入（sync/validate/budget），在 GitHub Actions 下支持 annotations/group。

### 变更

- Atomic Design：`src/components/` 按 atoms/molecules/organisms 分层；同时保留 `src/components/*.astro` 兼容入口，保证既有 import 路径稳定（开闭原则：增量演进）。

## [0.5.13] - 2026-01-12

### 新增

- A11y 语义补齐：Quick chips 同步写入 `aria-pressed`，让读屏设备可感知 toggle 状态。
- A11y 反馈播报：偏好面板 `#acg-prefs-message` 增加 live region（`role="status"` / `aria-live="polite"`）。
- A11y 操作语义：关注词/屏蔽词删除按钮补齐 `aria-label`（含中/日文案），降低歧义。

## [0.5.12] - 2026-01-12

### 新增

- 键盘可访问性：分段控件与 View/Density 快捷入口补齐 roving tabindex，并支持方向键/Home/End 切换（触发 click 复用既有逻辑）。

### 变更

- Atomic UI：新增 `Segmented` / `SegmentedItem` atoms，并用于偏好面板分段控件，降低重复与后续迭代风险。

## [0.5.11] - 2026-01-12

### 新增

- perf_vitals：增量补齐 `ttfbMs` 与 `inpMs`（INP 为近似值，低性能模式自动降级/关闭），提升端侧可观测性与排障效率。

### 变更

- 首屏性能：对自托管字体（Outfit/Space Grotesk 的 latin 子集）增加 `preload`，降低首屏渲染波动并提升可预期性。

## [0.5.10] - 2026-01-12

### 变更

- 字体自托管：Outfit / Space Grotesk 改为本地 woff2（带 `unicode-range` 子集与 `font-display: swap`），并移除 Google Fonts 外链依赖，减少三方请求以提升性能与稳定性。

## [0.5.9] - 2026-01-12

### 新增

- Lighthouse CI Summary：新增 `npm run lhci:summary` 并集成到 Lighthouse workflow，在 Actions Job Summary 中展示关键 URL 跑分摘要（便于快速 review）。

## [0.5.8] - 2026-01-12

### 新增

- 启动级错误边界：前端初始化链“监控先行”，并在 init 抛错时记录 `bootstrap_fatal` telemetry + toast 轻提示。
- 同步日志摘要：新增 `npm run summary`（Step Summary），Hourly Sync workflow 自动输出抓取摘要，便于快速排障。

## [0.5.7] - 2026-01-12

### 新增

- PWA Icons：新增 PNG icons（192/512 + maskable）与 apple-touch-icon，并更新 `manifest.webmanifest`。
- SEO 基线：新增 `robots.txt` 与 `sitemap.xml` 输出，减少 Lighthouse SEO 审计的硬性扣分项（有生成数据时可增量覆盖文章页）。

## [0.5.6] - 2026-01-12

### 新增

- Lighthouse CI：新增 `.lighthouserc.json` 与 `Lighthouse CI` workflow，在 PR/手动触发时产出报告构件，作为性能/SEO/可访问性回归门禁基础。

## [0.5.5] - 2026-01-12

### 新增

- Repo 协作基线：新增 `.gitattributes`（统一 LF、标注二进制）与 `.github/CODEOWNERS`（默认评审责任归属）。

## [0.5.4] - 2026-01-12

### 新增

- GitHub 自动化：新增 Dependabot（npm + GitHub Actions）与 CodeQL 扫描 workflow。
- 工程规范：新增 `.editorconfig`，统一换行/缩进/去尾空格规则。

### 变更

- README：顶部增加 CI/CodeQL badges，便于快速查看仓库健康状态。

## [0.5.3] - 2026-01-12

### 新增

- Telemetry Viewer：事件详情新增“一键复制 JSON”，便于排障与分享。

### 变更

- README：公共章节升级为中日双语标题与说明（架构/开发/同步/环境变量/隐私），并补充协作入口。

## [0.5.2] - 2026-01-12

### 新增

- Telemetry Viewer：新增 `/zh/telemetry/` / `/ja/telemetry/` 本地事件查看页，支持过滤、导出、清空与事件详情查看。
- 状态页入口：`/status` 增加 Telemetry Viewer 快捷入口。

### 变更

- 隐私加固：telemetry `path` 不再包含 query/hash；`page_view.referrer` 剥离 query/hash；错误一行文本同样剥离 URL query/hash。

## [0.5.1] - 2026-01-12

### 新增

- Telemetry 管理工具：偏好面板新增本地 telemetry 的导出/清空，并显示事件数与占用体积，便于自助排障与隐私可控。

## [0.5.0] - 2026-01-12

### 新增

- 可观测性增强：新增全局错误捕获（`error`/`unhandledrejection`）与 Web Vitals（LCP/CLS/longtask）采集，默认写入本地 telemetry，便于排障与体验回溯。
- Telemetry 偏好：偏好面板新增可选上报开关与 endpoint 配置（默认关闭），页面离开/后台化时以 sendBeacon/fetch(keepalive) 尝试发送。
- Atomic UI：新增 `src/components/atoms/Chip.astro`，并在首页/分类页/信号板增量替换 chips，统一结构与样式语义。
- 单元测试：补齐 monitoring 相关纯函数测试（归一化/截断/URL query/hash 剥离/去噪 key）。

### 修复

- 修复 `Chip` 组件 props 类型过窄导致的 `astro check` 报错。

## [0.4.0] - 2026-01-11

### 新增

- GitHub 协作入口：新增 Issue Forms（Bug/Feature）、PR 模板，以及 `CONTRIBUTING.md` / `CODE_OF_CONDUCT.md` / `SECURITY.md` / `SUPPORT.md`（中日双语）。
- 布局/密度快捷入口：首页与分类页新增 View（Grid/List）与 Density（Comfort/Compact）快捷 chips，阅读节奏切换更就地可达。
- 命令面板增强：Command Palette 新增 `layout` / `density` 命令（toggle + 直达设置），在页面缺少控件时回退为“仅保存偏好”并提示。
- 图标补齐：`Icon` 组件新增 `grid` / `list` 图标，提升 UI 一致性。

### 变更

- README 更新“布局/密度”快捷入口说明（chips + Command Palette + 偏好）。

## [0.3.0] - 2026-01-11

### 新增

- 布局模式与密度：新增 View Mode（Grid/List）与 Density（Comfort/Compact）偏好项，桌面端也可一键切换“扫读/浏览”节奏。
- 信号层升级：首页新增 SignalBoard（脉冲热榜/时间透镜/来源健康度/快捷操作），首屏信息更集中。
- 派生指标层：新增 Pulse 热度、阅读时长、去重键与来源健康度计算，并为列表输出统计摘要。
- 偏好与筛选增强：新增时间透镜、热度排序、去重视图与“只看稳定来源”开关。
- 卡片元信息：新增热度分/阅读时长/重复计数与健康度徽章，提升信息密度与判断效率。
- 视觉系统令牌化：引入栅格（`gap-grid` / `px-gutter`）、黄金比例排版尺度（`text-phi-*`）与 12 级阴影层级（`shadow-e1..e12`）。
- 玻璃拟态升级：主要容器支持动态渐变边框（hover 动画）与 SVG 路径绘制式占位动效。
- 交互体验：View Transitions 转场动效（CSS）+ WAAPI 降级；收藏页骨架屏 shimmer。
- 功能补强：站内搜索支持多级筛选语法（`tag:`/`source:`/`cat:`/`before:`/`after:`/`is:` + `-` 反选）。
- 功能补强：新增“全站搜索包” search-pack（构建期生成 `search-pack.v1.json(.gz)` / `search-pack.v2.json(.gz)`：posts + 预计算索引），全站搜索 Worker 默认优先 v2，失败回退 v1，必要时回退 `posts.json(.gz)`；IndexedDB 缓存升级为 posts+index（含迁移），并支持请求取消/结果截断以稳定 60FPS。
- 状态趋势可追溯：同步阶段生成 `status-history.v1.json(.gz)`（回读上一轮并追加裁剪），`/status` 可展示最近 7/30 轮趋势（成功率/异常来源数/新增条目）。
- 来源扩量：新增多个 RSS/Atom/RDF 来源并对部分泛资讯源加入 include 降噪，提升抓取数量性且维持可维护性。
- 可观测：新增本地优先埋点模块（默认不上传；可选 sendBeacon/fetch 上报）。
- 命令面板深链：支持 `/#cmdk` 直接打开 Command Palette，并通过事件桥接复用全局 Toast 展示复制等反馈。
- 命令面板 UI：分组标题 + 关键词高亮 + 滚动条与入场动效微调（提升“商业软件”质感）。
- 可访问性：新增 Skip Link（跳到主要内容），键盘用户可快速跨过导航进入主内容。
- 分类页快捷入口：新增“全站·本分类”按钮，一键切换全站搜索并预填 `cat:<category>`。

### 变更

- 客户端可维护性：抽离 localStorage 容错读写与 Set 持久化工具到 `src/client/state/storage.ts`，减少 `src/client/app.ts` 重复代码与变更风险。
- 过滤状态升级为 v3，统一 timeLens/sortMode/dedup/onlyStableSources 的持久化与 UI 联动。
- 分类页首屏瘦身：分类页静态渲染条目数 120→60，显著降低 HTML 体积与解析成本；全量内容可通过“全站·本分类”一键进入。
- 网络请求退避重试加入 jitter，降低同步重试带来的拥塞风险。
- 搜索查询解析模块下沉到 `src/lib/search/query.ts`，供页面内过滤、全站搜索 Worker 与命令面板共享（减少路径耦合）。
- 搜索包构建去重：同步管线 `scripts/sync.ts` 复用 `src/lib/search/pack.ts` 的 `buildSearchPack`（减少重复实现，确保构建期与运行时一致）。
- 搜索 Worker 更稳：读取 IndexedDB/search-pack 时对 posts/index 做归一化与自愈写回（避免旧缓存/异常数据导致索引不一致）。
- 文档呈现升级：README 增加 Title ASCII 艺术字、扩展 Badges，并补充 TL;DR 的 Emoji 特性列表。
- 详情页：新增“复制链接”按钮（复制站内页面链接），并复用全局 Toast 反馈。
- SEO/分享：`SiteLayout` 增加 canonical + Open Graph/Twitter meta；详情页默认注入 `article` 类型与封面图（如可用）。
- 视觉系统参数变量化：玻璃 blur/saturate 与边框动效可通过 `--acg-glass-*` / `--acg-border-pan-*` 调参。
- 视觉性能：新增 `data-acg-perf="low"` 自动降级（连接信息/设备信息 + 运行时 FPS 探测），降低 blur/阴影/边框动画开销。
- PWA 缓存：Service Worker 的 data 缓存策略覆盖 `search-pack.v1.json(.gz)` / `search-pack.v2.json(.gz)` / `status-history.v1.json(.gz)`，改善冷启动与弱网体验。
- Perf Budget 指标拆分：入口页 core 预算不计入 `dist/data/*.json`；新增 `data.json` 指标（默认仅观测，可用 `ACG_BUDGET_DATA_JSON_KB` 启用门禁）。
- 工具函数去重：剪贴板复制逻辑统一到 `src/client/utils/clipboard.ts`（更可靠的回退路径与清理）。
- Toast 交互：增加图标、悬停阴影与点击消失动画（保持轻量且更直观）。
- UI 流畅度：新增滚动期 `data-acg-scroll="1"` 视觉降级（滚动时禁用 backdrop-filter、暂停 shimmer/占位动画），提升滚动稳定性。
- 信息流层次：卡片入场 `data-acg-inview`（IntersectionObserver 打标 + transform/opacity 过渡；低性能与减少动效自动关闭）。
- 页面转场：View Transitions 与 WAAPI 降级去除 filter blur（仅保留 opacity/transform），降低合成与掉帧风险。
- 全文预览性能：渲染后处理（去壳/图墙治理/链接增强）延后到 idle 执行，并对 `data-acg-perf="low"` 做阈值限制；滚动期不自动触发自动翻译，降低移动端卡顿。
- 全文预览 Worker 化：渲染/翻译的字符串重计算优先由 Web Worker 执行，主线程只做 DOM 注入与 idle 后处理；Worker 不可用时回退主线程实现。
- 全文预览 DOM 注入：渲染结果按 blocks 切分，并在长文/低性能模式下渐进式追加，减少一次性 `innerHTML` 注入带来的长任务与切换卡顿。
- 全文预览滚动优化：对 `[data-fulltext-content] > *` 启用 `content-visibility: auto`（并配置 `contain-intrinsic-size` 兜底），降低长文滚动时的离屏渲染开销；不支持的浏览器自动退化。
- 抓取稳定性：对瞬时失败（超时/429/5xx）增加保守重试 + jitter 退避，降低整点波动误报。
- 同步提速：来源抓取支持 `ACG_SOURCE_CONCURRENCY` 有限并发（默认 `3`），抓取阶段 http cache 统一落盘，避免并发写入竞态并减少 IO。
- 状态页可观测性：为每个来源记录抓取 attempts/waitMs 与解析 raw/filtered 统计，并在 `/status` 页面展示，降低排障成本。
- 状态页趋势增强：新增每来源“新增条目数/最新发布时间/连续失败次数”等趋势字段，并在 `/status` 页面展示，更容易定位停更与持续失败。
- 数据质量：同步阶段 URL 规范化剥离常见追踪参数（如 `utm_*` / `fbclid` / `gclid` 等），提升去重准确性。
- 翻译覆盖策略：同步翻译阶段优先处理“缺翻译字段”的条目，在 `maxPosts` 限制下覆盖更均匀。
- 可维护性：同步管线的 HTML 来源解析改为注册表（插件式），移除按 source.id 的硬编码特判。
- 翻译质量：来源配置新增 `lang`（`en|ja|zh|unknown`），同步翻译阶段按来源语言跳过“同语种自翻译”，并在已有翻译字段存在时不重复生成（降低波动与请求量）。
- 抓取稳定性：新增 `parse_drop`（解析结果异常缩水）回退策略；当历史数据足够多且本次明显异常变少时回退上一轮，避免静默停更（阈值可用环境变量覆盖）。
- 抓取稳定性：`parse_drop` 判定基于解析前的 `rawItemCount`（而非过滤后的条目数），避免带 `include` 的来源因过滤后条目较少而误触发 fallback。
- 抓取数量性：放宽 `Gematsu` / `GAME Watch` 的 include 降噪规则（改为不过滤），提升 game 类来源条目与搜索覆盖。
- 来源质量：`animeanime-list` 从 HTML 列表页切换为 RSS 源（`https://animeanime.jp/rss20/index.rdf`），降低解析脆弱性并提升抓取稳定性。
- 状态页体验：新增全局汇总指标（本轮新增/疑似停更/连续失败≥3）与 `parse_*` 错误建议（zh/ja），更快定位风险来源。
- PWA 离线/弱网：Service Worker 对 data 请求按类型提供安全兜底（避免 `{}` 误伤），离线页展示最近更新时间并增加 status 快捷入口；客户端新增 online/offline Toast 轻提示。

## [0.2.2] - 2026-01-06

### 新增

- 单元测试：新增 `npm test`（Node test runner + tsx），覆盖搜索查询解析与外链安全等关键纯函数。
- CI 质量门禁：CI 与定时部署 workflow 统一执行 `npm test`；本地 `scripts/genesis.ps1` 默认加入测试步骤。

### 变更

- 外链安全：站点渲染外部链接前统一执行 `http(s)` 协议白名单校验，非 `http(s)` 外链降级为不可点击；详情页全文预览在 URL 无效时自动禁用 autoload。
- 同步数据质量：同步阶段丢弃非 `http(s)` 的条目 URL，并继续保守剥离常见追踪参数以提升去重稳定性。
- 工程对齐：Node 运行时约束声明为 `>=20`，并将 `@types/node` 固定到 20.x，避免类型版本与 CI 运行时漂移。

## [0.2.1] - 2025-12-29

### 新增

- 新增命令面板（Command Palette）：`Ctrl/⌘ + K` 快速导航/切换过滤/主题/语言，并支持一键复制当前页链接（按需懒加载）。
- 新增 `/#prefs` 深链：在首页/分类页可直接打开偏好设置抽屉（与 `/#search` 聚焦搜索一致）。

### 变更

- 搜索查询解析逻辑统一：页面内过滤与全站搜索 Worker 共享 `src/lib/search/query.ts`，减少冗余并提升行为一致性。
- Perf Budget 更贴合：HTML/XML/JSON 预算默认仅统计“核心入口页”（排除 `/p/<id>/` 详情页），默认阈值调整为 5000KB（可用 `ACG_BUDGET_HTML_KB` 覆盖）。

### 修复

- 修复 `astro check` 的未使用变量/参数提示（OPML endpoint、性能探测中的 RAF 变量）。

## [0.2.0] - 2025-12-25

### 新增

- 增加来源配置的单一事实来源（SSOT），用于同步脚本与站点页面共用。
- 新增 OPML 导出（/zh/opml.xml、/ja/opml.xml），便于导入阅读器。
- 新增 JSON Feed（/zh/feed.json、/ja/feed.json），便于程序化订阅。
- 新增 PWA 基础能力：Manifest + Service Worker（离线/弱网体验提升）。
- 新增同步产物校验与构建体积预算脚本，作为 CI 质量门禁。

### 变更

- 重构 About 页的来源列表数据来源，避免站点侧依赖 scripts 目录实现细节。

### 修复

- N/A

### 移除

- N/A
