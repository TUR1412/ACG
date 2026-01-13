# ACG Radar

## 1. 项目概述

### 目标与背景

ACG Radar 是一个“伪全栈”的 ACG 资讯雷达站点：通过 GitHub Actions 定时同步外部来源内容，生成静态站点并部署到 GitHub Pages，保持低运维与长期运行。当前版本强化了“信号层”与“时间透镜”能力，让热点识别更快、噪音更少、阅读节奏更可控。

### 范围

- 范围内：
  - 聚合外部资讯的标题/摘要/时间/来源链接
  - 中日双语 UI 与内容字段（按需翻译/展示）
  - 本地个性化（已读/收藏/过滤/关注/屏蔽等）
  - 派生指标层（Pulse 热度 / 预计阅读时长 / 去重键）
  - Time Lens 时间透镜（2h/6h/24h）
  - 来源健康度可视化与“稳定来源”过滤
  - 状态页展示同步健康度
- 范围外：
  - 站点后端常驻服务/数据库
  - 转载全文作为默认行为（详情页以跳转原文为主，全文预览为实验能力）

## 2. 模块索引

| 模块名称            | 职责                                 | 状态   | 文档                           |
| ------------------- | ------------------------------------ | ------ | ------------------------------ |
| pipeline-sync       | CI 同步抓取/清洗/产物生成            | ✅稳定 | modules/pipeline-sync.md       |
| pipeline-lighthouse | PR/手动触发跑分门禁（LHCI）          | ✅稳定 | modules/pipeline-lighthouse.md |
| web-ui              | Astro 页面/组件与信号化展示层        | ✅稳定 | modules/web-ui.md              |
| client-app          | 浏览器端交互增强、本地状态与筛选管线 | ✅稳定 | modules/client-app.md          |
| shared-lib          | 类型、格式化与指标计算等共享库       | ✅稳定 | modules/shared-lib.md          |

## 3. 快速链接

- 技术约定：../project.md
- 架构设计：arch.md
- API 手册：api.md
- 数据模型：data.md
- 变更历史：../history/index.md
