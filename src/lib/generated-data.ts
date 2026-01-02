import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Post, StatusHistoryV1, SyncStatus } from "./types";

const POSTS_PATH = join(process.cwd(), "src", "data", "generated", "posts.json");
const STATUS_PATH = join(process.cwd(), "src", "data", "generated", "status.json");
const STATUS_HISTORY_PATH = join(
  process.cwd(),
  "src",
  "data",
  "generated",
  "status-history.v1.json"
);

export async function readGeneratedPosts(): Promise<Post[]> {
  try {
    const raw = await readFile(POSTS_PATH, "utf-8");
    const json = JSON.parse(raw) as unknown;
    return Array.isArray(json) ? (json as Post[]) : [];
  } catch {
    return [];
  }
}

export async function readGeneratedStatus(): Promise<SyncStatus> {
  try {
    const raw = await readFile(STATUS_PATH, "utf-8");
    const json = JSON.parse(raw) as unknown;
    if (json && typeof json === "object") return json as SyncStatus;
    return { generatedAt: null, durationMs: 0, sources: [] };
  } catch {
    return { generatedAt: null, durationMs: 0, sources: [] };
  }
}

export async function readGeneratedStatusHistory(): Promise<StatusHistoryV1> {
  try {
    const raw = await readFile(STATUS_HISTORY_PATH, "utf-8");
    const json = JSON.parse(raw) as unknown;
    if (
      json &&
      typeof json === "object" &&
      (json as any).v === 1 &&
      Array.isArray((json as any).entries)
    ) {
      return json as StatusHistoryV1;
    }
    return { v: 1, generatedAt: null, entries: [] };
  } catch {
    return { v: 1, generatedAt: null, entries: [] };
  }
}

