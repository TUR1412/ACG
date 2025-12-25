# ACG Radar

## 1. 项目概述

### 目标与背景
ACG Radar 是一个“伪全栈”的 ACG 资讯雷达站点：通过 GitHub Actions 定时同步外部来源内容，生成静态站点并部署到 GitHub Pages，做到低运维、可持续运行。

### 范围
- 范围内：
  - 聚合外部资讯的标题/摘要/时间/来源链接
  - 中日双语 UI 与内容字段（按需翻译/展示）
  - 本地个性化（已读/收藏/过滤/关注/屏蔽等）
  - 状态页展示同步健康度
- 范围外：
  - 站点后端常驻服务/数据库
  - 转载全文作为默认行为（详情页以跳转原文为主，全文预览为实验能力）

## 2. 模块索引

| 模块名称 | 职责 | 状态 | 文档 |
|---------|------|------|------|
| pipeline-sync | CI 同步抓取/清洗/产物生成 | ✅稳定 | modules/pipeline-sync.md |
| web-ui | Astro 页面/组件与展示层 | ✅稳定 | modules/web-ui.md |
| client-app | 浏览器端交互增强与本地状态 | ✅稳定 | modules/client-app.md |
| shared-lib | 站点/脚本共用的类型与工具 | ✅稳定 | modules/shared-lib.md |

## 3. 快速链接
- 技术约定：../project.md
- 架构设计：arch.md
- API 手册：api.md
- 数据模型：data.md
- 变更历史：../history/index.md

