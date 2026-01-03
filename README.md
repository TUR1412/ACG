```text
   ___   _______   _______           ____            __
  / _ | / ___/ /  / ___/ /  ___ ____/ __ \\___ ____  / /__
 / __ |/ /__/ /__/ /__/ _ \\/ -_) __/ /_/ / _ `/ _ \\/  '_/
/_/ |_|\\___/____/\\___/_//_/\\__/_/  \\____/\\_,_/_//_/_/\\_\\
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

**快速入口 / Quick Links**

- 中文：`/zh/` → https://tur1412.github.io/ACG/zh/
- 日本語：`/ja/` → https://tur1412.github.io/ACG/ja/
- 状态页：`/status/` → https://tur1412.github.io/ACG/zh/status/（中文） / https://tur1412.github.io/ACG/ja/status/（日本語）
- RSS：`/zh/feed.xml`（中文） / `/ja/feed.xml`（日本語）
- JSON Feed：`/zh/feed.json`（中文） / `/ja/feed.json`（日本語）
- OPML：`/zh/opml.xml`（中文） / `/ja/opml.xml`（日本語）

---

## 为什么是“伪全栈 / 擬似フルスタック”？

- 不需要你本地 7×24 开机（GitHub Actions 定时跑）
- 不需要后端常驻服务 / 数据库
- 数据更新：每小时自动抓取并重新部署到 GitHub Pages
- 个性化状态：全部在浏览器本地（`localStorage`）

---

## 功能亮点（Features）

**快速扫一眼（TL;DR）**

- 🌐 双语 UI（`/zh/` / `/ja/`）
- ⏱️ GitHub Actions 每小时更新
- 🔎 站内搜索语法：`tag:` / `source:` / `cat:` / `before:` / `after:` / `is:` + `-` 反选
- ⌘ Command Palette：`Ctrl/⌘ + K`
- 📦 PWA：弱网/离线兜底

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
- **站内搜索**：标题/摘要/标签实时过滤（不会请求后端）；支持 `tag:` / `source:` / `cat:` / `before:` / `after:` / `is:` 等组合语法与 `-` 反选
- **命令面板（Command Palette）**：`Ctrl/⌘ + K` 快速导航/切换过滤/主题/语言；支持分组标题与关键词高亮，并可一键复制当前页链接
- **分享/外链**：详情页一键复制站内链接；页面注入 canonical + Open Graph/Twitter meta（更利于分享预览与 SEO）。
- **本地收藏/已读**：打开详情自动标记已读；收藏可导入/导出
- **关注/屏蔽**：关键词关注 + 屏蔽（支持“只看关注 / 隐藏已读”）
- **订阅流（关注源）**：星标关注来源 + “只看关注源”一键过滤
- **来源开关**：按来源启用/禁用（本地设置）
- **抓取状态页**：`/zh/status/`、`/ja/status/` 查看健康度与错误提示
- **移动端体验**：底部导航 + 搜索直达（更像 App）
- **订阅导出**：OPML 一键导入来源；JSON Feed 方便程序化消费
- **PWA / 离线兜底**：Manifest + Service Worker（弱网/离线时可回退到最近缓存页面）

---

## 架构（Architecture）

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
    Fulltext --> Translate[translate.googleapis.com\nclient=gtx]
  end
```

</details>

---

## 交互式文档入口（Interactive Docs）

> 说明：本项目是“静态站点 + 浏览器本地状态”，因此很多“文档”本身就是可交互的页面（可直接点开验证）。

- **在线 Demo**：https://tur1412.github.io/ACG/
- **语言入口**：`/zh/`（中文）· `/ja/`（日本語）
- **RSS**：`/zh/feed.xml`（中文）· `/ja/feed.xml`（日本語）
- **JSON Feed**：`/zh/feed.json`（中文）· `/ja/feed.json`（日本語）
- **OPML**：`/zh/opml.xml`（中文）· `/ja/opml.xml`（日本語）
- **状态页**：`/zh/status/` · `/ja/status/`（抓取健康度与错误提示）
- **命令面板（Command Palette）**：任意页面按 `Ctrl/⌘ + K`（分组标题 + 关键词高亮，快速导航/切换过滤/主题/语言）
- **快捷深链**：`/#search` 聚焦搜索；`/#prefs` 打开偏好设置抽屉（仅在首页/分类页有效）；`/#cmdk` 打开命令面板（任意页面）
- **设备调试面板**：任意页面加 `?debug=1`，或设置 `localStorage["acg.debug"]="1"`（用于排查“手机被渲染成桌面布局”等问题）
- **健康全景图（控制台）**：任意页面加 `?health=1`，或设置 `localStorage["acg.health"]="1"`（实时输出 FPS/LongTask/内存/请求状态等）
- **主题（暗黑模式）**：右上角“主题”可在 `自动/浅色/深色` 间切换；亦可在偏好面板中选择（持久化键：`localStorage["acg.theme.v1"]="auto|light|dark"`）
- **慢网体验**：请求期间顶部会出现一条细进度条（并在慢网时提示色更暖），用于降低“无响应”的心理落差

