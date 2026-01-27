# Baseline: acg-full-upgrade

> 本文件用于记录“升级前/升级初期”的工程基线，便于后续对比回归与验收。

- 日期: 2026-01-27
- 仓库: https://github.com/TUR1412/ACG.git
- 分支: main
- 提交: 5abd6ef5f81e75464b42f77301ce090602d13c6c
- Node: v22.14.0（项目声明: >=20）
- npm: 10.9.2

---

## 1) 质量门禁（本地运行）

- `npm run lint`: ✅
- `npm run format:check`: ✅
- `npm run check`（Astro check）: ✅（0 errors / 0 warnings / 0 hints）
- `npm run test:coverage`: ✅
  - Statements: 89.46%
  - Branches: 61.16%
  - Functions: 92.21%
  - Lines: 89.46%
- `npm run build`（ACG_BASE=/ACG）: ✅（20 pages built）
- `npm run budget`: ✅
  - dist: 1.3MB（50 files）
  - js: 210KB（limit 450KB）
  - css: 96KB（limit 650KB）
  - html/xml/json(core): 757KB（limit 5000KB）
  - data.gz: 0KB（limit 4500KB）
  - covers: 0MB（limit 160MB）

---

## 2) 项目规模（快速统计）

- 总文件数: 139
- 源码文件数: 70
- 源码行数: 19,439
- 总行数（含 assets/config 等）: 43,128
- 模块目录（src/\*）: 8
  - assets / client / components / i18n / layouts / lib / pages / styles
- 依赖数量（npm）: 24（4 deps + 20 devDeps）

### 主要“超大文件”风险点（后续优先拆分）

- `src/client/app.ts`: ~4904 lines
- `src/client/features/fulltext.ts`: ~3513 lines
- `scripts/sync.ts`: ~1206 lines
- `tests/index.test.ts`: ~1280 lines

---

## 3) 当前工作区状态

- `git status`:
  - `helloagents/plan/` 为本次升级新增的方案包目录（未提交）

---

## 4) 备注

- Lighthouse CI / Pages 定时同步的真实表现以 GitHub Actions 运行结果为准；本地基线主要用于保障结构性重构不破坏现有门禁与构建行为。
