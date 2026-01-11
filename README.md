```text
   ___   _______   _______           ____            __
  / _ | / ___/ /  / ___/ /  ___ ____/ __ \___ ____  / /__
 / __ |/ /__/ /__/ /__/ _ \/ -_) __/ /_/ / _ `/ _ \/  '_/
/_/ |_|\___/____/\___/_//_/\__/_/  \____/\_,_/_//_/_/\_\
```

<p align="center">
  <img src="docs/readme-banner.svg?raw=1" alt="ACG Radar / ACGレーダー" />
</p>

<h1 align="center">ACG Radar / ACGレーダー</h1>

<p align="center">
  <b>每小时更新</b>的 ACG 资讯雷达：抓取 → 静态构建 → GitHub Pages 部署<br/>
  <b>毎時更新</b>の ACG ニュースレーダー：取得 → 静的ビルド → GitHub Pages へデプロイ
</p>

[![Hourly Sync & Deploy (GitHub Pages)](https://github.com/TUR1412/ACG/actions/workflows/hourly-sync-and-deploy.yml/badge.svg)](https://github.com/TUR1412/ACG/actions/workflows/hourly-sync-and-deploy.yml)
[![CI](https://github.com/TUR1412/ACG/actions/workflows/ci.yml/badge.svg)](https://github.com/TUR1412/ACG/actions/workflows/ci.yml)
[![CodeQL](https://github.com/TUR1412/ACG/actions/workflows/codeql.yml/badge.svg)](https://github.com/TUR1412/ACG/actions/workflows/codeql.yml)
![MIT](https://img.shields.io/badge/License-MIT-black)
![Astro](https://img.shields.io/badge/Astro-5-FF5D01?logo=astro&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06b6d4?logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-ready-22c55e)

<p align="center">
  <a href="https://tur1412.github.io/ACG/">Demo</a> ·
  <a href="#中文">中文</a> ·
  <a href="#日本語">日本語</a>
</p>

---

## 中文

### 在线预览 / 快速入口

- Demo：https://tur1412.github.io/ACG/
- 中文：`/zh/` → https://tur1412.github.io/ACG/zh/
- 日本語：`/ja/` → https://tur1412.github.io/ACG/ja/
- 状态页：`/status/`
  - 中文：https://tur1412.github.io/ACG/zh/status/
  - 日本語：https://tur1412.github.io/ACG/ja/status/
- 订阅导出：
  - RSS：`/zh/feed.xml` / `/ja/feed.xml`
  - JSON Feed：`/zh/feed.json` / `/ja/feed.json`
  - OPML：`/zh/opml.xml` / `/ja/opml.xml`

### TL;DR（这是什么）

ACG Radar 是一个“伪全栈”的 ACG 资讯雷达站点：数据由 GitHub Actions **每小时抓取**并清洗，生成静态站点后部署到 GitHub Pages。

核心目标：更快识别热点、更少重复噪音、更轻的阅读成本，且保持 **无后端常驻**、低运维、可长期跑。

### Highlights（你会用到的能力）

- **Pulse Ranking**：热度分聚合热点，快速定位最值得看的内容
- **Time Lens**：2h / 6h / 24h 一键聚焦最新趋势
- **Smart Dedup**：相似标题去重，降低转发噪音
- **Read Depth**：预计阅读时长，让浏览节奏更可控
- **Source Trust**：来源健康度可视化，支持“只看稳定来源”
- **全站搜索**：标题/摘要/标签/来源快速过滤，支持 `tag:` / `source:` / `cat:` / `before:` / `after:` / `is:` 语法（含 `-` 反选）
- **Command Palette**：`Ctrl/⌘ + K` 快速切换过滤、主题、语言、复制链接等        
- **Layout Modes**：Grid/List 视图 + Comfort/Compact 密度，一键适配“扫读 / 浏览”
- **PWA / 离线兜底**：弱网或离线时回退到最近缓存页面
- **Telemetry（可观测性）**：本地优先记录未捕获异常与性能线索（LCP/CLS/longtask），支持用户显式开启上报
- **Atomic UI（Atoms）**：Chips 等基础 UI 原子组件化，统一样式与交互语义，便于持续迭代

### 可观测性（Telemetry）

- 默认 **只在本机记录**（localStorage），不会自动向任何服务器上传。
- 可选开启：打开“偏好” → `Telemetry` → 勾选“允许上报”，并填写 `http(s)` endpoint。
- 管理工具：支持导出/清空本地 telemetry（偏好 → `Telemetry` → 导出/清空）。
- Telemetry Viewer：本机事件查看页 `/zh/telemetry/` / `/ja/telemetry/`（只读 localStorage，不自动上传）。
- 采集范围（轻量/可降级）：未捕获异常（`error`/`unhandledrejection`）+ Web Vitals（LCP/CLS）+ 抽样 longtask。
- 隐私保护：栈信息会截断并剥离 URL query/hash；错误提示做去重/节流，避免“雪崩式 toast”。

### 快捷键 & 深链（效率入口）

- 搜索聚焦：`/#search`
- 偏好抽屉：`/#prefs`
- Command Palette：`Ctrl/⌘ + K`（或深链 `/#cmdk`）
- 布局/密度：首页/分类页 chips 一键切换；或 Command Palette 搜索 `layout`/`density`；也可在“偏好” → `视图`/`密度` 中设置

### 协作 / 参与贡献

- 提 Issue：本仓库启用了 Issue Forms（Bug / Feature），更利于结构化收集信息。
- 提 PR：请先阅读 `CONTRIBUTING.md`，并遵循 `CODE_OF_CONDUCT.md`。
- 安全/隐私：请遵循 `SECURITY.md`（不要在公开 Issue 中披露密钥、个人信息或漏洞利用细节）。

