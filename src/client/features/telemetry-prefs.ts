// Telemetry 偏好：允许用户显式开启上报并配置 endpoint（默认本地记录、不上传）。
import { STORAGE_KEYS } from "../constants";
import { isJapanese } from "../utils/lang";
import { track } from "../utils/telemetry";

type ToastVariant = "info" | "success" | "error";

function emitToast(params: { title: string; desc?: string; variant?: ToastVariant; timeoutMs?: number }) {
  try {
    document.dispatchEvent(new CustomEvent("acg:toast", { detail: params }));
  } catch {
    // ignore
  }
}

function readBool(key: string): boolean {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeBool(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "true" : "false");
  } catch {
    // ignore
  }
}

function readText(key: string): string {
  try {
    return (localStorage.getItem(key) ?? "").trim();
  } catch {
    return "";
  }
}

function writeText(key: string, value: string) {
  try {
    localStorage.setItem(key, value.trim());
  } catch {
    // ignore
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

function readTelemetryRaw(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.TELEMETRY) ?? "";
  } catch {
    return "";
  }
}

function getTelemetryCount(raw: string): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; events?: unknown };
    const version = typeof parsed?.version === "number" ? parsed.version : 0;
    if (version !== 1) return 0;
    return Array.isArray(parsed?.events) ? parsed.events.length : 0;
  } catch {
    return 0;
  }
}

function getTelemetryBytes(raw: string): number {
  if (!raw) return 0;
  try {
    return new Blob([raw]).size;
  } catch {
    return raw.length;
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb * 10) / 10} KB`;
  const mb = kb / 1024;
  return `${Math.round(mb * 10) / 10} MB`;
}

export function wireTelemetryPrefs() {
  const upload = document.querySelector<HTMLInputElement>("#acg-telemetry-upload");
  const endpoint = document.querySelector<HTMLInputElement>("#acg-telemetry-endpoint");
  const exportBtn = document.querySelector<HTMLButtonElement>("#acg-telemetry-export");
  const clearBtn = document.querySelector<HTMLButtonElement>("#acg-telemetry-clear");
  const countEl = document.querySelector<HTMLElement>("#acg-telemetry-count");
  const sizeEl = document.querySelector<HTMLElement>("#acg-telemetry-size");

  if (!upload && !endpoint && !exportBtn && !clearBtn && !countEl && !sizeEl) return;

  const syncSummary = () => {
    const raw = readTelemetryRaw();
    const count = getTelemetryCount(raw);
    const bytes = getTelemetryBytes(raw);
    try {
      if (countEl) countEl.textContent = String(count);
    } catch {
      // ignore
    }
    try {
      if (sizeEl) sizeEl.textContent = formatBytes(bytes);
    } catch {
      // ignore
    }
  };

  const apply = () => {
    try {
      if (upload) upload.checked = readBool(STORAGE_KEYS.TELEMETRY_UPLOAD);
    } catch {
      // ignore
    }
    try {
      if (endpoint) endpoint.value = readText(STORAGE_KEYS.TELEMETRY_ENDPOINT);
    } catch {
      // ignore
    }
    syncSummary();
  };

  apply();

  upload?.addEventListener("change", () => {
    const on = Boolean(upload.checked);
    writeBool(STORAGE_KEYS.TELEMETRY_UPLOAD, on);
    track({ type: "telemetry_upload_toggle", data: { on } });

    const ep = readText(STORAGE_KEYS.TELEMETRY_ENDPOINT);
    if (on && !isHttpUrl(ep)) {
      emitToast({
        title: isJapanese() ? "送信は未設定です" : "尚未设置上报地址",
        desc: isJapanese()
          ? "endpoint（http/https）を設定すると、ページ離脱時に送信を試みます。"
          : "填写 http/https endpoint 后，页面离开时才会尝试上报。",
        variant: "info",
        timeoutMs: 2200
      });
    } else {
      emitToast({
        title: on ? (isJapanese() ? "送信を許可しました" : "已允许上报") : isJapanese() ? "送信を停止しました" : "已停止上报",
        variant: on ? "success" : "info",
        timeoutMs: 1400
      });
    }
  });

  endpoint?.addEventListener("change", () => {
    const value = (endpoint.value ?? "").trim();
    writeText(STORAGE_KEYS.TELEMETRY_ENDPOINT, value);
    track({ type: "telemetry_endpoint_change", data: { ok: isHttpUrl(value) } });
    emitToast({
      title: isJapanese() ? "endpoint を保存しました" : "已保存 endpoint",
      desc: value && !isHttpUrl(value) ? (isJapanese() ? "http/https の URL のみ有効です。" : "仅 http/https URL 会被用于上报。") : undefined,
      variant: value && !isHttpUrl(value) ? "error" : "success",
      timeoutMs: 1600
    });
  });

  exportBtn?.addEventListener("click", () => {
    const raw = readTelemetryRaw();
    const count = getTelemetryCount(raw);
    if (!raw || count <= 0) {
      emitToast({
        title: isJapanese() ? "ログはありません" : "暂无可导出的记录",
        desc: isJapanese() ? "しばらく使ってから再度お試しください。" : "使用一段时间后再试。",
        variant: "info",
        timeoutMs: 1600
      });
      return;
    }

    try {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      const name = `acg-telemetry-${stamp}.json`;
      const blob = new Blob([raw], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      track({ type: "telemetry_export", data: { count } });
      emitToast({
        title: isJapanese() ? "ログを書き出しました" : "已导出 telemetry",
        desc: isJapanese() ? `${count} 件` : `${count} 条`,
        variant: "success",
        timeoutMs: 1400
      });
    } catch {
      emitToast({
        title: isJapanese() ? "書き出しに失敗しました" : "导出失败",
        variant: "error",
        timeoutMs: 1600
      });
    } finally {
      syncSummary();
    }
  });

  clearBtn?.addEventListener("click", () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.TELEMETRY);
    } catch {
      // ignore
    }
    syncSummary();
    emitToast({
      title: isJapanese() ? "ログをクリアしました" : "已清空 telemetry",
      variant: "success",
      timeoutMs: 1400
    });
  });
}

