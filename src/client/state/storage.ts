// 浏览器端 localStorage 辅助：容错 JSON 解析 + Set 持久化，避免单点错误阻断交互。

type IdStoreV1 = {
  version: 1;
  ids: string[];
};

type WordStoreV1 = {
  version: 1;
  words: string[];
};

export function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadIds(key: string): Set<string> {
  try {
    const parsed = safeJsonParse<{ version?: number; ids?: unknown }>(localStorage.getItem(key));
    const ids = Array.isArray(parsed?.ids) ? parsed?.ids.filter((x) => typeof x === "string") : [];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

export function saveIds(key: string, ids: Set<string>) {
  try {
    const value = { version: 1, ids: [...ids] } satisfies IdStoreV1;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/\s+/g, " ").trim();
}

export function loadWords(key: string): Set<string> {
  try {
    const parsed = safeJsonParse<{ version?: number; words?: unknown }>(localStorage.getItem(key));
    const words = Array.isArray(parsed?.words)
      ? parsed?.words.filter((x) => typeof x === "string").map((x) => normalizeWord(x))
      : [];
    return new Set(words.filter(Boolean));
  } catch {
    return new Set();
  }
}

export function saveWords(key: string, words: Set<string>) {
  try {
    const value = { version: 1, words: [...words] } satisfies WordStoreV1;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}
