# Changelog

本文件记录项目所有重要变更。
格式基于 Keep a Changelog，版本号遵循语义化版本（SemVer）。

## [Unreleased]

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

