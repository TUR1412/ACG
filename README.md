```text
   ___   _______   _______           ____            __
  / _ | / ___/ /  / ___/ /  ___ ____/ __ \\___ ____  / /__
 / __ |/ /__/ /__/ /__/ _ \\/ -_) __/ /_/ / _ `/ _ \\/  '_/
/_/ |_|\\___/____/\\___/_//_/\\__/_/  \\____/\\_,_/_//_/_/\\
```

<p align="center">
  <img src="docs/readme-banner.svg?raw=1" alt="ACG Radar / ACGレーダー" />
</p>

# ACG Radar / ACGレーダー

> **每小时更新**的 ACG 资讯雷达：抓取 → 静态构建 → GitHub Pages 部署。
> **毎時更新**の ACG ニュースレーダー：取得 → 静的ビルド → GitHub Pages へデプロイ。

[![Hourly Sync & Deploy (GitHub Pages)](https://github.com/TUR1412/ACG/actions/workflows/hourly-sync-and-deploy.yml/badge.svg)](https://github.com/TUR1412/ACG/actions/workflows/hourly-sync-and-deploy.yml)
![MIT](https://img.shields.io/badge/License-MIT-black)
![Astro](https://img.shields.io/badge/Astro-5-FF5D01?logo=astro&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06b6d4?logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-ready-22c55e)

**在线预览 / Demo**
- https://tur1412.github.io/ACG/

**快速入口 / クイックリンク**
- 中文：`/zh/` → https://tur1412.github.io/ACG/zh/
- 日本語：`/ja/` → https://tur1412.github.io/ACG/ja/
- 状态页：`/status/` → https://tur1412.github.io/ACG/zh/status/（中文） / https://tur1412.github.io/ACG/ja/status/（日本語）
- RSS：`/zh/feed.xml`（中文） / `/ja/feed.xml`（日本語）
- JSON Feed：`/zh/feed.json`（中文） / `/ja/feed.json`（日本語）
- OPML：`/zh/opml.xml`（中文） / `/ja/opml.xml`（日本語）

---

## 核心亮点 / Highlights

- **Pulse Ranking / パルスランキング**：热度分聚合热点，快速定位最值得看的内容。
- **Time Lens / タイムレンズ**：2h / 6h / 24h 一键聚焦最新趋势。
- **Smart Dedup / 重複除外**：相似标题去重，降低转发噪音。
- **Read Depth / 読了時間**：预计阅读时长，让浏览节奏更可控。
- **Source Trust / ソース信頼度**：来源健康度可视化，支持“只看稳定来源”。
- **全站搜索**：标题 / 摘要 / 标签 / 来源快速过滤，支持 `tag:` / `source:` / `cat:` / `before:` / `after:` / `is:` 语法。
- **Command Palette**：`Ctrl/⌘ + K` 快速切换过滤、主题、语言。
- **PWA / 离线兜底**：弱网或离线时回退到最近缓存页面。

---

## 视觉与体验 / UI & UX

- **未来感视觉系统**：霓虹边界 + 极简玻璃拟态 + 信号化信息层级。
- **可访问性优化**：清晰的层级对比、可读的字体系统、Reduced Motion 支持。
- **性能优先策略**：低性能设备自动降级重渲染效果，保持滚动流畅。

---

## 架构 / Architecture

<p align="center">
  <img src="docs/architecture.svg?raw=1" alt="ACG Radar Architecture" />
</p>

<details>
  <summary><b>Mermaid 架构图（可复制/可编辑）</b></summary>

```mermaid
flowchart TB
  %% ─────────────────────────────────────────────────────────────
  %%  Data Pipeline (CI) : Sync → Build → Deploy
  %% ─────────────────────────────────────────────────────────────
  subgraph CI[GitHub Actions · Hourly Sync & Deploy]
    direction TB
    Checkout[actions/checkout] --> Install[npm ci]
    Install --> Sync[scripts/sync.ts\n抓取/清洗/补图/翻译字段]
    Sync --> Gen[src/data/generated/*.json]
    Sync --> Public[public/data/posts.json\n+ public/covers/*（部署产物）]
    Gen --> Validate[scripts/validate-generated-data.ts\n结构校验/不变量校验]
    Public --> Validate
    Validate --> Build[astro build]
    Build --> Budget[scripts/perf-budget.ts\ndist 体积预算门禁]
    Budget --> Dist[dist/（静态站点产物）]
    Dist --> Deploy[actions/deploy-pages\nGitHub Pages]
  end

  %% ─────────────────────────────────────────────────────────────
  %%  Runtime (Browser) : Static HTML + Local State + On-demand Fulltext
  %% ─────────────────────────────────────────────────────────────
  subgraph RT[浏览器 Runtime（无后端常驻）]
    direction TB
    Deploy --> HTML[静态 HTML（/zh /ja）]
    HTML --> App[src/client/app.ts\n收藏/已读/过滤/交互增强]
    App --> LS[(localStorage)\n用户偏好/已读/收藏]
    App --> Feed[/zh/feed.xml\n/ja/feed.xml]
    App -->|按需加载| Fulltext[src/client/features/fulltext.ts\n全文预览 chunk]
    Fulltext --> Reader[r.jina.ai\n阅读模式]
  end
```
</details>

---

## 本地开发 / ローカル開発

```bash
npm install
npm run dev
```

- Node.js: `>= 20`

---

## 数据同步 / データ同期

```bash
npm run sync
npm run validate
npm run budget
```

---

## 质量与性能 / Quality & Performance

```bash
npm run check
npm test
npm run build
```

---

## 隐私 / Privacy

- 所有偏好与收藏默认仅保存在本机浏览器（localStorage）。
- 站点仅聚合信息并跳转原站，版权归原站。

---

## License

MIT
