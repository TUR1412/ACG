# 任务清单: GitHub 文档体系 + 布局/密度快捷控制增强

目录: `helloagents/plan/202601112339_github_md_and_layout_cmdk/`

---

## 1. GitHub 文档与模板（repo-meta）
- [√] 1.1 新增 GitHub Issue Forms（Bug / Feature）与模板配置，验证 why.md#需求-github-协作入口标准化-场景-用户提交-bug
- [√] 1.2 新增 PR 模板与贡献/安全/支持文档（双语），验证 why.md#需求-github-协作入口标准化-场景-贡献者提交-pr

## 2. Web UI 快捷入口（web-ui）
- [√] 2.1 在 `src/pages/zh/index.astro` 与 `src/pages/ja/index.astro` 新增布局/密度 chips（`data-view-mode` / `data-density-mode`），验证 why.md#需求-布局密度的就地可达快捷控制-场景-首页快速切换扫读浏览节奏
- [√] 2.2 在 `src/pages/zh/c/[category].astro` 与 `src/pages/ja/c/[category].astro` 新增布局/密度 chips，验证 why.md#需求-布局密度的就地可达快捷控制-场景-分类页快速切换并保持搜索体验
- [√] 2.3 补齐 `src/components/Icon.astro` 的 Grid/List 图标以提升一致性（必要时为密度增加图标）

## 3. 命令面板增强（client-app）
- [√] 3.1 在 `src/client/features/cmdk.ts` 增加布局/密度切换命令（含降级提示），验证 why.md#需求-命令面板覆盖布局密度切换-场景-通过命令面板切换布局

## 4. 安全检查
- [√] 4.1 执行安全检查（按G9：敏感信息、权限变更、外部依赖变更审视），确保不引入密钥与高风险操作

## 5. 文档/知识库同步
- [√] 5.1 更新 `README.md`（如需）与 `helloagents/wiki/*` 模块文档，反映新增快捷入口与 GitHub 协作规范
- [√] 5.2 更新 `helloagents/CHANGELOG.md`（新增版本条目）

## 6. 测试
- [√] 6.1 运行 `npm test`
- [√] 6.2 运行 `npm run check`
- [√] 6.3 运行 `npm run build`
- [√] 6.4 运行 `npm run budget`
