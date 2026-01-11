# How: 实施方案

## 1) 解析 LHCI 产物
- 新增脚本 `scripts/lhci-step-summary.ts`：
  - 读取 `.lighthouseci/manifest.json`（LHCI collect 的标准产物）。
  - 对每个 `manifest` 条目读取对应的 JSON report（提取 categories 分数）。
  - 生成 Markdown 表格并写入 `GITHUB_STEP_SUMMARY`（若环境变量不存在则输出到 stdout）。
  - 文件缺失/解析失败时保守降级为“无法生成摘要”的提示，不影响 workflow 主要流程。

## 2) 集成到 workflow
- 在 `.github/workflows/lighthouse.yml` 中，在 LHCI 运行后追加 Summary step（`if: always()`）。
- 保持现有 artifact 上传不变。

## 3) 文档与版本
- 版本号 SemVer Patch 升级；更新 `helloagents/CHANGELOG.md` 与 `helloagents/history/index.md`；迁移方案包至 `history/`。

