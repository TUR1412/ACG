// 浏览器端观测：全局错误捕获 + 轻量性能指标（本地优先），用于排障与体验回溯。
import { isJapanese } from "./lang";
import { track } from "./telemetry";

type ToastVariant = "info" | "success" | "error";

function emitToast(params: { title: string; desc?: string; variant?: ToastVariant; timeoutMs?: number }) {
  try {
    document.dispatchEvent(new CustomEvent("acg:toast", { detail: params }));
  } catch {
    // ignore
  }
}

function isLowPerfMode(): boolean {
  try {
    return document.documentElement.dataset.acgPerf === "low";
  } catch {
    return false;
  }
}

function clampText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1))}…`;
}

export function sanitizeOneLine(raw: unknown, maxLen = 220): string {
  const s = typeof raw === "string" ? raw : raw instanceof Error ? raw.message : String(raw ?? "");
  const oneLine = stripUrlQuery(s).replace(/\s+/g, " ").trim();
  return clampText(oneLine, maxLen);
}

function stripUrlQuery(text: string): string {
  return text.replace(/\bhttps?:\/\/[^\s)]+/g, (m) => {
    try {
      const u = new URL(m);
      u.search = "";
      u.hash = "";
      return u.toString();
    } catch {
      return m.split("?")[0].split("#")[0];
    }
  });
}

export function sanitizeStack(raw: unknown, maxLen = 900): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = stripUrlQuery(raw).trim();
  if (!s) return undefined;
  return clampText(s, maxLen);
}

export function makeErrorKey(input: { type: string; message: string; stack?: string }): string {
  const head = sanitizeOneLine(input.message, 160);
  const line0 = (input.stack ?? "").split("\n")[0] ?? "";
  const stackHead = sanitizeOneLine(line0, 120);
  return `${input.type}:${head}:${stackHead}`;
}

export function wireGlobalErrorMonitoring() {
  // 去重/节流：避免雪崩式 toast 与 telemetry 膨胀。
  let lastKey = "";
  let lastAt = 0;
  let lastToastAt = 0;
  const DEDUP_MS = 10_000;
  const TOAST_GAP_MS = 12_000;

  const shouldDrop = (key: string): boolean => {
    const now = Date.now();
    if (key && key === lastKey && now - lastAt < DEDUP_MS) return true;
    lastKey = key;
    lastAt = now;
    return false;
  };

  const maybeToast = (title: string, desc?: string) => {
    const now = Date.now();
    if (now - lastToastAt < TOAST_GAP_MS) return;
    lastToastAt = now;
    emitToast({ title, desc, variant: "error", timeoutMs: isLowPerfMode() ? 1400 : 2200 });
  };

  window.addEventListener("error", (ev) => {
    try {
      // 资源加载失败会触发 error 事件，但 message 可能为空；为避免噪音，这里只记录“脚本错误”。
      const msg = sanitizeOneLine((ev as ErrorEvent).message ?? "", 240);
      if (!msg) return;

      const err = (ev as ErrorEvent).error;
      const stack = sanitizeStack(err instanceof Error ? err.stack : undefined);
      const key = makeErrorKey({ type: "error", message: msg, stack });
      if (shouldDrop(key)) return;

      track({
        type: "error_global",
        data: {
          message: msg,
          stack,
          filename: sanitizeOneLine((ev as ErrorEvent).filename ?? "", 240),
          lineno: typeof (ev as ErrorEvent).lineno === "number" ? (ev as ErrorEvent).lineno : undefined,
          colno: typeof (ev as ErrorEvent).colno === "number" ? (ev as ErrorEvent).colno : undefined
        }
      });

      maybeToast(
        isJapanese() ? "エラーが発生しました" : "发生了错误",
        isLowPerfMode()
          ? undefined
          : isJapanese()
            ? "一部の機能が動かない可能性があります。"
            : "部分功能可能受影响。"
      );
    } catch {
      // ignore
    }
  });

  window.addEventListener("unhandledrejection", (ev) => {
    try {
      const reason = (ev as PromiseRejectionEvent).reason;
      const msg = sanitizeOneLine(reason instanceof Error ? reason.message : reason, 240);
      if (!msg) return;

      const stack = sanitizeStack(reason instanceof Error ? reason.stack : undefined);
      const key = makeErrorKey({ type: "unhandledrejection", message: msg, stack });
      if (shouldDrop(key)) return;

      track({
        type: "error_unhandledrejection",
        data: {
          message: msg,
          stack
        }
      });

      // Promise rejection 往往会被业务逻辑兜底；默认不打断用户，只在非低性能模式下给轻提示。
      if (!isLowPerfMode()) {
        maybeToast(
          isJapanese() ? "処理に失敗しました" : "操作未完成",
          isJapanese() ? "ネットワーク状況を確認してください。" : "可检查网络后重试。"
        );
      }
    } catch {
      // ignore
    }
  });
}

export function wirePerfMonitoring() {
  // 低性能模式下减少观测项，避免“为了观测而影响体验”。
  const low = isLowPerfMode();

  let cls = 0;
  let lcp = 0;
  let ttfb = 0;
  let longTaskCount = 0;
  let longTaskMax = 0;
  let lastLongTaskAt = 0;
  const LONGTASK_SAMPLE_GAP_MS = low ? 20_000 : 8_000;
  const interactionMaxById = new Map<number, number>();
  const MAX_INTERACTIONS = 60;

  const canObserve = typeof PerformanceObserver === "function";
  if (!canObserve) return;

  try {
    const nav = performance.getEntriesByType?.("navigation")?.[0] as any;
    const rs = typeof nav?.responseStart === "number" ? nav.responseStart : 0;
    if (Number.isFinite(rs) && rs > 0) ttfb = rs;
  } catch {
    // ignore
  }

  try {
    // LCP
    const obs = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1] as PerformanceEntry | undefined;
      if (!last) return;
      lcp = Math.max(lcp, last.startTime);
    });
    obs.observe({ type: "largest-contentful-paint", buffered: true } as any);
  } catch {
    // ignore
  }

  try {
    // CLS
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as any[]) {
        const value = typeof entry?.value === "number" ? entry.value : 0;
        const hadRecentInput = Boolean(entry?.hadRecentInput);
        if (!hadRecentInput) cls += value;
      }
    });
    obs.observe({ type: "layout-shift", buffered: true } as any);
  } catch {
    // ignore
  }

  if (!low) {
    try {
      // longtask（仅抽样记录，避免事件过多）
      const obs = new PerformanceObserver((list) => {
        const now = Date.now();
        if (now - lastLongTaskAt < LONGTASK_SAMPLE_GAP_MS) return;
        lastLongTaskAt = now;
        for (const entry of list.getEntries() as any[]) {
          const dur = typeof entry?.duration === "number" ? entry.duration : 0;
          if (!Number.isFinite(dur) || dur <= 0) continue;
          longTaskCount += 1;
          longTaskMax = Math.max(longTaskMax, dur);
        }
      });
      obs.observe({ type: "longtask", buffered: true } as any);
    } catch {
      // ignore
    }

    try {
      // INP（近似）：基于 event timing entries，按 interactionId 聚合每次交互的最大 duration。
      const recordInteraction = (interactionId: number, duration: number) => {
        if (!Number.isFinite(duration) || duration <= 0) return;
        const prev = interactionMaxById.get(interactionId) ?? 0;
        if (duration > prev) interactionMaxById.set(interactionId, duration);
        if (interactionMaxById.size > MAX_INTERACTIONS) {
          const first = interactionMaxById.keys().next().value;
          if (typeof first === "number") interactionMaxById.delete(first);
        }
      };

      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          const id = typeof entry?.interactionId === "number" ? entry.interactionId : 0;
          if (!id) continue;
          const dur = typeof entry?.duration === "number" ? entry.duration : 0;
          if (!Number.isFinite(dur) || dur <= 0) continue;
          const name = typeof entry?.name === "string" ? entry.name : "";
          if (
            name &&
            name !== "click" &&
            name !== "keydown" &&
            name !== "pointerdown" &&
            name !== "pointerup"
          ) {
            continue;
          }
          recordInteraction(id, dur);
        }
      });

      try {
        obs.observe({ type: "event", buffered: true, durationThreshold: 40 } as any);
      } catch {
        obs.observe({ type: "event", buffered: true } as any);
      }
    } catch {
      // ignore
    }
  }

  const flush = () => {
    try {
      // CLS 保留 3 位小数即可（避免浮点噪音膨胀 telemetry）
      const clsFixed = Math.round(cls * 1000) / 1000;
      const inpValues = Array.from(interactionMaxById.values()).filter((v) => Number.isFinite(v) && v > 0);
      inpValues.sort((a, b) => a - b);
      const inpIdx =
        inpValues.length > 0 ? Math.min(inpValues.length - 1, Math.ceil(inpValues.length * 0.98) - 1) : -1;
      const inpMs = inpIdx >= 0 ? inpValues[inpIdx] : 0;
      track({
        type: "perf_vitals",
        data: {
          lcpMs: lcp > 0 ? Math.round(lcp) : undefined,
          cls: clsFixed > 0 ? clsFixed : undefined,
          ttfbMs: ttfb > 0 ? Math.round(ttfb) : undefined,
          inpMs: inpMs > 0 ? Math.round(inpMs) : undefined,
          longTaskCount: longTaskCount > 0 ? longTaskCount : undefined,
          longTaskMaxMs: longTaskMax > 0 ? Math.round(longTaskMax) : undefined,
          perf: document.documentElement.dataset.acgPerf ?? undefined
        }
      });
    } catch {
      // ignore
    }
  };

  // 页面离开/隐藏时记录一次即可。
  try {
    window.addEventListener("pagehide", flush, { once: true });
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) flush();
      },
      { once: true }
    );
  } catch {
    // ignore
  }
}
