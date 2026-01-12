import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createLogger } from "./lib/logger";

type LhciManifestEntry = {
  url: string;
  htmlPath?: string;
  jsonPath?: string;
};

type LhciReportCategoryKey = "performance" | "accessibility" | "best-practices" | "seo";

type LhciReport = {
  requestedUrl?: string;
  finalUrl?: string;
  categories?: Partial<Record<LhciReportCategoryKey, { score?: number }>>;
};

function clampOneLine(text: string, maxLen: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, Math.max(0, maxLen - 1))}…`;
}

function formatScore(score: number | null): string {
  if (score == null || !Number.isFinite(score)) return "-";
  return `${Math.round(score * 100)}`;
}

function scoreEmoji(score: number | null): string {
  if (score == null || !Number.isFinite(score)) return "—";
  if (score >= 0.9) return "✅";
  if (score >= 0.8) return "⚠️";
  return "❌";
}

async function safeReadJson<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
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

function pickScore(report: LhciReport, key: LhciReportCategoryKey): number | null {
  const score = report.categories?.[key]?.score;
  return typeof score === "number" && Number.isFinite(score) ? score : null;
}

function renderMarkdown(rows: Array<{ url: string; perf: number | null; a11y: number | null; bp: number | null; seo: number | null; htmlPath: string | null }>): string {
  const lines: string[] = [];
  lines.push(`## Lighthouse CI Summary`);
  lines.push("");
  lines.push(`| URL | Perf | A11y | BP | SEO | Report |`);
  lines.push(`|---|---:|---:|---:|---:|---|`);
  for (const r of rows) {
    const report = r.htmlPath ? clampOneLine(r.htmlPath, 44) : "-";
    lines.push(
      `| ${clampOneLine(r.url, 72)} | ${scoreEmoji(r.perf)} ${formatScore(r.perf)} | ${scoreEmoji(r.a11y)} ${formatScore(r.a11y)} | ${scoreEmoji(r.bp)} ${formatScore(r.bp)} | ${scoreEmoji(r.seo)} ${formatScore(r.seo)} | ${report} |`
    );
  }
  lines.push("");
  lines.push(`> 注：分数为 Lighthouse categories 的 score×100（四舍五入）。阈值以 workflow/assertions 为准。`);
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const root = process.cwd();
  const manifestPath = resolve(root, ".lighthouseci", "manifest.json");

  const manifest = await safeReadJson<unknown>(manifestPath);
  if (!manifest || typeof manifest !== "object" || !Array.isArray((manifest as any).runs)) {
    await appendSummary(
      `## Lighthouse CI Summary\n\n- manifest not found or invalid: \`.lighthouseci/manifest.json\`\n`
    );
    return;
  }

  const runsRaw = (manifest as any).runs as unknown[];
  const entries: LhciManifestEntry[] = runsRaw
    .filter((x) => x && typeof x === "object")
    .map((x: any) => {
      return {
        url: typeof x.url === "string" ? x.url : "",
        htmlPath: typeof x.htmlPath === "string" ? x.htmlPath : undefined,
        jsonPath: typeof x.jsonPath === "string" ? x.jsonPath : undefined
      };
    })
    .filter((x) => x.url);

  if (!entries.length) {
    await appendSummary(`## Lighthouse CI Summary\n\n- no runs in manifest\n`);
    return;
  }

  const rows: Array<{ url: string; perf: number | null; a11y: number | null; bp: number | null; seo: number | null; htmlPath: string | null }> = [];

  for (const it of entries) {
    const jsonPath = it.jsonPath ? resolve(root, it.jsonPath) : null;
    const report = jsonPath ? await safeReadJson<LhciReport>(jsonPath) : null;
    const url = clampOneLine(report?.finalUrl ?? report?.requestedUrl ?? it.url, 160);

    rows.push({
      url,
      perf: report ? pickScore(report, "performance") : null,
      a11y: report ? pickScore(report, "accessibility") : null,
      bp: report ? pickScore(report, "best-practices") : null,
      seo: report ? pickScore(report, "seo") : null,
      htmlPath: it.htmlPath ? it.htmlPath : null
    });
  }

  await appendSummary(renderMarkdown(rows));
}

void main();
