import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type SourceStatus = {
  id: string;
  name: string;
  kind: string;
  ok: boolean;
  durationMs: number;
  itemCount: number;
  newItemCount?: number;
  visibleItemCount?: number;
  httpStatus?: number;
  attempts?: number;
  waitMs?: number;
  consecutiveFails?: number;
  used?: "fetched" | "cached" | "fallback";
  error?: string;
};

type SyncStatus = {
  generatedAt: string | null;
  durationMs: number;
  sources: SourceStatus[];
};

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function clampOneLine(text: string, maxLen: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, Math.max(0, maxLen - 1))}…`;
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "-";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

async function safeReadJsonFile<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeSyncStatus(raw: unknown): SyncStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as any;

  const generatedAt = asString(obj.generatedAt);
  const durationMs = asNumber(obj.durationMs);
  const sourcesRaw = obj.sources;

  if (durationMs == null || !Array.isArray(sourcesRaw)) return null;

  const sources: SourceStatus[] = sourcesRaw
    .filter((x: unknown) => x && typeof x === "object")
    .map((x: any) => {
      return {
        id: asString(x.id) ?? "",
        name: asString(x.name) ?? "",
        kind: asString(x.kind) ?? "",
        ok: Boolean(x.ok),
        durationMs: asNumber(x.durationMs) ?? 0,
        itemCount: asNumber(x.itemCount) ?? 0,
        newItemCount: asNumber(x.newItemCount) ?? undefined,
        visibleItemCount: asNumber(x.visibleItemCount) ?? undefined,
        httpStatus: asNumber(x.httpStatus) ?? undefined,
        attempts: asNumber(x.attempts) ?? undefined,
        waitMs: asNumber(x.waitMs) ?? undefined,
        consecutiveFails: asNumber(x.consecutiveFails) ?? undefined,
        used: x.used === "fetched" || x.used === "cached" || x.used === "fallback" ? x.used : undefined,
        error: asString(x.error) ?? undefined
      };
    });

  return { generatedAt, durationMs, sources };
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

function renderMarkdown(status: SyncStatus, postsCount: number | null): string {
  const totalSources = status.sources.length;
  const okSources = status.sources.filter((s) => s.ok).length;
  const errSources = totalSources - okSources;

  const totalItems = sum(status.sources.map((s) => (Number.isFinite(s.itemCount) ? s.itemCount : 0)));
  const totalNewItems = sum(status.sources.map((s) => (Number.isFinite(s.newItemCount) ? (s.newItemCount ?? 0) : 0)));
  const totalVisibleItems = sum(
    status.sources.map((s) => (Number.isFinite(s.visibleItemCount) ? (s.visibleItemCount ?? 0) : 0))
  );

  const fetched = status.sources.filter((s) => s.used === "fetched").length;
  const cached = status.sources.filter((s) => s.used === "cached").length;
  const fallback = status.sources.filter((s) => s.used === "fallback").length;

  const flaky = status.sources
    .filter((s) => !s.ok && typeof s.consecutiveFails === "number" && s.consecutiveFails >= 3)
    .sort((a, b) => (b.consecutiveFails ?? 0) - (a.consecutiveFails ?? 0))
    .slice(0, 12);

  const failed = status.sources.filter((s) => !s.ok).slice(0, 18);

  const slowest = status.sources
    .slice()
    .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
    .slice(0, 8);

  const lines: string[] = [];

  lines.push(`## ACG Sync Summary`);
  lines.push("");
  lines.push(`- generatedAt: ${status.generatedAt ?? "-"}`);
  lines.push(`- duration: ${formatMs(status.durationMs)}`);
  lines.push(`- posts (pruned): ${postsCount == null ? "-" : postsCount}`);
  lines.push(`- sources: ${totalSources} (ok=${okSources}, err=${errSources})`);
  lines.push(`- items: total=${totalItems}, visible=${totalVisibleItems}, new=${totalNewItems}`);
  lines.push(`- fetch: fetched=${fetched}, cached=${cached}, fallback=${fallback}`);
  lines.push("");

  if (failed.length) {
    lines.push(`### Failed Sources (top ${failed.length})`);
    lines.push("");
    lines.push(`| Source | Kind | HTTP | Attempts | Wait | Items | Error |`);
    lines.push(`|---|---:|---:|---:|---:|---:|---|`);
    for (const s of failed) {
      const err = clampOneLine(s.error ?? "-", 120);
      lines.push(
        `| ${clampOneLine(s.name || s.id, 44)} | ${clampOneLine(s.kind || "-", 14)} | ${s.httpStatus ?? "-"} | ${
          s.attempts ?? "-"
        } | ${s.waitMs == null ? "-" : formatMs(s.waitMs)} | ${s.itemCount ?? 0} | ${err} |`
      );
    }
    lines.push("");
  }

  if (flaky.length) {
    lines.push(`### Flaky Sources (consecutiveFails ≥ 3)`);
    lines.push("");
    lines.push(`| Source | consecutiveFails | Error |`);
    lines.push(`|---|---:|---|`);
    for (const s of flaky) {
      lines.push(
        `| ${clampOneLine(s.name || s.id, 52)} | ${s.consecutiveFails ?? "-"} | ${clampOneLine(s.error ?? "-", 120)} |`
      );
    }
    lines.push("");
  }

  if (slowest.length) {
    lines.push(`### Slowest Sources`);
    lines.push("");
    lines.push(`| Source | Duration | Used | Items |`);
    lines.push(`|---|---:|---:|---:|`);
    for (const s of slowest) {
      lines.push(
        `| ${clampOneLine(s.name || s.id, 52)} | ${formatMs(s.durationMs)} | ${s.used ?? "-"} | ${s.itemCount ?? 0} |`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function appendSummary(markdown: string): Promise<void> {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) {
    console.log(markdown);
    return;
  }

  try {
    const prev = await readFile(file, "utf-8").catch(() => "");
    const next = prev ? `${prev.trimEnd()}\n\n${markdown}\n` : `${markdown}\n`;
    await writeFile(file, next, "utf-8");
  } catch {
    console.log(markdown);
  }
}

async function main() {
  const root = process.cwd();
  const statusPath = resolve(root, "src", "data", "generated", "status.json");
  const postsPath = resolve(root, "src", "data", "generated", "posts.json");

  const statusRaw = await safeReadJsonFile<unknown>(statusPath);
  const status = normalizeSyncStatus(statusRaw);
  if (!status) {
    await appendSummary(`## ACG Sync Summary\n\n- status.json not found or invalid\n`);
    return;
  }

  const postsRaw = await safeReadJsonFile<unknown>(postsPath);
  const postsCount = Array.isArray(postsRaw) ? postsRaw.length : null;

  await appendSummary(renderMarkdown(status, postsCount));
}

void main();

