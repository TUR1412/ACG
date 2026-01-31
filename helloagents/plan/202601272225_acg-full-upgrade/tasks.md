# 任务清单: acg-full-upgrade

目录: `helloagents/plan/202601272225_acg-full-upgrade/`

---

## 任务状态符号说明

| 符号  | 状态      | 说明     |
| ----- | --------- | -------- |
| `[ ]` | pending   | 待执行   |
| `[√]` | completed | 已完成   |
| `[X]` | failed    | 执行失败 |
| `[-]` | skipped   | 已跳过   |
| `[?]` | uncertain | 待确认   |

---

## 执行状态

```yaml
总任务: 22
已完成: 22
完成率: 100%
```

---

## 任务列表

### 1. 范围与基线（P0）

- [√] 1.1 固化升级目标与版本策略（默认：`0.6.x` 稳定化 → `1.0` 里程碑）
  - 文件: `helloagents/plan/202601272225_acg-full-upgrade/proposal.md`
  - 验证: 目标/约束/验收标准完整且可执行

- [√] 1.2 记录“升级前基线”（用于后续不回退对比）
  - 产物: `helloagents/plan/202601272225_acg-full-upgrade/baseline.md`
  - 验证: 记录包含（至少）版本号、CI/LHCI/Budget/coverage 当前结果与关键截图/摘要

- [√] 1.3 明确本次升级的“非目标”（避免范围漂移）
  - 文件: `helloagents/plan/202601272225_acg-full-upgrade/proposal.md`
  - 验证: 非目标条目明确（例如：不引入常驻后端/不做登录/不引入默认付费服务）

### 2. 客户端模块化（P0）

- [√] 2.1 将 `src/client/app.ts` 按职责拆分为多个模块（入口保持不变）
  - 目标: 降低单文件复杂度；启动流程更可读；关键逻辑可单测
  - 验证: `npm run lint`、`npm run check`、`npm run test:coverage`

- [√] 2.2 将 `src/client/features/fulltext.ts` 拆分为 `src/client/features/fulltext/*`（薄入口保留）
  - 目标: fetch/parse/render/cache 分层；策略可替换；低性能降级路径可测
  - 验证: `npm test` 覆盖关键纯函数；全文预览在 `/zh/p/*` `/ja/p/*` 可用且失败可降级

- [√] 2.3 将 `src/client/features/cmdk.ts` 做模块化拆分（保持交互与快捷键行为一致）
  - 验证: `npm run test:coverage` 覆盖命令解析/路由/深链关键分支

- [√] 2.4 收敛客户端状态与存储的边界：禁止在业务逻辑中直接散写 localStorage
  - 文件: `src/client/state/storage.ts`、`src/client/constants.ts`（必要时新增辅助模块）
  - 验证: 新增/重构后的读写都通过统一封装；异常不阻断交互

- [√] 2.5 加固 telemetry/monitoring 的隐私与稳定性（结构化事件、去重/节流、导出/清空一致）
  - 文件: `src/client/utils/telemetry.ts`、`src/client/utils/monitoring.ts`、`src/pages/*/telemetry.astro`
  - 验证: 默认本地；开启上报后失败不影响页面；事件不包含 query/hash/token

- [√] 2.6 补齐客户端相关单测并确保覆盖率门禁可持续
  - 文件: `tests/index.test.ts`（必要时拆分到 `tests/*`）
  - 验证: `npm run test:coverage` 继续通过（阈值不降低）

### 3. 同步管线模块化（P0/P1）

- [√] 3.1 将 `scripts/sync.ts` 拆分为 `scripts/pipeline/*`（阶段化：fetch/parse/normalize/dedup/enrich/output）
  - 目标: 各阶段输入输出类型清晰；可单测；可复用；便于定位故障
  - 验证: `npm run sync:dry` 与 `npm run sync` 行为一致（差异仅体现在写盘）

- [√] 3.2 统一 env 变量解析与默认值（集中到 `scripts/lib/env.ts`）
  - 目标: 减少分散的 parseNonNegativeInt；避免“不同地方默认值不一致”
  - 验证: 单测覆盖边界值；CI/Actions 环境下行为一致

- [√] 3.3 翻译能力做 Provider 抽象（默认保持 `gtx`，支持显式关闭与未来扩展）
  - 文件: `scripts/lib/translate.ts`（及新增 `scripts/lib/translate/*`）
  - 验证: `ACG_TRANSLATE_MAX_POSTS=0` 时不触发；失败返回原文且有 debug 日志

- [√] 3.4 抓取缓存与补图缓存策略再梳理（降低 IO 与重复请求，增强 TTL/上限语义）
  - 文件: `scripts/lib/http-cache.ts`
  - 验证: 触发 304/重试/退避/TTL 的行为可测且在 status 中可观测

- [√] 3.5 来源配置校验与可维护性增强（唯一性/URL 合法性/正则 include 可编译）
  - 文件: `src/lib/source-config.ts`、`scripts/sources/index.ts`、`tests/index.test.ts`
  - 验证: 错误配置会在 CI 直接失败；include 失效会降级并给出可诊断日志

- [√] 3.6 `npm run validate` 增强：补齐生成数据不变量校验（结构/排序/去重/字段约束）
  - 文件: `scripts/validate-generated-data.ts`
  - 验证: 在“干净 checkout + 最小 sync”场景下稳定通过

### 4. CI/CD 与运行保障（P1）

