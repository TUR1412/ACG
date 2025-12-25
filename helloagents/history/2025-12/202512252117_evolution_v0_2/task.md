# 任务清单: evolution_v0_2

目录: `helloagents/history/2025-12/202512252117_evolution_v0_2/`

## 1. shared-lib（来源 SSOT）
- [√] 1.1 新增 `src/lib/source-config.ts`，定义来源配置与可序列化 include 规则
- [√] 1.2 改造 `scripts/sources/index.ts` 从 SSOT 读取并生成脚本侧 SOURCES
- [√] 1.3 改造 About 页来源列表数据来源，避免站点侧依赖 scripts 实现细节

## 2. web-ui（订阅导出）
- [√] 2.1 新增 `src/pages/zh/opml.xml.ts` 与 `src/pages/ja/opml.xml.ts`
- [√] 2.2 新增 `src/pages/zh/feed.json.ts` 与 `src/pages/ja/feed.json.ts`
- [√] 2.3 更新 About/README，补充新导出入口

## 3. client-app（PWA）
- [√] 3.1 新增 `public/manifest.webmanifest`
- [√] 3.2 新增 `public/sw.js` 并在 layout/root 页面注册

## 4. pipeline-sync（CI 门禁）
- [√] 4.1 新增 `scripts/validate-generated-data.ts` 并接入 workflow
- [√] 4.2 新增 `scripts/perf-budget.ts` 并接入 workflow

## 5. 安全检查
- [√] 5.1 执行安全检查（输出编码/注入风险/缓存策略边界）

## 6. 文档更新
- [√] 6.1 更新 README.md（新增能力、端点、命令与CI说明）
- [√] 6.2 更新 `helloagents/CHANGELOG.md` 与 wiki 文档（同步架构与模块规范）

## 7. 测试
- [√] 7.1 运行 `npm run check`
- [√] 7.2 运行 `npm run build`（必要时先 `npm run sync`）
  > 备注: 已执行 `npm run sync`（关闭封面缓存与翻译以加速验证）、`npm run validate`、`npm run budget`。
