# Why: Lighthouse CI Step Summary（跑分摘要）

## 背景
仓库已引入 Lighthouse CI（PR/手动触发）作为性能/SEO/A11y 回归门禁，并上传 `lhci_reports/` 报告构件。

但在实际协作中仍有一个“可读性缺口”：
- 想快速知道 PR 是否“明显变差/明显变好”，需要下载 artifact 打开报告。
- 在 Actions 页面中缺少“一眼可读”的分数/URL 列表，不利于快速 review 与定位。

## 目标
- 为 Lighthouse workflow 增加 Job Summary（`GITHUB_STEP_SUMMARY`），直接在 Actions UI 中展示：
  - 各 URL 的 Performance / A11y / Best Practices / SEO 分数（以及是否低于阈值）。
  - 关键链接（报告文件名/相对路径，便于下载 artifact 后定位）。
- 保持现有核心架构与门禁逻辑不变，仅做增量扩展。

## 成功标准
- Lighthouse workflow 中新增 Summary 输出步骤，即使断言失败也尽量输出已收集到的结果摘要。
- 本地 `npm test` / `npm run check` / `npm run build` / `npm run budget` 通过。

