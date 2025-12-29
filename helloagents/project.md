# 项目技术约定

## 技术栈
- 核心：Astro（静态站点）+ TypeScript
- 样式：Tailwind CSS + 自定义全局 CSS（玻璃拟态/主题变量）
- 客户端：命令面板（`src/client/features/cmdk.ts`，`Ctrl/⌘ + K` 触发懒加载）+ 全站搜索 Worker（查询解析共享）
- 同步：Node.js 脚本（`scripts/sync.ts`）在 GitHub Actions 定时执行
- 部署：GitHub Pages（Actions 产物上传并发布）

## 开发约定
- 代码风格：优先保持现有风格；修改以“可读性 + 可维护性 + 可验证”为目标。
- 命名约定：TypeScript 使用 camelCase；常量使用 UPPER_SNAKE_CASE。
- 目录约定：
  - `src/`：站点源码（页面/组件/客户端逻辑/共享库）
  - `scripts/`：同步与抓取管线（仅在 CI/本地执行，不下发到浏览器）
  - `public/`：静态资源（会原样进入站点根目录）

## 错误与日志
- 同步脚本：以 `console.log` 输出关键路径结果；失败以 `process.exitCode=1` 终止。
- 站点运行时：客户端错误尽量降级（不影响列表浏览），必要时以 Toast 提示用户。

## 隐私与埋点
- 默认：仅在本地记录事件队列（`localStorage`），不做任何上传。
- 可选上报：仅当用户显式配置并开启上传时才尝试上报：
  - `acg.telemetry.upload.v1=true`
  - `acg.telemetry.endpoint.v1=https://<your-endpoint>`

## 测试与流程
- 类型检查：`npm run check`（Astro Check + TS）
- 构建：`npm run build`
- 数据同步：`npm run sync`
- 质量门禁：
  - `npm run validate`：校验生成数据的结构与关键不变量
  - `npm run budget`：校验 `dist/` 产物体积预算

