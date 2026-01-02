# 任务清单: evolution_v0_9_fulltext_perf_pipeline

目录: `helloagents/plan/202601021014_evolution_v0_9_fulltext_perf_pipeline/`

---

## 1. 全文预览（client-app）
- [√] 1.1 在 `src/client/features/fulltext.ts` 中引入性能感知策略：低性能/滚动期默认不自动触发自动翻译，验证 why.md#需求-全文预览更顺滑-场景-滚动中不抢主线程
- [√] 1.2 在 `src/client/features/fulltext.ts` 中将重型 DOM 后处理延后到 idle，并对低性能模式做阈值限制，验证 why.md#需求-全文预览更顺滑-场景-移动端打开详情页
- [√] 1.3 在 `src/client/features/fulltext.ts` 中为渲染/后处理引入“防抖/令牌”机制，避免快速切换（原文/翻译/重试）导致重复渲染与卡顿

## 2. 同步管线（pipeline-sync）
- [√] 2.1 在 `scripts/sources/*` 增加 HTML 解析器注册表，并在 `scripts/sync.ts` 移除按 source.id 的硬编码特判（改为统一解析入口）
- [√] 2.2 在 `scripts/lib/http-cache.ts` 增强 `normalizeUrl`：剥离常见追踪参数（utm_*/fbclid/gclid/igshid 等），提升去重与数据质量
- [√] 2.3 在 `scripts/lib/http-cache.ts` 为抓取请求增加保守重试 + jitter 退避（仅对可重试失败生效，次数受控）

## 3. 文档与知识库同步
- [√] 3.1 更新 `helloagents/wiki/modules/client-app.md`（全文预览性能策略/自动翻译策略/降级原则）
- [√] 3.2 更新 `helloagents/wiki/modules/pipeline-sync.md`（HTML 解析注册表、URL 规范化、重试策略）
- [√] 3.3 更新 `helloagents/wiki/arch.md`（新增 ADR 索引）
- [√] 3.4 更新 `helloagents/CHANGELOG.md`，并按需更新 `package.json` 版本号

## 4. 质量验证
- [√] 4.1 运行 `npm run check`（Astro/TS 类型检查）
- [√] 4.2 运行 `npm run build`（静态构建）
- [√] 4.3 运行 `npm run sync`（最小化参数）后执行 `npm run validate`（生成数据结构校验）
- [√] 4.4 运行 `npm run budget`（dist 体积预算门禁）
