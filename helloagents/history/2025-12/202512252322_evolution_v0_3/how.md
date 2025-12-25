# 技术设计: evolution_v0_3（视觉系统重构 + 交互逻辑进化 + 功能矩阵补强）

## 技术方案

### 核心技术
- Astro（静态站点）+ Tailwind CSS + 全局 CSS 令牌
- View Transitions（跨文档转场）+ Web Animations API（不支持时降级）
- 本地优先埋点：localStorage 队列 + 可选 sendBeacon/fetch 上报

### 实现要点
- **视觉系统令牌化**
  - 在 `src/styles/global.css` 中定义栅格/排版/阴影/边框等 CSS 变量（令牌）
  - 在 `tailwind.config.ts` 中将关键令牌映射为 Tailwind utilities（`gap-grid`、`px-gutter`、`shadow-e1..e12`、`text-phi-*` 等）
- **玻璃拟态升级**
  - `glass` / `glass-card` 统一使用“多背景层”实现渐变边框（padding-box + border-box）
  - 动态渐变边框动画仅在 hover 时启用，并遵循 prefers-reduced-motion
  - 封面占位的 CategoryIcon path 增加 `stroke-dashoffset` 绘制动画，封面加载后自动停表
- **页面转场**
  - CSS：为 `acg-main` / `acg-header` 定义 `::view-transition-*` 动画
  - JS：对不支持 View Transitions 的浏览器，使用 WAAPI 对页面进入/离开做淡入淡出，并拦截同源导航
- **多级筛选引擎**
  - 对列表卡片建立索引（标题/摘要/标签/来源/分类/发布时间）
  - 解析输入语法：`tag:` / `source:` / `cat:` / `before:` / `after:` / `is:`，并支持 `-` 反选
  - 与现有关注词/屏蔽词/已读过滤/来源开关联动，最终输出 hide/show
- **埋点与可观测**
  - `src/client/utils/telemetry.ts` 记录关键交互（page_view、search、bookmark_toggle、tag_filter、cover_retry、quick_toggle）
  - 默认不上传；仅当用户配置 `acg.telemetry.upload.v1=true` 且设置 endpoint 时尝试上报
- **网络请求稳健性**
  - 在 `httpFetch` 的退避重试中加入 jitter，降低同步重试导致的拥塞风险

## 安全与性能
- **安全:** 埋点默认不上传；上报时使用 `credentials: omit`，避免携带敏感 cookie
- **性能:** 动态边框动画只在 hover 启动；列表卡片继续避免 backdrop-filter；筛选索引惰性初始化，避免首屏阻塞

## 测试与部署
- `npm run check`：类型检查
- `npm run build`：构建验证（确保 Tailwind class 与 Astro 编译无误）

