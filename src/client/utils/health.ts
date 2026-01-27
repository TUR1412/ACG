import { subscribeRequestState, type RequestState } from "../state/requests";
import { loadString } from "../state/storage";

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

function getDomNodes(): number | null {
  try {
    return document.getElementsByTagName("*").length;
  } catch {
    return null;
  }
}

function getMemory(): HealthSnapshot["memory"] {
  try {
    const mem = (
      performance as unknown as {
        memory?: {
          usedJSHeapSize?: number;
          totalJSHeapSize?: number;
          jsHeapSizeLimit?: number;
        };
      }
    ).memory;
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
    obs.observe({ entryTypes: ["longtask"] } as unknown as PerformanceObserverInit);
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

  const makeSnapshot = (): HealthSnapshot => {
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

  let last: HealthSnapshot = makeSnapshot();

  const tick = () => {
    last = makeSnapshot();
    try {
      document.dispatchEvent(new CustomEvent("acg:health-snapshot", { detail: { snapshot: last } }));
    } catch {
      // ignore
    }
  };

  const timer = window.setInterval(tick, intervalMs);
  tick();

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
    (
      window as unknown as { __acgHealth?: { stop: () => void; snapshot: () => HealthSnapshot } }
    ).__acgHealth = { stop, snapshot: () => last };
  } catch {
    // ignore
  }

  return stop;
}

export function maybeStartHealthMonitor() {
  let enabled = false;
  try {
    const params = new URLSearchParams(window.location.search);
    enabled = params.get("health") === "1" || loadString("acg.health") === "1";
  } catch {
    enabled = false;
  }

  if (!enabled) return;
  startHealthMonitor();
}
