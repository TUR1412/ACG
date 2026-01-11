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

export function wireTelemetryPrefs() {
  const upload = document.querySelector<HTMLInputElement>("#acg-telemetry-upload");
  const endpoint = document.querySelector<HTMLInputElement>("#acg-telemetry-endpoint");
  if (!upload && !endpoint) return;

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
}

