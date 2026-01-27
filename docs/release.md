# 发布流程 / リリース手順

> 目标：让版本发布可重复、可追溯、低摩擦（适用于 `0.6.x` 的持续发布）。

---

## 1) 前置条件 / 事前条件

- Node.js：`>= 20`（建议 `nvm use`，仓库提供 `.nvmrc`）
- 工作区干净：`git status` 无未提交变更
- 关键质量门禁本地可通过：
  - `npm run lint`
  - `npm run format:check`
  - `npm run check`
  - `npm run test:coverage`
  - `npm run build`
  - `npm run budget`

> 备注：同步产物（`src/data/generated/*`、`public/data/*`、`public/covers/*`）不提交到仓库，发布不依赖它们在 Git 中的存在。

---

## 2) 更新版本号 / バージョン更新

1. 在 `package.json` 更新 `version`
2. 在 `helloagents/CHANGELOG.md` 将本次变更从 `[Unreleased]` 归档到新版本段落：
   - 版本号：与 `package.json` 保持一致
   - 日期：使用 `YYYY-MM-DD`（UTC 或本地时间均可，但保持一致）

建议：遵循语义化版本（SemVer）

- `patch`：修复 / 小改动，不改变外部行为
- `minor`：新增能力（保持兼容）
- `major`：不兼容变更或重大重构

---

## 3) 发布前验证 / リリース前検証

```bash
npm ci
npm run lint
npm run format:check
npm run check
npm run test:coverage
npm run build
npm run budget
```

可选（用于人工验证同步链路是否健康）：

- `npm run sync:dry`
- `npm run sync` + `npm run validate`

---

## 4) 提交与打 Tag / コミット & タグ

1. 提交变更（建议 Conventional Commits）：

```bash
git add package.json helloagents/CHANGELOG.md
git commit -m "chore(release): vX.Y.Z"
```

2. 创建 tag：

```bash
git tag vX.Y.Z
```

3. 推送 commit 与 tag：

```bash
git push
git push --tags
```

---

## 5) GitHub Release（可选） / GitHub リリース（任意）

- 在 GitHub Releases 创建 `vX.Y.Z`
- 发布说明优先复用 `helloagents/CHANGELOG.md` 对应版本段落
