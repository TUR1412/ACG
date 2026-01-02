# how（方案）

## A. 来源语言标注 + 翻译策略升级

- 在 `src/lib/source-config.ts` 为来源配置新增可选字段 `lang`（`en|ja|zh|unknown`）。
- scripts 侧（`scripts/sources/*` 与 `scripts/sync.ts`）透传 `lang`，同步翻译阶段按来源语言做保守决策：
  - `lang === "zh"`：跳过中文翻译（避免中文自翻译）。
  - `lang === "ja"`：跳过日文翻译（避免日文自翻译）。
  - `unknown`：保留原策略（并继续使用 “kana 识别” 作为额外保护）。
  - 若目标字段已存在（例如 `titleZh` 已有值），则跳过重翻译，减少请求量与波动。

## B. 抓取“异常缩水”回退（parse_drop）

- 在 `scripts/sync.ts/runSource` 中新增保守兜底：
  - 当 `previous.length` 足够大且 `posts.length` 明显小于阈值时，回退 `previous`，并将 `status.ok=false`、`status.used="fallback"`、`status.error="parse_drop"`。
  - 阈值支持环境变量覆盖，默认更偏保守：
    - `ACG_PARSE_DROP_MIN_PREV`（默认 12）
    - `ACG_PARSE_DROP_MIN_KEEP`（默认 3）
    - `ACG_PARSE_DROP_RATIO`（默认 0.15）

## C. 状态页汇总增强

- 在 `src/pages/zh/status.astro` 与 `src/pages/ja/status.astro`：
  - 汇总展示：全局新增数（sum `newItemCount`）、疑似停更数量（`latestPublishedAt` 距 `generatedAt` ≥ 72h）、连续失败≥3 的来源数量。
  - 建议文案补充：对 `parse_empty/parse_drop` 给出更明确的排查建议。

