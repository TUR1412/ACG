/**
 * 轻量埋点（本地优先）
 *
 * 默认只写入 localStorage，不做任何上传；
 * 若用户显式配置 endpoint 且开启 upload，则在 pagehide/后台化时尝试上报：
 * - navigator.sendBeacon（优先，最适合“离开页面时”）
 * - fetch(keepalive)（降级）
 */

import { STORAGE_KEYS } from "../constants";
import { loadBoolean, loadString, loadTrimmedString, safeJsonParse, saveJson } from "../state/storage";

export type TelemetryLang = "zh" | "ja";

export type TelemetryEvent = {
  v: 1;
  type: string;
  at: string;
  path: string;
  lang?: TelemetryLang;
  device?: string;
  data?: Record<string, unknown>;
};

type TelemetryStore = {
  version: 1;
  events: TelemetryEvent[];
};

const MAX_EVENTS = 800;
const DEDUP_MS = 10_000;
const MAX_RECENT_KEYS = 64;
const MAX_DATA_DEPTH = 4;
const MAX_DATA_KEYS = 48;
const MAX_DATA_ARRAY_LEN = 48;
const MAX_STRING_LEN = 360;

const recentKeyAt = new Map<string, number>();

function nowIso(): string {
  return new Date().toISOString();
}

function readStore(): TelemetryStore {
  try {
    const parsed = safeJsonParse<{ version?: unknown; events?: unknown }>(loadString(STORAGE_KEYS.TELEMETRY));
    const version = typeof parsed?.version === "number" ? parsed.version : 0;
    const eventsRaw = parsed?.events;
    const events =
      version === 1 && Array.isArray(eventsRaw)
        ? (eventsRaw.filter((x: unknown) => x && typeof x === "object") as TelemetryEvent[])
        : [];
    return { version: 1, events };
  } catch {
    return { version: 1, events: [] };
  }
}

function writeStore(store: TelemetryStore) {
  try {
    saveJson(STORAGE_KEYS.TELEMETRY, store);
  } catch {
    // ignore
  }
}

function resolveLangFromPathname(): TelemetryLang | undefined {
  try {
    const p = window.location.pathname || "";
    if (p.startsWith("/ja/") || p === "/ja") return "ja";
    if (p.startsWith("/zh/") || p === "/zh") return "zh";
    return undefined;
  } catch {
    return undefined;
  }
}

function resolveDevice(): string | undefined {
  try {
    return document.documentElement.dataset.acgDevice || undefined;
  } catch {
    return undefined;
  }
}

function readUploadConfig(): { endpoint: string; enabled: boolean } {
  const enabled = loadBoolean(STORAGE_KEYS.TELEMETRY_UPLOAD);
  const endpoint = loadTrimmedString(STORAGE_KEYS.TELEMETRY_ENDPOINT);
  return { endpoint, enabled };
}

function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function stripUrlQueryHash(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return s.split("?")[0].split("#")[0];
  }
}

