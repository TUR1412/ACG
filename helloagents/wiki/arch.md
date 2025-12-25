# 架构设计

## 总体架构

```mermaid
flowchart TB
  subgraph CI[GitHub Actions · Hourly Sync & Deploy]
    direction TB
    Checkout[checkout] --> Install[npm ci]
    Install --> Sync[npm run sync]
    Sync --> Validate[npm run validate]
    Validate --> Build[npm run build]
    Build --> Budget[npm run budget]
    Budget --> Deploy[deploy-pages]
  end

  subgraph Runtime[Browser Runtime]
    direction TB
    Static[静态 HTML/CSS/JS] --> App[client app]
    App --> LS[(localStorage)]
    App --> SW[Service Worker]
    SW --> Cache[(Cache Storage)]
  end
```

## 技术栈
- 构建/站点：Astro（静态输出）+ Vite
- 样式：Tailwind + 自定义 CSS 变量（主题/玻璃拟态）
- 数据：同步阶段生成 `public/data/*.json(.gz)` 与 `src/data/generated/*.json`（均不提交）
- 部署：GitHub Pages

## 核心流程

```mermaid
sequenceDiagram
  participant GH as GitHub Actions
  participant Sync as scripts/sync.ts
  participant Site as astro build
  participant Pages as GitHub Pages

  GH->>Sync: 定时触发（每小时）
  Sync->>Sync: 拉取来源（RSS/HTML）
  Sync->>Sync: 清洗/补图/翻译字段
  Sync->>Sync: 生成 posts.json / status.json
  GH->>Site: astro build（静态产物）
  Site->>Pages: 上传并部署
```

## 重大架构决策

| adr_id | title | date | status | affected_modules | details |
|--------|-------|------|--------|------------------|---------|
| ADR-001 | 来源配置改为单一事实来源（SSOT） | 2025-12-25 | ✅已采纳 | pipeline-sync / web-ui / shared-lib | history/2025-12/202512252117_evolution_v0_2/how.md |
| ADR-002 | 增加 OPML 与 JSON Feed 订阅导出 | 2025-12-25 | ✅已采纳 | web-ui / shared-lib | history/2025-12/202512252117_evolution_v0_2/how.md |
| ADR-003 | 引入 PWA 基础（Manifest + SW） | 2025-12-25 | ✅已采纳 | web-ui / client-app | history/2025-12/202512252117_evolution_v0_2/how.md |
| ADR-004 | CI 增加数据校验与体积预算门禁 | 2025-12-25 | ✅已采纳 | pipeline-sync | history/2025-12/202512252117_evolution_v0_2/how.md |

