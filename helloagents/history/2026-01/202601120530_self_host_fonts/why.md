# Why: 自托管字体（移除 Google Fonts 依赖）

## 背景
当前站点在 `src/layouts/SiteLayout.astro` 中通过 Google Fonts 加载 `Outfit` 与 `Space Grotesk`。

该方案在体验与审计上存在天然短板：
- **性能**：第三方字体请求会增加关键渲染路径的网络开销，Lighthouse 往往会提示“第三方资源影响性能/隐私”。
- **稳定性**：部分网络环境（尤其是国内）对 Google Fonts 访问不稳定，容易出现字体闪烁或长期回退到 fallback，影响一致性。
- **离线/PWA**：字体资源属于关键视觉一致性的一部分，自托管更利于离线缓存与可控性。

## 目标
- 在不改变核心架构与 UI 风格基调的前提下，将关键 UI 字体改为 **自托管**：
  - 仍使用 `Outfit`（display）
  - 仍使用 `Space Grotesk`（sans）
- 移除对 `fonts.googleapis.com` / `fonts.gstatic.com` 的依赖，提升性能、稳定性与可预期性。

## 成功标准
- 构建产物不再包含对 Google Fonts 的外链请求。
- 页面仍能正常渲染，并保持既有排版与视觉风格。
- 本地 `npm test` / `npm run check` / `npm run build` / `npm run budget` 通过。

