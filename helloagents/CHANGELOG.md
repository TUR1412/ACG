# Changelog

本文件记录项目所有重要变更。
格式基于 Keep a Changelog，版本号遵循语义化版本（SemVer）。

## [Unreleased]

### 新增
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
- 抓取稳定性：对瞬时失败（超时/429/5xx）增加保守重试 + jitter 退避，降低整点波动误报。
- 状态页可观测性：为每个来源记录抓取 attempts/waitMs 与解析 raw/filtered 统计，并在 `/status` 页面展示，降低排障成本。
- 状态页趋势增强：新增每来源“新增条目数/最新发布时间/连续失败次数”等趋势字段，并在 `/status` 页面展示，更容易定位停更与持续失败。
- 数据质量：同步阶段 URL 规范化剥离常见追踪参数（如 `utm_*` / `fbclid` / `gclid` 等），提升去重准确性。
- 翻译覆盖策略：同步翻译阶段优先处理“缺翻译字段”的条目，在 `maxPosts` 限制下覆盖更均匀。
- 可维护性：同步管线的 HTML 来源解析改为注册表（插件式），移除按 source.id 的硬编码特判。
- 翻译质量：来源配置新增 `lang`（`en|ja|zh|unknown`），同步翻译阶段按来源语言跳过“同语种自翻译”，并在已有翻译字段存在时不重复生成（降低波动与请求量）。
- 抓取稳定性：新增 `parse_drop`（解析结果异常缩水）回退策略；当历史数据足够多且本次明显异常变少时回退上一轮，避免静默停更（阈值可用环境变量覆盖）。
- 抓取稳定性：`parse_drop` 判定基于解析前的 `rawItemCount`（而非过滤后的条目数），避免带 `include` 的来源因过滤后条目较少而误触发 fallback。
- 来源质量：`animeanime-list` 从 HTML 列表页切换为 RSS 源（`https://animeanime.jp/rss20/index.rdf`），降低解析脆弱性并提升抓取稳定性。
- 状态页体验：新增全局汇总指标（本轮新增/疑似停更/连续失败≥3）与 `parse_*` 错误建议（zh/ja），更快定位风险来源。
- PWA 离线/弱网：Service Worker 对 data 请求按类型提供安全兜底（避免 `{}` 误伤），离线页展示最近更新时间并增加 status 快捷入口；客户端新增 online/offline Toast 轻提示。

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

