import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Post, SyncStatus } from "./types";

const POSTS_PATH = join(process.cwd(), "src", "data", "generated", "posts.json");
const STATUS_PATH = join(process.cwd(), "src", "data", "generated", "status.json");

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

