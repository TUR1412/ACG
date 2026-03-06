# 任务清单: sentinel-console-ui-rebuild

```yaml
@feature: sentinel-console-ui-rebuild
@created: 2026-03-06
@status: completed
@mode: R3
```

<!-- LIVE_STATUS_BEGIN -->

WORKFLOW_MODE: INTERACTIVE | ROUTING_LEVEL: R3 | CURRENT_STAGE: DEVELOP | STAGE_ENTRY_MODE: NATURAL | DELEGATION_INTERRUPTED: false | TASK_COMPLEXITY: complex | KB_SKIPPED: false | CREATED_PACKAGE: helloagents/archive/2026-03/202603061556_sentinel-console-ui-rebuild | CURRENT_PACKAGE: helloagents/archive/2026-03/202603061556_sentinel-console-ui-rebuild
当前: 哨兵信号台 UI 重构已完成并归档

<!-- LIVE_STATUS_END -->

## 进度概览

| 完成 | 失败 | 跳过 | 总数 |
| ---- | ---- | ---- | ---- |
| 10   | 0    | 0    | 10   |

---

## 任务列表

### 1. 全局壳层与设计系统

- [√] 1.1 重构 `src/layouts/SiteLayout.astro`，建立哨兵信号台的全局舞台、导航、内容与辅助控制层
- [√] 1.2 重构 `src/styles/global.css`，建立统一的控制台视觉 tokens、表面材质、辉光、阴影与动效系统
  - 依赖: 1.1

### 2. 首页与共享区块

- [√] 2.1 重构 `src/pages/zh/index.astro`，将首页升级为主控制台与优先信号视图
  - 依赖: 1.1, 1.2
- [√] 2.2 同步重构 `src/pages/ja/index.astro`，保持与中文首页一致的结构与风格协议
  - 依赖: 2.1

### 3. 核心视觉组件

- [√] 3.1 重构 `src/components/organisms/PostCard.astro`、`src/components/organisms/SpotlightGrid.astro` 与相关共享块，统一信号卡片与聚光内容语义
  - 依赖: 1.2
- [√] 3.2 重构 `src/components/organisms/SignalBoard.astro`、`src/components/organisms/PreferencesPanel.astro`，升级为控制台情报板与氛围控制中心
  - 依赖: 1.2

### 4. 列表、详情与关于页

- [√] 4.1 重构 `src/pages/zh/c/[category].astro`、`src/pages/ja/c/[category].astro`、`src/pages/zh/p/[id].astro`、`src/pages/ja/p/[id].astro`，统一档案浏览与档案解码阅读体验
  - 依赖: 1.1, 1.2, 3.1, 3.2
- [√] 4.2 重构 `src/pages/zh/about.astro` 与 `src/pages/ja/about.astro`，将关于页升级为站点任务说明书
  - 依赖: 1.1, 1.2

### 5. 验证与知识同步

- [√] 5.1 运行构建与必要检查，修正因 UI 重构引入的问题，确保静态站可构建交付
  - 依赖: 2.2, 4.1, 4.2
- [√] 5.2 同步更新 `helloagents` 文档与变更记录，归档本次 UI 重构信息
  - 依赖: 5.1

---

## 执行日志

| 时间                | 任务     | 状态      | 备注                                                            |
| ------------------- | -------- | --------- | --------------------------------------------------------------- |
| 2026-03-06 15:56:00 | 方案选型 | completed | 已确认采用「哨兵信号台 Sentinel Console」方向                   |
| 2026-03-06 16:24:00 | 5.1      | completed | `npm run check`、`npm run build`、`npm run lint` 通过           |
| 2026-03-06 16:26:00 | 5.2      | completed | 已同步 `helloagents/wiki/arch.md` 与 `helloagents/CHANGELOG.md` |

---

## 执行备注

> 本次任务为高强度 UI 重构，允许对布局、组件、样式系统做显著改造；但需保留 Astro + GitHub Pages、双语路由结构与现有核心交互入口。
>
> 已完成内容：
>
> - `SiteLayout` 升级为 Sentinel Console 壳层
> - 首页 / 分类页 / 详情页 / 关于页收敛为共享 Console 视图
> - 新增 `src/styles/sentinel-console.css` 作为控制台视觉系统层
> - 核心展示组件接入统一控制台语义类
