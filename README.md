# ACG Radar / ACGレーダー

> **每小时更新**的 ACG 资讯雷达：抓取 → 静态构建 → GitHub Pages 部署。  
> **毎時更新**の ACG ニュースレーダー：取得 → 静的ビルド → GitHub Pages へデプロイ。

[![Hourly Sync & Deploy (GitHub Pages)](https://github.com/TUR1412/ACG/actions/workflows/hourly-sync-and-deploy.yml/badge.svg)](https://github.com/TUR1412/ACG/actions/workflows/hourly-sync-and-deploy.yml)
![MIT](https://img.shields.io/badge/License-MIT-black)

**在线预览 / Demo**

- `https://tur1412.github.io/ACG/`

---

## 为什么是“伪全栈 / 擬似フルスタック”？

- 不需要你本地 7×24 开机（GitHub Actions 定时跑）
- 不需要后端常驻服务 / 数据库
- 数据更新：每小时自动抓取并重新部署到 GitHub Pages
- 个性化状态：全部在浏览器本地（`localStorage`）

---

## 功能亮点（Features）

- **中日双语 / 日中バイリンガル**：`/zh/`、`/ja/` 路由隔离
- **每小时更新**：GitHub Actions `cron` 自动抓取 + 部署
- **封面轮播（Spotlight）**：键盘 ←/→、拖拽、点阵指示（更“杂志封面墙”）
- **图片缺失治理**：RSS 不带图时自动抓取文章页补全 `og:image` / `twitter:image`
- **封面失败自愈**：封面加载失败会自动重试（升级 https / 调整 referrer / cache bust）
- **站内搜索**：标题/摘要/标签实时过滤（不会请求后端）
- **本地收藏/已读**：打开详情自动标记已读；收藏可导入/导出
- **关注/屏蔽**：关键词关注 + 屏蔽（支持“只看关注 / 隐藏已读”）
- **来源开关**：按来源启用/禁用（本地设置）
- **抓取状态页**：`/zh/status/`、`/ja/status/` 查看健康度与错误提示
- **移动端体验**：底部导航 + 搜索直达（更像 App）

---

## 架构（Architecture）

```mermaid
flowchart TD
  A[GitHub Actions (cron 每小时)] --> B[Node 同步脚本 scripts/sync.ts]
  B --> C[生成 posts.json + status.json]
  C --> D[Astro Build 静态站点]
  D --> E[GitHub Pages 部署]
  E --> F[浏览器访问]
  F --> G[localStorage: 收藏/已读/过滤/来源开关]
```

---

## 技术栈（Tech）

- Astro + Tailwind CSS（静态输出，首屏可见）
- 少量前端脚本：`src/client/app.ts`（收藏/已读/过滤/交互增强）
- 抓取脚本：`scripts/sync.ts`（RSS/Atom/RDF + HTML 示例）
- GitHub Actions + GitHub Pages 自动部署

---

## 数据来源（Sources）

默认来源在 `scripts/sources/index.ts`。

本站仅聚合 **标题 / 摘要 / 时间 / 来源链接** 并导流至原文，不转载全文。  
若你是来源方希望移除，请提 Issue。

---

## 本地开发（Local Development）

> 注意：`npm run dev` 是常驻开发服务（需要你自己手动运行），仓库不会在后台偷偷启动任何服务。

1) 安装依赖

```bash
npm install
```

2) 抓取一次数据（生成到 `src/data/generated/` 与 `public/data/`，默认会被 `.gitignore` 忽略）

```bash
npm run sync
```

3) 启动开发服务器（仅本机）

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

---

## 封面补全（解决“缺图”）

部分来源的 RSS/Atom 本身不提供图片。为让页面更“杂志化”，同步脚本会额外抓取**少量文章页**，读取 `og:image` / `twitter:image` / JSON-LD 等来补全封面（有上限，避免过度请求）。

可用环境变量控制（本地默认值）：

- `ACG_COVER_ENRICH_MAX`：每次同步最多补全多少条封面（默认 `320`，设为 `0` 可关闭）
- `ACG_COVER_ENRICH_PER_SOURCE_MAX`：每次同步每个来源最多补全多少条（默认 `200`）
- `ACG_COVER_ENRICH_DELAY_MS`：补全时每次请求前的延迟（毫秒，默认 `0`）
- `ACG_COVER_ENRICH_MISS_TTL_HOURS`：对“确实解析不到封面”的文章页，暂时跳过多久再重试（小时，默认 `72`；设为 `0` 可关闭跳过）

> GitHub Actions 工作流可能会覆盖这些默认值：见 `.github/workflows/hourly-sync-and-deploy.yml`。

---

## GitHub Pages 部署（Deploy）

工作流：`.github/workflows/hourly-sync-and-deploy.yml`

- `push main` 会部署一次
- `schedule` 每小时整点（UTC）自动同步并部署一次

### Base Path（很重要）

GitHub Pages 项目站点的 base path 通常是 `/<repo>`。本仓库名为 `ACG`，所以 workflow 里设置了：

- `ACG_BASE=/ACG`

如果你 fork 后改了仓库名，请同步修改：

- `.github/workflows/hourly-sync-and-deploy.yml` 中的 `ACG_BASE`
- （可选）`astro.config.mjs` 里的 `site`（用于 SEO/绝对链接）

### 历史数据（不提交也能滚动累计）

`scripts/sync.ts` 默认会尝试从上一次部署的 `data/posts.json` 拉取历史数据并合并，这样可以避免“每小时自动提交刷屏”。

如果你的 Pages 地址不同，可设置：

- `ACG_REMOTE_POSTS_URL=https://<user>.github.io/<repo>/data/posts.json`

---

## Roadmap（路线图）

- [ ] 来源徽章（更强“杂志感”）
- [ ] 详情页“同类推荐”
- [ ] 更细粒度的封面失败提示与手动重试
- [ ] 轻量“新鲜度”标记（刚更新的内容更醒目）

---

## License

MIT
