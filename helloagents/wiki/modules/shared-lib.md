# shared-lib

## 目的
沉淀跨脚本/站点共用的类型与工具，减少重复与耦合。

## 模块概述
- 职责：类型定义、格式化、URL 构建、来源配置、搜索查询/索引（search-pack）等跨端共享能力
- 状态：✅稳定
- 最后更新：2026-01-06

## 规范
### 需求: 单一事实来源（SSOT）
场景：来源列表既用于同步抓取，也用于 About/OPML 等页面；不应出现多份手工维护的来源信息。
- 预期结果：来源配置在 `src/lib/source-config.ts` 维护；脚本与页面均从此导入。

### 需求: 外链安全（http(s) 白名单）
场景：聚合站点会展示来自外部来源的 URL；若出现 `javascript:` 等协议，可能造成 XSS 风险。
- 预期结果：`src/lib/safe-url.ts` 提供 `safeExternalHttpUrl`，对外链做协议白名单；页面/组件在渲染外链前必须先通过该函数校验。

## 依赖
- `src/lib/*`
- `scripts/sources/index.ts`

