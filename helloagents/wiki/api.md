# API 手册

本项目为纯静态站点，不提供传统后端 API。对外“接口”以静态路由与订阅导出为主。

## 订阅导出

### RSS
- GET `/zh/feed.xml`
- GET `/ja/feed.xml`

### JSON Feed
- GET `/zh/feed.json`
- GET `/ja/feed.json`

### OPML
- GET `/zh/opml.xml`
- GET `/ja/opml.xml`

## 站点数据文件（部署产物）

这些文件由 `npm run sync` 生成并写入 `public/`，会随静态站点一起部署，但不会提交到仓库：
- `/data/posts.json` 与 `/data/posts.json.gz`
- `/data/status.json` 与 `/data/status.json.gz`

