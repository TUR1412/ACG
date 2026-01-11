# 任务清单: perf_vitals 补齐（TTFB/INP）+ 字体 Preload

目录: `helloagents/plan/202601120601_perf_vitals_inp_ttfb_font_preload/`

---

## 1. 性能（首屏）
- [√] 1.1 `SiteLayout` 增加字体 `preload`（Outfit/Space Grotesk latin 子集）

## 2. 可观测性（性能埋点）
- [√] 2.1 `perf_vitals` 增量采集 `ttfbMs`
- [√] 2.2 `perf_vitals` 增量采集 `inpMs`（非低性能模式；可降级）

## 3. 知识库与版本
- [√] 3.1 版本号升级（SemVer Patch）
- [√] 3.2 更新 `helloagents/CHANGELOG.md`
- [√] 3.3 更新 `helloagents/wiki/modules/client-app.md`
- [√] 3.4 更新 `helloagents/history/index.md` 并迁移方案包至 `history/`

## 4. 自测
- [√] 4.1 `npm test`
- [√] 4.2 `npm run check`
- [√] 4.3 `npm run build`
- [√] 4.4 `npm run budget`
