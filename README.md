# ACG Radar（中日双语 / 日中バイリンガル）

一个“伪全栈”的二次元资讯聚合小站：**每小时自动抓取** → 生成静态页面 → 部署到 **GitHub Pages**。  
UI 支持 **中文 / 日本語**，并提供本地收藏、已读标记、站内搜索与抓取状态页。

> 设计目标：**不需要你本地 7×24 开机**，也不需要数据库或后端常驻服务；依靠 GitHub Actions 定时更新即可。

---

## 功能（Features）

- **每小时更新**：GitHub Actions `cron` 定时抓取并重新部署
- **分类聚合**：动画 / 游戏联动 / 周边手办 / 声优活动
- **站内搜索**：在列表页直接过滤（标题/摘要/标签）
- **本地收藏**：使用 `localStorage`，无需登录
- **收藏导入/导出**：JSON 文件导入导出，方便迁移浏览器
- **已读标记**：打开详情页自动标记已读
- **关注/屏蔽**：关注关键词 + 屏蔽关键词（可选“只看关注”“隐藏已读”）
- **来源开关**：可按来源启用/禁用（本地设置）
- **未读计数**：列表会显示未读数量（配合“隐藏已读”更好用）
- **今日快报复制**：一键复制首页快报文本（适合发群）
- **抓取状态页**：查看各来源健康度（成功/失败、耗时、条目数）
- **关于页**：说明机制 + 来源列表（便于维护）

---

## 技术栈（Tech）

- Astro + Tailwind CSS（静态输出，首屏可见）
- 少量前端脚本（`src/client/app.ts`）负责收藏/已读/搜索增强
- Node 抓取脚本（`scripts/sync.ts`）
- GitHub Actions + GitHub Pages 自动部署

---

## 数据来源（Sources）

默认内置来源在 `scripts/sources/index.ts`（包含 RSS/Atom/RDF + 1 个 HTML 抓取示例）。

本站仅聚合**标题/摘要/时间/来源链接**并导流至原文，不转载全文。若你是来源方希望移除，请在仓库提 Issue。

---

## 本地开发（Local Development）

> 注意：`npm run dev` 是常驻开发服务（你自己手动运行即可），仓库默认不会在后台偷偷启动任何服务。

1) 安装依赖

```bash
npm install
```

2) 抓取一次数据（生成到 `src/data/generated/` 与 `public/data/`，文件会被 `.gitignore` 忽略）

```bash
npm run sync
```

3) 启动开发服务器

```bash
npm run dev
```

4) 构建静态站点

```bash
npm run build
```

---

## 抓取脚本参数（Sync Options）

```bash
npm run sync -- --days 30 --limit 2000 --verbose
```

- `--days`：保留最近 N 天
- `--limit`：最多保留 N 条
- `--dry-run`：只跑抓取/解析，不写文件
- `--verbose`：输出更多日志

### 封面补全（解决“缺图”）

部分来源的 RSS/Atom 本身不提供图片（例如 ANN / Inside Games / 音楽ナタリー），为了让页面观感更“杂志化”，同步脚本会**额外抓取少量文章页**，读取 `og:image` / `twitter:image` 来补全封面（有上限，避免过度请求）。

可用环境变量控制：

- `ACG_COVER_ENRICH_MAX`：每次同步最多补全多少条封面（默认 `48`，设为 `0` 可关闭）
- `ACG_COVER_ENRICH_PER_SOURCE_MAX`：每次同步每个来源最多补全多少条（默认 `48`）

---

## GitHub Pages 部署（Deploy）

工作流：`.github/workflows/hourly-sync-and-deploy.yml`

- `push main` 时会部署一次
- `schedule` 每小时整点（UTC）自动同步并部署一次

### Base Path（很重要）

GitHub Pages 项目站点的 base path 通常是 `/<repo>`。本仓库名为 `ACG`，所以 workflow 里设置了：

- `ACG_BASE=/ACG`

如果你 fork 后改了仓库名，请同步修改：
- `.github/workflows/hourly-sync-and-deploy.yml`
- （可选）`astro.config.mjs` 里 `site`，用于 SEO/绝对链接

### 历史数据（不提交也能滚动累计）

`scripts/sync.ts` 默认会尝试从上一次部署的 `data/posts.json` 拉取历史数据并合并，这样可以避免“每小时自动提交刷屏”。

如果你的 Pages 地址不同，可设置：

- `ACG_REMOTE_POSTS_URL=https://<user>.github.io/<repo>/data/posts.json`

---

## 日本語（簡易）

これは「擬似フルスタック」ACGニュースサイトです。  
GitHub Actions が毎時データを取得し、静的ページを再生成して GitHub Pages にデプロイします。

- ブックマーク / 既読：`localStorage`
- 検索：ページ内フィルタ
- ステータス：`/ja/status/`

---

## License

MIT
