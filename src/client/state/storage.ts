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

export function loadString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function saveString(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function removeKey(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function loadTrimmedString(key: string): string {
  return (loadString(key) ?? "").trim();
}

export function saveTrimmedString(key: string, value: string) {
  saveString(key, value.trim());
}

export function loadBoolean(key: string): boolean {
  return loadString(key) === "true";
}

export function saveBoolean(key: string, value: boolean) {
  saveString(key, value ? "true" : "false");
}

export function loadJson<T>(key: string): T | null {
  return safeJsonParse<T>(loadString(key));
}

export function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function loadIds(key: string): Set<string> {
  try {
    const parsed = safeJsonParse<{ version?: number; ids?: unknown }>(loadString(key));
    const ids = Array.isArray(parsed?.ids) ? parsed?.ids.filter((x) => typeof x === "string") : [];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

export function saveIds(key: string, ids: Set<string>) {
  try {
    const value = { version: 1, ids: [...ids] } satisfies IdStoreV1;
    saveJson(key, value);
  } catch {
    // ignore
  }
}

export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/\s+/g, " ").trim();
}

export function loadWords(key: string): Set<string> {
  try {
    const parsed = safeJsonParse<{ version?: number; words?: unknown }>(loadString(key));
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
    saveJson(key, value);
  } catch {
    // ignore
  }
}