---

## 架构（静态站 + 定时同步） / アーキテクチャ（静的サイト + 定期同期）

<p align="center">
  <img src="docs/architecture.svg?raw=1" alt="ACG Radar Architecture" />
</p>

<details>
  <summary><b>Mermaid 架构图（可复制/可编辑） / Mermaid（コピー/編集可）</b></summary>

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
npm ci
npm run dev
```

- Node.js：`>= 20`

---

## 数据同步（抓取 / 清洗 / 生成） / データ同期（取得 / クリーニング / 生成）

```bash
npm run sync
npm run validate
npm run budget
```

---

## 质量与性能（建议 PR 前） / 品質とパフォーマンス（PR前推奨）

```bash
npm run check
npm test
npm run build
```

---

## 环境变量（可选） / 環境変数（任意）

<details>
  <summary><b>展开：常用环境变量一览 / 展開：主な環境変数</b></summary>

| 变量 / 変数 | 用途 / 用途 | 默认 / 既定 |
|---|---|---|
| `ACG_BASE` | GitHub Pages base path（本地一般用 `/`）<br/>GitHub Pages の base path（ローカルは通常 `/`） | `/` |
| `ACG_SOURCE_CONCURRENCY` | 同步抓取阶段并发数（更保守=更稳）<br/>同期取得の並列数（保守的=安定） | `3` |
| `ACG_TRANSLATE_MAX_POSTS` | 同步阶段翻译覆盖上限（标题/摘要/预览等字段）<br/>同期翻訳の上限（タイトル/要約/プレビュー等） | `220` |
| `ACG_TRANSLATE_TIMEOUT_MS` | 翻译请求超时（毫秒）<br/>翻訳リクエストのタイムアウト（ms） | `18000` |
| `ACG_BUDGET_JS_KB` | `dist/` JS 预算门禁（KB）<br/>`dist/` JS サイズ上限（KB） | `450` |
| `ACG_BUDGET_CSS_KB` | `dist/` CSS 预算门禁（KB）<br/>`dist/` CSS サイズ上限（KB） | `650` |
| `ACG_BUDGET_HTML_KB` | 入口页 HTML/XML/JSON(core) 预算门禁（KB）<br/>入口 HTML/XML/JSON(core) サイズ上限（KB） | `5000` |
| `ACG_BUDGET_DATA_GZ_KB` | `dist/data/*.json.gz` 预算门禁（KB）<br/>`dist/data/*.json.gz` サイズ上限（KB） | `4500` |
| `ACG_BUDGET_COVERS_MB` | `covers/` 预算门禁（MB）<br/>`covers/` サイズ上限（MB） | `160` |

</details>

---

## 隐私 / Privacy / プライバシー

- 所有偏好与收藏默认仅保存在本机浏览器（localStorage）。<br/>設定とブックマークは既定でローカル（localStorage）のみに保存されます。
- 站点仅聚合信息并跳转原站；详情页“全文预览”为实验能力，版权归原站。<br/>本サイトは情報を集約して元サイトへ遷移します。「全文プレビュー」は実験機能で、著作権は元サイトに帰属します。

---

## License

MIT

---

## 日本語

### デモ / クイックリンク

- Demo：https://tur1412.github.io/ACG/
- 中文：`/zh/` → https://tur1412.github.io/ACG/zh/
- 日本語：`/ja/` → https://tur1412.github.io/ACG/ja/
- ステータス：`/status/`
  - 中文：https://tur1412.github.io/ACG/zh/status/
  - 日本語：https://tur1412.github.io/ACG/ja/status/
- フィード：
  - RSS：`/zh/feed.xml` / `/ja/feed.xml`
  - JSON Feed：`/zh/feed.json` / `/ja/feed.json`
  - OPML：`/zh/opml.xml` / `/ja/opml.xml`

### 概要

ACG Radar は、GitHub Actions により **毎時更新**される ACG ニュースレーダーです。取得 → クリーニング → 静的ビルド → GitHub Pages へデプロイ、という構成で **常駐バックエンド不要**の運用を目指します。

### 可観測性（Telemetry）

- 既定は **ローカル記録のみ**（localStorage、送信しません）。
- 任意で送信：設定 → `Telemetry` → 「送信を許可」+ `http(s)` endpoint を設定すると、ページ離脱時に sendBeacon/fetch で送信を試みます。
- 管理：ローカル telemetry のエクスポート/クリアに対応（設定 → `Telemetry`）。
- Telemetry Viewer：ローカルイベント閲覧ページ `/zh/telemetry/` / `/ja/telemetry/`（localStorage のみ、送信しません）。
- 収集対象（軽量/段階的に無効化可能）：未捕捉エラー（`error`/`unhandledrejection`）+ Web Vitals（LCP/CLS）+ longtask（サンプリング）。
- プライバシー：スタックは短縮し、URL の query/hash を除去。通知は間引き/重複排除で低ノイズに保ちます。

### 便利な入口

- 検索：`/#search`
- 設定（ドロワー）：`/#prefs`
- Command Palette：`Ctrl/⌘ + K`（または `/#cmdk`）
- レイアウト/密度：トップ/カテゴリの chips で切替；または Command Palette で `layout`/`density` を検索；設定 → `表示`/`密度` でも設定可能

### コントリビューション

- PR/Issue などは `CONTRIBUTING.md` をご参照ください（行動規範は `CODE_OF_CONDUCT.md`）。

### 開発 / 同期

ローカル開発・定期同期・環境変数などは、上記の共通セクション（アーキテクチャ / ローカル開発 / データ同期 / 環境変数）をご参照ください。

