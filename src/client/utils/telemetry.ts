/**
 * 轻量埋点（本地优先）
 *
 * 默认只写入 localStorage，不做任何上传；
 * 若用户显式配置 endpoint 且开启 upload，则在 pagehide/后台化时尝试上报：
 * - navigator.sendBeacon（优先，最适合“离开页面时”）
 * - fetch(keepalive)（降级）
 */

import { STORAGE_KEYS } from "../constants";

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

function nowIso(): string {
  return new Date().toISOString();
}

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readStore(): TelemetryStore {
  try {
    const parsed = safeJsonParse<{ version?: unknown; events?: unknown }>(localStorage.getItem(STORAGE_KEYS.TELEMETRY));
    const version = typeof parsed?.version === "number" ? parsed.version : 0;
    const eventsRaw = (parsed as any)?.events;
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
    localStorage.setItem(STORAGE_KEYS.TELEMETRY, JSON.stringify(store));
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
  try {
    const enabled = localStorage.getItem(STORAGE_KEYS.TELEMETRY_UPLOAD) === "true";
    const endpoint = localStorage.getItem(STORAGE_KEYS.TELEMETRY_ENDPOINT) ?? "";
    return { endpoint, enabled };
  } catch {
    return { endpoint: "", enabled: false };
  }
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
    data: params.data
  };

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

