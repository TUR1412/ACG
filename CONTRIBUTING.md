# 贡献指南 / コントリビューションガイド

感谢你对 **ACG Radar / ACGレーダー** 的兴趣与贡献！
このプロジェクトへのご協力ありがとうございます。

---

## 1. 提交前先确认 / 事前確認

- 本项目核心架构为：**抓取 → 静态构建 → GitHub Pages 部署**（无后端常驻）。
  - 本質は「定期取得 → 静的生成 → Pages 配信」です（常駐バックエンドなし）。
- 请尽量遵循“**小步、可回滚、可验证**”的变更方式。
  - 「小さく・戻せる・検証できる」変更が望ましいです。

---

## 2. 本地开发 / ローカル開発

### 环境要求 / 必要環境

- Node.js `>= 20`
- npm（随 Node 安装即可 / Node 付属でOK）

### 常用命令 / よく使うコマンド

```bash
npm ci

# 开发预览 / dev
npm run dev

# 代码规范 / lint
npm run lint

# 格式化 / format
npm run format
npm run format:check

# 构建 / build
npm run build

# 类型与构建检查 / check
npm run check

# 单元测试 / tests
npm test

# 覆盖率 / coverage（可选）
npm run test:coverage

# Git hooks（可选） / Git フック（任意）
#
# 本项目启用了 Husky（Git hooks）。安装依赖后会自动启用 `pre-commit`：对暂存文件执行 lint-staged + `npm test`。
# このプロジェクトは Husky（Git hooks）を有効化しています。依存インストール後に `pre-commit` が自動で有効化され、staged ファイルに lint-staged + `npm test` を実行します。
#
# 如需临时跳过：`HUSKY=0 git commit ...`
# 一時的に無効化したい場合：`HUSKY=0 git commit ...`

# 体积预算 / perf budget
npm run budget
```

---

## 3. 同步管线说明 / 同期パイプライン

- 正式同步由 GitHub Actions **按小时**执行（仓库 workflow）。
  - 本番の同期は GitHub Actions が「毎時」実行します。
- 本地调试可用：
  - ローカル検証：

```bash
# 仅演练（不落盘）/ dry-run
npm run sync:dry

# 实际同步（会生成 data 输出）/ sync
npm run sync
```

---

## 4. 提交 PR / PR の出し方

1. 新建分支（建议）/ ブランチ作成（推奨）
2. 保持改动聚焦（一次 PR 解决一个主题）/ 1PR=1テーマ
3. 跑完最基本的验证 / 最低限の検証
   - `npm run lint`
   - `npm run format:check`
   - `npm test`（或 `npm run test:coverage`）
   - `npm run check`
   - `npm run build`
4. 按 PR 模板填写说明 / PR テンプレートに従って記載

### 提交信息（Commit message）/ コミットメッセージ

- 建议使用 Conventional Commits（例如：`feat(ui): ...`、`fix(sync): ...`、`chore(release): vX.Y.Z`）。  
  Conventional Commits（例：`feat(ui): ...`、`fix(sync): ...`、`chore(release): vX.Y.Z`）を推奨します。
- 本项目启用了 commitlint（Husky `commit-msg` hook），会在本地提交时校验格式。  
  このプロジェクトは commitlint（Husky `commit-msg` hook）を有効化しており、ローカルでコミット時に形式を検証します。
- 如需临时跳过：`HUSKY=0 git commit ...`  
  一時的に無効化したい場合：`HUSKY=0 git commit ...`

---

## 5. 文案与双语 / 表示と言語

站点对外呈现同时包含中文与日本語两套页面。
ユーザー向け表示は中国語・日本語の両方があります。

- 若新增用户可见文案，请同步补齐两种语言（对应 `zh`/`ja`）。
  - ユーザー向け文言を追加する場合、`zh`/`ja` 両方の対応をお願いします。

---

## 6. 行为准则 / 行動規範

参与本项目即表示同意遵守 `CODE_OF_CONDUCT.md`。
参加者は `CODE_OF_CONDUCT.md` を遵守してください。
