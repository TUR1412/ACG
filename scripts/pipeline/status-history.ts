import type { StatusHistoryEntry } from "../../src/lib/types";

export function normalizeStatusHistoryEntry(value: unknown): StatusHistoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const it = value as any;

  const generatedAt = typeof it.generatedAt === "string" ? it.generatedAt : "";
  if (!generatedAt) return null;

  const num = (v: unknown): number | null => {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };

  const durationMs = num(it.durationMs);
  const totalSources = num(it.totalSources);
  const okSources = num(it.okSources);
  const errSources = num(it.errSources);
  const totalItems = num(it.totalItems);
  const totalNewItems = num(it.totalNewItems);
  const flakySources = num(it.flakySources);
  const staleSources = num(it.staleSources);
  const parseEmpty = num(it.parseEmpty);
  const parseDrop = num(it.parseDrop);

  if (
    durationMs == null ||
    totalSources == null ||
    okSources == null ||
    errSources == null ||
    totalItems == null ||
    totalNewItems == null ||
    flakySources == null ||
    staleSources == null ||
    parseEmpty == null ||
    parseDrop == null
  ) {
    return null;
  }

  return {
    generatedAt,
    durationMs,
    totalSources,
    okSources,
    errSources,
    totalItems,
    totalNewItems,
    flakySources,
    staleSources,
    parseEmpty,
    parseDrop
  };
}
