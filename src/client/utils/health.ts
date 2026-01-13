import { subscribeRequestState, type RequestState } from "../state/requests";

export type HealthSnapshot = {
  at: string;
  fps: number | null;
  longTasks: { count: number; totalMs: number; maxMs: number } | null;
  memory: {
    usedJsHeapSize: number;
    totalJsHeapSize: number;
    jsHeapSizeLimit: number;
  } | null;
  domNodes: number | null;
  requests: RequestState;
};

function nowIso(): string {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function round(n: number): number {
  return Math.round(n);
}

function bytesToMiB(n: number): string {
  const mib = n / (1024 * 1024);
  return `${mib.toFixed(1)} MiB`;
}

function getDomNodes(): number | null {
  try {
    return document.getElementsByTagName("*").length;
  } catch {
    return null;
  }
}

function getMemory(): HealthSnapshot["memory"] {
  try {
    const mem = (performance as any).memory as
      | { usedJSHeapSize?: number; totalJSHeapSize?: number; jsHeapSizeLimit?: number }
      | undefined;
    if (!mem) return null;
    const used = typeof mem.usedJSHeapSize === "number" ? mem.usedJSHeapSize : NaN;
    const total = typeof mem.totalJSHeapSize === "number" ? mem.totalJSHeapSize : NaN;
    const limit = typeof mem.jsHeapSizeLimit === "number" ? mem.jsHeapSizeLimit : NaN;
    if (!Number.isFinite(used) || !Number.isFinite(total) || !Number.isFinite(limit)) return null;
    return { usedJsHeapSize: used, totalJsHeapSize: total, jsHeapSizeLimit: limit };
  } catch {
    return null;
  }
}

function observeLongTasks(): {
  get: () => { count: number; totalMs: number; maxMs: number } | null;
  stop: () => void;
} {
  let count = 0;
  let totalMs = 0;
  let maxMs = 0;

  if (!("PerformanceObserver" in window)) {
    return { get: () => null, stop: () => void 0 };
  }

  let obs: PerformanceObserver | null = null;
  try {
    obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const d = (entry as PerformanceEntry).duration;
        if (!Number.isFinite(d) || d <= 0) continue;
        count += 1;
        totalMs += d;
        if (d > maxMs) maxMs = d;
      }
    });
    obs.observe({ entryTypes: ["longtask"] as any });
  } catch {
    obs = null;
  }

  return {
    get: () => (count > 0 ? { count, totalMs, maxMs } : { count: 0, totalMs: 0, maxMs: 0 }),
    stop: () => {
      try {
        obs?.disconnect();
      } catch {
        // ignore
      }
      obs = null;
    }
  };
}

function startFpsMeter(): { get: () => number | null; stop: () => void } {
  if (!("requestAnimationFrame" in window)) return { get: () => null, stop: () => void 0 };

  let raf: number | null = null;
  let frames = 0;
  let fps: number | null = null;
  let last = 0;

  const tick = (t: number) => {
    frames += 1;
    if (!last) last = t;
    const dt = t - last;
    if (dt >= 1000) {
      fps = (frames * 1000) / dt;
      frames = 0;
      last = t;
    }
    raf = window.requestAnimationFrame(tick);
  };

  raf = window.requestAnimationFrame(tick);

  return {
    get: () => (fps != null ? fps : null),
    stop: () => {
      if (raf != null) window.cancelAnimationFrame(raf);
      raf = null;
    }
  };
}

export function startHealthMonitor(params?: { intervalMs?: number }): () => void {
  const intervalMs = Math.max(1000, Math.floor(params?.intervalMs ?? 5000));

  let requests: RequestState = {
    active: 0,
    slow: false,
    lastSlowMs: null,
    lastErrorAt: null,
    lastError: null
  };

  const unsub = subscribeRequestState((s) => {
    requests = s;
  });

  const longTasks = observeLongTasks();
  const fps = startFpsMeter();

  let domNodes: number | null = null;
  let domSampleTick = 0;

  const snapshot = (): HealthSnapshot => {
    // DOM 计数较贵：降低频率
    domSampleTick += 1;
    if (domSampleTick % 2 === 1) domNodes = getDomNodes();

    return {
      at: nowIso(),
      fps: fps.get(),
      longTasks: longTasks.get(),
      memory: getMemory(),
      domNodes,
      requests
    };
  };

  const log = () => {
    const s = snapshot();
    const net = s.requests.slow ? "slow" : "ok";
    const busy = s.requests.active > 0 ? `busy(${s.requests.active})` : "idle";
    const fpsLabel = s.fps != null ? `${s.fps.toFixed(1)}fps` : "fps=?";

    console.groupCollapsed(`[ACG HEALTH] ${fpsLabel} · ${net} · ${busy} · ${s.at}`);

    const rows: Record<string, string> = {
      "Requests.active": String(s.requests.active),
      "Requests.net": net,
      "Requests.lastSlowMs": s.requests.lastSlowMs != null ? `${round(s.requests.lastSlowMs)}ms` : "-",
      "Requests.lastError": s.requests.lastError
        ? `${s.requests.lastError.status ?? "-"} ${s.requests.lastError.url}`
        : "-"
    };
    if (s.longTasks) {
      rows["LongTasks.count"] = String(s.longTasks.count);
      rows["LongTasks.max"] = `${round(s.longTasks.maxMs)}ms`;
      rows["LongTasks.total"] = `${round(s.longTasks.totalMs)}ms`;
    }
    if (s.domNodes != null) rows["DOM.nodes"] = String(s.domNodes);
    console.table(rows);

    if (s.memory) {
      console.log(
        `[Memory] used=${bytesToMiB(s.memory.usedJsHeapSize)} total=${bytesToMiB(s.memory.totalJsHeapSize)} limit=${bytesToMiB(
          s.memory.jsHeapSizeLimit
        )}`
      );
    } else {
      console.log("[Memory] performance.memory 不可用（非 Chromium 或被禁用）");
    }

    console.groupEnd();
  };

  const timer = window.setInterval(log, intervalMs);
  log();

  const stop = () => {
    window.clearInterval(timer);
    try {
      unsub();
    } catch {
      // ignore
    }
    try {
      longTasks.stop();
    } catch {
      // ignore
    }
    try {
      fps.stop();
    } catch {
      // ignore
    }
  };

  try {
    (window as any).__acgHealth = { stop, snapshot };
  } catch {
    // ignore
  }

  return stop;
}

export function maybeStartHealthMonitor() {
  let enabled = false;
  try {
    const params = new URLSearchParams(window.location.search);
    enabled = params.get("health") === "1" || localStorage.getItem("acg.health") === "1";
  } catch {
    enabled = false;
  }

  if (!enabled) return;
  startHealthMonitor();
}