- [√] 4.1 CI/Actions 的 Node 版本策略对齐（以 `package.json#engines.node` 为准）
  - 文件: `.github/workflows/*.yml`
  - 验证: CI 与定时部署使用同一 Node 主版本；本地开发指引同步更新

- [√] 4.2 调整 CI 的同步校验策略（确保“最小主链路验证”稳定且可重复）
  - 文件: `.github/workflows/ci.yml`
  - 验证: 外部依赖（翻译/封面补全）默认关闭仍可覆盖主链路；失败可定位

- [√] 4.3 依赖与供应链检查策略明确化（不以“噪音”阻塞 PR，但可持续发现风险）
  - 文件: `.github/dependabot.yml`（必要时新增 workflow）
  - 验证: 依赖更新节奏清晰；高风险漏洞可被发现并跟踪

- [√] 4.4 Lighthouse 与 Perf Budget 口径整理（避免口径漂移导致误报）
  - 文件: `.lighthouserc*.json`、`scripts/perf-budget.ts`
  - 验证: provided/simulate 两套口径对“稳定性/回归”各自有效

### 5. 文档与发布（P2）

- [√] 5.1 文档同步：根据重构后的真实结构更新 `helloagents/wiki/*`
  - 文件: `helloagents/wiki/arch.md`、`helloagents/wiki/data.md`、`helloagents/wiki/modules/*`
  - 验证: 文档与代码一致（以代码为准）；新增/移动模块有明确说明

- [√] 5.2 更新对外文档（README/CONTRIBUTING）：新增来源/本地开发/排障入口更清晰
  - 文件: `README.md`、`CONTRIBUTING.md`
  - 验证: 新贡献者可按文档在 15 分钟内跑通 `dev + sync + build + test`

- [√] 5.3 发布流程落地：版本号、changelog、tag/release 的最小闭环
  - 文件: `helloagents/CHANGELOG.md`（必要时新增 `docs/release.md`）
  - 验证: 0.6.x 的发布步骤可重复；变更记录可追溯（对应方案包/决策）

---

## 执行备注

> 执行过程中的重要记录

| 任务 | 状态      | 备注                                                                                                                                                         |
| ---- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.1  | completed | 已在 `proposal.md` 固化目标与版本策略（0.6.x → 1.0）                                                                                                         |
| 1.2  | completed | 已生成 `baseline.md`（含 lint/check/test/build/budget 基线结果）                                                                                             |
| 1.3  | completed | 已在 `proposal.md` 补充“非目标（本次不做）”章节                                                                                                              |
| 2.1  | completed | 已拆分 `theme/accent/radiogroup` 模块，`app.ts` 入口保持不变                                                                                                 |
| 2.2  | completed | 已拆分 `fulltext`（markdown/translate/cache/idle/net/wire），worker 引用改为直达子模块                                                                       |
| 2.3  | completed | 已将 `cmdk` 拆分为 `src/client/features/cmdk/*`（薄入口保留），并补齐 query/presets 单测确保覆盖率门禁可持续                                                 |
| 2.4  | completed | `src/client` 业务代码不再直接访问 `localStorage`，统一通过 `state/storage.ts` 封装                                                                           |
| 2.5  | completed | telemetry 增加 data 清洗（去 query/hash + 敏感键 redaction）与去重/节流，减少隐私与噪音风险                                                                  |
| 2.6  | completed | 补齐客户端/脚本关键路径单测并维持覆盖率门禁（`test:coverage` 阈值不降低）                                                                                    |
| 3.2  | completed | 新增 `scripts/lib/env.ts` 并重构 `scripts/sync.ts` 统一读取 env                                                                                              |
| 3.1  | completed | `scripts/sync.ts` 拆分为 `scripts/pipeline/*`（sources/posts/covers/translate/status-history），并通过 `lint/check/test:coverage/build/budget/sync:dry` 验证 |
| 3.3  | completed | `scripts/lib/translate` 增加 provider 抽象（默认 `gtx`，支持 `ACG_TRANSLATE_PROVIDER=off` 显式关闭），并新增单测覆盖                                         |
| 3.4  | completed | cover/translate 阶段的 cache 写盘改为“统一落盘”，减少重复 IO 与同步耗时波动                                                                                  |
| 3.5  | completed | 增强 `SOURCE_CONFIGS` 校验（homepage/http + include 正则可编译）                                                                                             |
| 3.6  | completed | `validate-generated-data` 增加 URL 去重与 `id=sha1(url)` 一致性校验，提前阻断数据异常                                                                        |
| 4.1  | completed | 新增 `.nvmrc` 并让 workflows 使用 `node-version-file` 对齐 Node 主版本；README/贡献指南同步更新                                                              |
| 4.2  | completed | CI 内默认关闭翻译与封面耗时步骤（保留主链路验证），确保可重复与更稳定的门禁                                                                                  |
| 4.3  | completed | 新增 `Dependency Audit` workflow（不阻塞 PR，定期输出 prod deps 的 `npm audit` 摘要与 artifact）                                                             |
| 4.4  | completed | LHCI provided/simulate 双口径与 perf-budget 指标拆分已固化，减少跑分漂移导致的误报                                                                           |
| 5.1  | completed | `helloagents/wiki/*` 同步更新：pipeline/caching/env/release 等文档与代码保持一致                                                                             |
| 5.2  | completed | README/贡献指南补齐 `sync/validate` 与“最小同步”排障口径（含 Bash/PowerShell 示例）                                                                          |
| 5.3  | completed | 新增 `docs/release.md`，形成版本号/变更记录/tag/release 的最小闭环                                                                                           |