---

## 技术栈（Tech）

- Astro + Tailwind CSS（静态输出，首屏可见）
- 少量前端脚本：`src/client/app.ts`（收藏/已读/过滤/交互增强；全文预览为按需加载 chunk）
- 抓取脚本：`scripts/sync.ts`（RSS/Atom/RDF + HTML 示例）
- GitHub Actions + GitHub Pages 自动部署

---

## 性能（Performance）

- **首包 JS 更轻**：把“全文预览（抽取/清洗/渲染/翻译）”拆成 lazy chunk，只有在详情页存在全文区块时才会加载。
- **命令面板按需加载**：Command Palette（`Ctrl/⌘ + K`）为 lazy chunk，触发后才会下载与初始化。
- **查询解析去重**：页面内过滤与全站搜索 Worker 共享同一份查询解析逻辑，减少重复代码与行为差异。
- **依赖更干净**：移除未使用的 React/React DOM 与 Astro React 集成（本项目当前无 `.tsx/.jsx` 组件）。
- **数据更省流**：`npm run sync` 会生成 `public/data/posts.json.gz`（gzip），浏览器支持 `DecompressionStream` 时优先拉取压缩版本并自动回退到 `.json`。
- **超大列表可用**：收藏列表达到一定规模会自动启用“虚拟滚动”渲染（windowing），滚动仅渲染视口附近卡片，避免 DOM 爆炸。

---

## 数据来源（Sources）

默认来源在 `src/lib/source-config.ts`（单一事实来源，脚本与页面共用）。
来源配置支持可选字段 `lang`（`en|ja|zh|unknown`），用于同步预生成翻译时避免“同语种自翻译”。

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

5)（可选）运行质量门禁（数据校验 + 产物体积预算）

```bash
npm run validate
npm run budget
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
- `ACG_SOURCE_CONCURRENCY`：来源抓取并发数（默认 `3`，范围 `1..8`；用于降低整轮同步耗时与整点波动）
- `ACG_PARSE_DROP_MIN_PREV`：触发 `parse_drop` 回退所需的最小历史条目数（默认 `12`）
- `ACG_PARSE_DROP_MIN_KEEP`：本轮条目数小于该值时视为“异常缩水”（默认 `3`）
- `ACG_PARSE_DROP_RATIO`：本轮条目数小于 `previous * ratio` 时视为“异常缩水”（默认 `0.15`）

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

## 未来进化蓝图（Evolution Blueprint）

> 目标：在保持“静态站点 + Actions 定时同步”的低运维优势前提下，继续提升 **可用性 / 可观测性 / 数据质量 / 体验**。

### v0.2（已落地）：可靠性 + 可访问性 + 观测面板

- [x] **PWA + 离线兜底**：Manifest + Service Worker，弱网/离线可回退到最近缓存页面
- [x] **性能预算与自检**：Actions 中加入 dist 体积预算门禁（超标则阻断）
- **更强的状态诊断**：在 `/status/` 增加“常见错误修复建议”和“来源波动趋势”（基于历史状态聚合）
- **无障碍增强**：键盘导航、对比度、减少动态效果的系统级适配（更像商业级产品）

### v0.3（中程）：抓取系统模块化 + 数据质量闭环

- **来源适配器插件化**：统一接口（RSS/Atom/HTML），新增来源时“只写适配器，不改主流程”
- **变更探测与回归测试**：为关键 HTML 来源加入“结构变更检测”（选择器失效提前预警）
- **内容去重与聚合策略升级**：跨来源同一新闻自动聚合（相似度/规范化 URL/标题指纹）
- **多语言质量提升**：翻译字段按“热点优先/失败重试/质量门槛”生成，避免低质污染列表

### v1.0（远程）：本地优先的“资讯 App”形态

- **本地全文检索**：在浏览器内构建轻量索引（不依赖后端），支持标签/来源/时间/关键词组合查询
- **个性化推荐**：基于收藏/已读/关注词/来源偏好生成“你的雷达”（完全本地，不上传隐私）
- **主题系统**：深色模式 + 多主题皮肤 + 字号/排版自定义（统一设计令牌）
- [x] **更开放的订阅接口**：已提供 JSON Feed / OPML 导出；后续可补充更多订阅格式与分组策略

---

## License

MIT
