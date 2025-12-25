# Changelog

本文件记录项目所有重要变更。
格式基于 Keep a Changelog，版本号遵循语义化版本（SemVer）。

## [Unreleased]

### 新增
- 视觉系统令牌化：引入栅格（`gap-grid` / `px-gutter`）、黄金比例排版尺度（`text-phi-*`）与 12 级阴影层级（`shadow-e1..e12`）。
- 玻璃拟态升级：主要容器支持动态渐变边框（hover 动画）与 SVG 路径绘制式占位动效。
- 交互体验：View Transitions 转场动效（CSS）+ WAAPI 降级；收藏页骨架屏 shimmer。
- 功能补强：站内搜索支持多级筛选语法（`tag:`/`source:`/`cat:`/`before:`/`after:`/`is:` + `-` 反选）。
- 可观测：新增本地优先埋点模块（默认不上传；可选 sendBeacon/fetch 上报）。

### 变更
- 网络请求退避重试加入 jitter，降低同步重试带来的拥塞风险。

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

