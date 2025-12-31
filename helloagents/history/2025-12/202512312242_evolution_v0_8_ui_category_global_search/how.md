# how · evolution_v0_8_ui_category_global_search

## 方案概述
采用“**减少静态渲染 + 提供一键进入全站模式**”的组合策略：

1) **分类页默认仅静态渲染最新 60 条**（从 120 下调）
- 静态渲染依旧保留“可见即所得”的首屏体验与可分享性；
- 体积明显下降（尤其是 anime 类页面）。

2) **在分类页快捷筛选 Chip 区新增“全站·本分类”按钮**
- 通过 `data-search-preset="cat:<category>"` 声明预置查询；
- 复用 `wireGlobalSearch()` 内部能力：点击后自动切换到全站搜索（worker + 虚拟列表）并立刻执行预置搜索。

3) **增加无障碍 Skip Link + 主内容锚点**
- `SiteLayout.astro` 在 `<body>` 开头插入 Skip Link；
- `<main>` 增加 `id="main"` 与 `tabindex="-1"`，保证跳转后可聚焦；
- `global.css` 增加 `.acg-skip-link` 的可见性与动效（遵循 `prefers-reduced-motion`）。

## 关键实现点
- **预置搜索触发**：在 `wireGlobalSearch()` 中监听 `[data-search-preset]` 点击事件，调用其内部 `setEnabled(true)` 并写入 `input.value`，再触发一次 `input` 事件以调度搜索。
- **文案与多语言**：Skip Link 文案与分类页提示走 `src/i18n/i18n.ts`，保证中日一致体验。
- **保持回退路径**：若用户不使用预置按钮，仍可手动切换“全站”并输入 `cat:` 过滤；本页搜索（page scope）行为不变。

## 影响范围
- web-ui：`SiteLayout.astro`（结构与 meta 不变，仅增加 skip link 与 main anchor）、分类页 Astro 页面（渲染条目数与提示）。
- client-app：`app.ts`（仅在 `wireGlobalSearch` 内增加预置入口事件；不改变搜索引擎与 worker 协议）。
- docs：同步 `helloagents/wiki/modules/web-ui.md`、`helloagents/wiki/modules/client-app.md` 与 `helloagents/CHANGELOG.md`。

## 风险与规避
- 风险：预置按钮在非首页/分类页上出现但缺少搜索框会失效。
  - 规避：事件处理以 `#acg-search` 与 `.acg-post-grid` 是否存在作为前置条件；不存在则直接返回。
- 风险：自动切换到全站时首次加载数据可能造成短暂等待。
  - 规避：沿用现有 skeleton 与 toast 提示；并保持 page scope 默认行为不变。