function clampText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1))}…`;
}

function shouldRedactKey(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k.includes("token") ||
    k.includes("secret") ||
    k.includes("password") ||
    k.includes("passwd") ||
    k.includes("authorization") ||
    k.includes("cookie") ||
    k.includes("api_key") ||
    k.includes("apikey")
  );
}

function sanitizeTelemetryString(raw: string): string {
  const s = clampText(raw.trim(), MAX_STRING_LEN);
  if (!s) return "";

  // 隐私优先：常见 URL / path 字符串去 query/hash，避免 token/追踪参数进入 telemetry。
  if (/^https?:\/\//i.test(s) || s.startsWith("/")) return stripUrlQueryHash(s);

  // 兜底：对显式包含 URL scheme 的字符串也做一次清洗。
  if (s.includes("://")) return stripUrlQueryHash(s);

  return s;
}

function sanitizeTelemetryValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value == null) return value;

  if (typeof value === "string") return sanitizeTelemetryString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return sanitizeTelemetryString(String(value));
  if (typeof value === "symbol" || typeof value === "function") return undefined;

  if (Array.isArray(value)) {
    if (depth >= MAX_DATA_DEPTH) return "[max_depth]";
    return value
      .slice(0, MAX_DATA_ARRAY_LEN)
      .map((v) => sanitizeTelemetryValue(v, depth + 1, seen))
      .filter((v) => v !== undefined);
  }

  if (typeof value === "object") {
    if (value instanceof Error) {
      return {
        name: sanitizeTelemetryString(value.name || "Error"),
        message: sanitizeTelemetryString(value.message || "")
      };
    }

    if (seen.has(value as object)) return "[circular]";
    if (depth >= MAX_DATA_DEPTH) return "[max_depth]";
    seen.add(value as object);

    const out: Record<string, unknown> = {};
    let keys = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (keys >= MAX_DATA_KEYS) break;
      if (shouldRedactKey(k)) {
        out[k] = "[redacted]";
        keys += 1;
        continue;
      }

      const next = sanitizeTelemetryValue(v, depth + 1, seen);
      if (next === undefined) continue;
      out[k] = next;
      keys += 1;
    }
    return out;
  }

  return sanitizeTelemetryString(String(value));
}

function sanitizeTelemetryData(data?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const seen = new WeakSet<object>();
  const sanitized = sanitizeTelemetryValue(data, 0, seen);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) return undefined;
  return Object.keys(sanitized).length > 0 ? (sanitized as Record<string, unknown>) : undefined;
}

function shouldDropEvent(key: string): boolean {
  const now = Date.now();
  const last = recentKeyAt.get(key) ?? 0;
  if (last > 0 && now - last < DEDUP_MS) return true;
  recentKeyAt.set(key, now);
  if (recentKeyAt.size > MAX_RECENT_KEYS) {
    const first = recentKeyAt.keys().next().value;
    if (typeof first === "string") recentKeyAt.delete(first);
  }
  return false;
}

export function track(params: { type: string; data?: Record<string, unknown> }) {
  const type = params.type.trim();
  if (!type) return;

  const path = (() => {
    try {
      // 隐私优先：不记录 query/hash，避免 token/追踪参数进入 telemetry。
      return window.location.pathname || "";
    } catch {
      return "";
    }
  })();

  const event: TelemetryEvent = {
    v: 1,
    type,
    at: nowIso(),
    path,
    lang: resolveLangFromPathname(),
    device: resolveDevice(),
    data: sanitizeTelemetryData(params.data)
  };

  const key = (() => {
    try {
      return `${event.type}|${event.path}|${event.lang ?? ""}|${event.device ?? ""}|${JSON.stringify(event.data ?? {})}`;
    } catch {
      return `${event.type}|${event.path}|${event.lang ?? ""}|${event.device ?? ""}`;
    }
  })();
  if (key && shouldDropEvent(key)) return;

  const store = readStore();
  store.events.push(event);
  if (store.events.length > MAX_EVENTS) store.events = store.events.slice(store.events.length - MAX_EVENTS);
  writeStore(store);
}

export async function flushTelemetry(): Promise<void> {
  const cfg = readUploadConfig();
  if (!cfg.enabled) return;
  if (!cfg.endpoint || !isHttpUrl(cfg.endpoint)) return;

  const store = readStore();
  if (store.events.length === 0) return;

  const payload = JSON.stringify({
    version: 1,
    sentAt: nowIso(),
    events: store.events
  });

  // 先尝试 sendBeacon：离开页面时成功率更高
  try {
    if (typeof navigator.sendBeacon === "function") {
      const ok = navigator.sendBeacon(cfg.endpoint, new Blob([payload], { type: "application/json" }));
      if (ok) {
        writeStore({ version: 1, events: [] });
        return;
      }
    }
  } catch {
    // ignore
  }

  // 再降级到 fetch(keepalive)
  try {
    const res = await fetch(cfg.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      mode: "cors",
      credentials: "omit",
      keepalive: true
    });
    if (res.ok) writeStore({ version: 1, events: [] });
  } catch {
    // ignore
  }
}

export function wireTelemetry() {
  // page_view 只记录一次（入口点）
  track({
    type: "page_view",
    data: {
      referrer: (() => {
        try {
          return stripUrlQueryHash(document.referrer || "");
        } catch {
          return "";
        }
      })()
    }
  });

  // 仅在用户配置了 upload + endpoint 时尝试上报，避免无意泄露隐私
  const onFlush = () => {
    void flushTelemetry();
  };

  window.addEventListener("pagehide", onFlush);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) onFlush();
  });
}
