# Changelog

本文件记录项目所有重要变更。
格式基于 Keep a Changelog，版本号遵循语义化版本（SemVer）。

## [Unreleased]

### 新增
- 视觉系统令牌化：引入栅格（`gap-grid` / `px-gutter`）、黄金比例排版尺度（`text-phi-*`）与 12 级阴影层级（`shadow-e1..e12`）。
- 玻璃拟态升级：主要容器支持动态渐变边框（hover 动画）与 SVG 路径绘制式占位动效。
- 交互体验：View Transitions 转场动效（CSS）+ WAAPI 降级；收藏页骨架屏 shimmer。
- 功能补强：站内搜索支持多级筛选语法（`tag:`/`source:`/`cat:`/`before:`/`after:`/`is:` + `-` 反选）。
- 功能补强：新增“全站搜索包” search-pack（构建期生成 `search-pack.v1.json(.gz)`：posts + 预计算索引），全站搜索 Worker 优先预取 search-pack，必要时回退 `posts.json(.gz)`；IndexedDB 缓存升级为 posts+index（含迁移），并支持请求取消/结果截断以稳定 60FPS。
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
- PWA 缓存：Service Worker 的 data 缓存策略覆盖 `search-pack.v1.json(.gz)`，改善冷启动与弱网体验。
- Perf Budget 指标拆分：入口页 core 预算不计入 `dist/data/*.json`；新增 `data.json` 指标（默认仅观测，可用 `ACG_BUDGET_DATA_JSON_KB` 启用门禁）。
- 工具函数去重：剪贴板复制逻辑统一到 `src/client/utils/clipboard.ts`（更可靠的回退路径与清理）。
- Toast 交互：增加图标、悬停阴影与点击消失动画（保持轻量且更直观）。
- UI 流畅度：新增滚动期 `data-acg-scroll="1"` 视觉降级（滚动时禁用 backdrop-filter、暂停 shimmer/占位动画），提升滚动稳定性。
- 信息流层次：卡片入场 `data-acg-inview`（IntersectionObserver 打标 + transform/opacity 过渡；低性能与减少动效自动关闭）。
- 页面转场：View Transitions 与 WAAPI 降级去除 filter blur（仅保留 opacity/transform），降低合成与掉帧风险。

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

