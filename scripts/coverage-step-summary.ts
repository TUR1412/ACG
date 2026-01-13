import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createLogger } from "./lib/logger";

type IstanbulMetric = {
  total: number;
  covered: number;
  skipped: number;
  pct: number;
};

type IstanbulSummary = {
  total: {
    lines: IstanbulMetric;
    statements: IstanbulMetric;
    functions: IstanbulMetric;
    branches: IstanbulMetric;
  };
};

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function normalizeMetric(raw: unknown): IstanbulMetric | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as any;

  const total = asNumber(obj.total);
  const covered = asNumber(obj.covered);
  const skipped = asNumber(obj.skipped);
  const pct = asNumber(obj.pct);
  if (total == null || covered == null || skipped == null || pct == null) return null;

  return { total, covered, skipped, pct };
}

function normalizeSummary(raw: unknown): IstanbulSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as any;
  const total = obj.total;
  if (!total || typeof total !== "object") return null;

  const lines = normalizeMetric(total.lines);
  const statements = normalizeMetric(total.statements);
  const functions = normalizeMetric(total.functions);
  const branches = normalizeMetric(total.branches);
  if (!lines || !statements || !functions || !branches) return null;

  return { total: { lines, statements, functions, branches } };
}

function formatPct(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "-";
  return `${pct.toFixed(2)}%`;
}

function formatRatio(metric: IstanbulMetric | null): string {
  if (!metric) return "-";
  return `${metric.covered}/${metric.total}`;
}

function emojiByThreshold(pct: number | null, minPct: number): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  return pct >= minPct ? "✅" : "❌";
}

function renderMarkdown(summary: IstanbulSummary): string {
  // Keep these in sync with `npm run test:coverage` thresholds.
  const THRESH = {
    statements: 35,
    branches: 50,
    functions: 35,
    lines: 35
  } as const;

  const rows: Array<{ key: keyof typeof summary.total; label: string; min: number }> = [
    { key: "lines", label: "Lines", min: THRESH.lines },
    { key: "statements", label: "Statements", min: THRESH.statements },
    { key: "functions", label: "Functions", min: THRESH.functions },
    { key: "branches", label: "Branches", min: THRESH.branches }
  ];

  const lines: string[] = [];
  lines.push(`## Test Coverage`);
  lines.push("");
  lines.push(`| Metric | % | Covered | Min | |`);
  lines.push(`|---|---:|---:|---:|---:|`);

  for (const r of rows) {
    const m = summary.total[r.key];
    lines.push(
      `| ${r.label} | ${formatPct(m.pct)} | ${formatRatio(m)} | ${r.min.toFixed(0)}% | ${emojiByThreshold(
        m.pct,
        r.min
      )} |`
    );
  }

  lines.push("");
  lines.push(
    `> 注：阈值来自 \`npm run test:coverage\`（c8 \`--check-coverage\`）。覆盖率会在 CI 上传为 artifact。`
  );
  lines.push("");
  return lines.join("\n");
}

async function appendSummary(markdown: string): Promise<void> {
  const file = process.env.GITHUB_STEP_SUMMARY;
  const log = createLogger();
  if (!file) {
    log.info(markdown);
    return;
  }

  try {
    const prev = await readFile(file, "utf-8").catch(() => "");
    const next = prev ? `${prev.trimEnd()}\n\n${markdown}\n` : `${markdown}\n`;
    await writeFile(file, next, "utf-8");
  } catch {
    log.info(markdown);
  }
}

async function safeReadJson(path: string): Promise<unknown | null> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

async function main() {
  const root = process.cwd();
  const summaryPath = resolve(root, "coverage", "coverage-summary.json");

  const raw = await safeReadJson(summaryPath);
  const normalized = normalizeSummary(raw);
  if (!normalized) {
    await appendSummary(
      `## Test Coverage\n\n- coverage-summary.json not found or invalid. Run \`npm run test:coverage\` first.\n`
    );
    return;
  }

  await appendSummary(renderMarkdown(normalized));
}

void main();
