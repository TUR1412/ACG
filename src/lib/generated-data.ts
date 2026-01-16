import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Post, StatusHistoryV1, SyncStatus } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function isStatusHistoryV1(value: unknown): value is StatusHistoryV1 {
  if (!isRecord(value)) return false;
  return value.v === 1 && Array.isArray(value.entries);
}

function generatedPath(...parts: string[]): string {
  return join(process.cwd(), "src", "data", "generated", ...parts);
}

export async function readGeneratedPosts(): Promise<Post[]> {
  try {
    const raw = await readFile(generatedPath("posts.json"), "utf-8");
    const json = JSON.parse(raw) as unknown;
    return Array.isArray(json) ? (json as Post[]) : [];
  } catch {
    return [];
  }
}

export async function readGeneratedStatus(): Promise<SyncStatus> {
  try {
    const raw = await readFile(generatedPath("status.json"), "utf-8");
    const json = JSON.parse(raw) as unknown;
    if (json && typeof json === "object") return json as SyncStatus;
    return { generatedAt: null, durationMs: 0, sources: [] };
  } catch {
    return { generatedAt: null, durationMs: 0, sources: [] };
  }
}

export async function readGeneratedStatusHistory(): Promise<StatusHistoryV1> {
  try {
    const raw = await readFile(generatedPath("status-history.v1.json"), "utf-8");
    const json = JSON.parse(raw) as unknown;
    if (isStatusHistoryV1(json)) {
      return json as StatusHistoryV1;
    }
    return { v: 1, generatedAt: null, entries: [] };
  } catch {
    return { v: 1, generatedAt: null, entries: [] };
  }
}
