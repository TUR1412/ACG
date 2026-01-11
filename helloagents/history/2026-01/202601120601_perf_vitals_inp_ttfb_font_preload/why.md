# Why: perf_vitals 补齐（TTFB/INP）+ 字体 Preload

## 背景
- 项目已具备本地优先 Telemetry 与基础 Web Vitals 观测（LCP/CLS + longtask 抽样），并已将字体切换为自托管（移除 Google Fonts 外链），为性能与稳定性提供了良好基线。

## 问题
- 首屏字体虽然已自托管，但缺少显式 `preload`，在部分网络/缓存场景下可能仍出现首屏字体晚到导致的 LCP/渲染节奏波动。
- `perf_vitals` 目前覆盖 LCP/CLS/longtask，但缺少行业更常用的交互指标 INP 与网络侧基线 TTFB，导致排障与体验回溯颗粒度不足。

## 目标
- 在不破坏现有核心架构与业务逻辑根基的前提下，以增量方式：
  - 通过字体 `preload` 提升首屏渲染稳定性与可预期性。
  - 为 `perf_vitals` 增量补齐 `TTFB` 与 `INP` 指标（低性能模式自动降级/关闭），增强可观测性而不牺牲体验。

