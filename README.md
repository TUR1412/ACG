<p align="center">
  <img src="docs/readme-banner.svg?raw=1" alt="ACG Radar / ACGレーダー" />
</p>

# ACG Radar / ACGレーダー

> **每小时更新**的 ACG 资讯雷达：抓取 → 静态构建 → GitHub Pages 部署。  
> **毎時更新**の ACG ニュースレーダー：取得 → 静的ビルド → GitHub Pages へデプロイ。

[![Hourly Sync & Deploy (GitHub Pages)](https://github.com/TUR1412/ACG/actions/workflows/hourly-sync-and-deploy.yml/badge.svg)](https://github.com/TUR1412/ACG/actions/workflows/hourly-sync-and-deploy.yml)
![MIT](https://img.shields.io/badge/License-MIT-black)

**在线预览 / Demo**

- https://tur1412.github.io/ACG/

**快速入口 / Quick Links**

- 中文：`/zh/` → https://tur1412.github.io/ACG/zh/
- 日本語：`/ja/` → https://tur1412.github.io/ACG/ja/
- 状态页：`/status/` → https://tur1412.github.io/ACG/zh/status/（中文） / https://tur1412.github.io/ACG/ja/status/（日本語）
- RSS：`/zh/feed.xml`（中文） / `/ja/feed.xml`（日本語）

---

## 为什么是“伪全栈 / 擬似フルスタック”？

- 不需要你本地 7×24 开机（GitHub Actions 定时跑）
- 不需要后端常驻服务 / 数据库
- 数据更新：每小时自动抓取并重新部署到 GitHub Pages
- 个性化状态：全部在浏览器本地（`localStorage`）

---

## 功能亮点（Features）

- **中日双语 / 日中バイリンガル**：`/zh/`、`/ja/` 路由隔离
- **全局语言转换（标题/摘要）**：按所选语言自动翻译（中文用户不再被日文/英文“卡住”）
- **每小时更新**：GitHub Actions `cron` 自动抓取 + 部署
- **封面轮播（Spotlight）**：键盘 ←/→、拖拽、点阵指示（更“杂志封面墙”）
- **新鲜度标记**：近 6 小时内容会显示 `NEW/新着`（更容易扫到“刚更新”）
- **图片缺失治理**：RSS 不带图时自动抓取文章页补全 `og:image` / `twitter:image`
- **内容预览增强**：摘要缺失/过短时，从文章页抽取 `og:description` / `description` 等生成预览（严格截断）
- **全文预览（实验）**：详情页自动加载全文（第三方阅读模式实时解析）并翻译到当前语言，可切换原文/翻译
- **缺图观感优化**：封面占位会先出现，图片真正加载后再淡出（慢网也不显空）
- **封面失败自愈**：升级 https / 代理兜底（Weserv）/ 调整 referrer / cache bust
- **站内搜索**：标题/摘要/标签实时过滤（不会请求后端）
- **本地收藏/已读**：打开详情自动标记已读；收藏可导入/导出
- **关注/屏蔽**：关键词关注 + 屏蔽（支持“只看关注 / 隐藏已读”）
- **订阅流（关注源）**：星标关注来源 + “只看关注源”一键过滤
- **来源开关**：按来源启用/禁用（本地设置）
- **抓取状态页**：`/zh/status/`、`/ja/status/` 查看健康度与错误提示
- **移动端体验**：底部导航 + 搜索直达（更像 App）

---

## 架构（Architecture）

<p align="center">
  <img src="docs/architecture.svg?raw=1" alt="ACG Radar Architecture" />
</p>

---

## 技术栈（Tech）

- Astro + Tailwind CSS（静态输出，首屏可见）
- 少量前端脚本：`src/client/app.ts`（收藏/已读/过滤/交互增强；全文预览为按需加载 chunk）
- 抓取脚本：`scripts/sync.ts`（RSS/Atom/RDF + HTML 示例）
- GitHub Actions + GitHub Pages 自动部署

---

## 性能（Performance）

- **首包 JS 更轻**：把“全文预览（抽取/清洗/渲染/翻译）”拆成 lazy chunk，只有在详情页存在全文区块时才会加载。
- **依赖更干净**：移除未使用的 React/React DOM 与 Astro React 集成（本项目当前无 `.tsx/.jsx` 组件）。

---

## 数据来源（Sources）

默认来源在 `scripts/sources/index.ts`。

本站聚合 **标题 / 摘要 / 时间 / 来源链接** 并导流至原文。  
详情页的「全文预览（实验）」为**实时解析/翻译**，不在仓库内持久化存储全文；版权归原站/原作者。  
若你是来源方希望移除或调整展示方式，请提 Issue。

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

## 封面本地缓存（解决“加载不出来”）

即使补全了封面链接，仍可能遇到：热链限制（403）、混合内容（http 图片在 https 页被拦截）、偶发网络抖动等。
为减少“图片加载不出来”的概率，`npm run sync` 会对**最新一段内容**执行“封面本地化”：

- 下载缩略图到 `public/covers/`（构建时会进入 GitHub Pages 的 `dist/`）
- 将 `posts.json` 的 `cover` 替换为 `/covers/<id>.<ext>`（更稳定）
- 同时保留 `coverOriginal`，用于失败重试与回退

> 说明：`public/covers/` 已加入 `.gitignore`，不会提交到仓库，但会随 Pages 部署产物一起发布。

## 封面加载策略（运行时兜底）

即使补全了封面链接，仍可能遇到：混合内容（http 图片在 https 页被拦截）、热链限制、偶发网络抖动等。
本项目的策略是 **“不默认强制走代理，但失败就兜底”**：

- `http://` 封面：会自动使用 https 图片代理包装（避免浏览器直接拦截）
- 失败自动重试：升级 https → 代理兜底（Weserv）→ referrer 放宽 → cache bust
- 手动重试：封面失败时提供“重试”按钮

> 注：Weserv 为第三方公共图片代理服务，仅在必要时触发；若你更偏好“完全不依赖第三方”，可以把失败兜底逻辑改成只做 https 升级与 cache bust。

可用环境变量控制（本地默认值）：

- `ACG_COVER_ENRICH_MAX`：每次同步最多补全多少条封面（默认 `320`，设为 `0` 可关闭）
- `ACG_COVER_ENRICH_PER_SOURCE_MAX`：每次同步每个来源最多补全多少条（默认 `200`）
- `ACG_COVER_ENRICH_DELAY_MS`：补全时每次请求前的延迟（毫秒，默认 `0`）
- `ACG_COVER_ENRICH_MISS_TTL_HOURS`：对“确实解析不到封面”的文章页，暂时跳过多久再重试（小时，默认 `72`；设为 `0` 可关闭跳过）

- `ACG_COVER_CACHE_MAX`：本地缓存封面数量（默认 `260`，设为 `0` 关闭）
- `ACG_COVER_CACHE_WIDTH`：本地缓存封面宽度（默认 `960`）
- `ACG_COVER_CACHE_CONCURRENCY`：并发下载数（默认 `6`）

- `ACG_PREVIEW_MIN_LEN`：摘要少于多少字符时尝试补齐预览（默认 `90`）
- `ACG_PREVIEW_MAX_LEN`：预览最大长度（默认 `420`）
- `ACG_PREVIEW_MISS_TTL_HOURS`：对“确实解析不到预览”的文章页，暂时跳过多久再重试（默认 `24`）

- `ACG_TRANSLATE_MAX_POSTS`：每次同步最多对多少条“最新内容”生成中/日翻译字段（默认 `220`）
- `ACG_TRANSLATE_TIMEOUT_MS`：翻译请求超时（毫秒，默认 `18000`）

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

- [x] 来源徽章（更强“杂志感”）
- [x] 详情页“同类推荐 / 新旧导航”
- [x] 封面失败提示与手动重试（重试按钮 + 自动重试）
- [x] 轻量“新鲜度”标记（刚更新的内容更醒目）
- [x] 关注源订阅过滤（星标关注来源 / 只看关注源）
- [x] 来源分组与“关注源”视图（更像 App 的订阅流）

---

## License

MIT
