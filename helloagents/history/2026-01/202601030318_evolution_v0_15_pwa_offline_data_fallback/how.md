# how（方案）

## A. Service Worker 数据兜底更安全

- 引入 `dataRequestKind()` 将 data 请求按 `posts/status/search-pack` 分类，并区分是否为 `.json.gz`。
- 无缓存且网络失败时：
  - 对 `*.json.gz` 返回 `504`，让调用方自然回退到 `.json`（避免返回“伪 gzip”导致解压失败）。
  - 对 `posts.json` 返回 `[]`。
  - 对 `status.json` 返回 `{ generatedAt:null, durationMs:0, sources:[] }`。
  - 对 `search-pack.v1.json` 返回 `{ v:1, generatedAt:null, posts:[], index:[] }`。

## B. 离线页可读性增强

- 离线页增加：
  - “尝试读取最近缓存的数据更新时间”提示（通过 fetch `data/status.json`）。
  - 直达 `/zh/status/` 与 `/ja/status/` 的入口，便于离线排查。

## C. 轻量网络状态提示

- 在客户端增加 online/offline 事件监听，通过 Toast 给出一次轻提示（带节流，避免刷屏）。

