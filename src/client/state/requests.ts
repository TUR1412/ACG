import { NETWORK } from "../constants";

export type RequestMeta = {
  label: string;
  url: string;
};

export type RequestResult = {
  ok: boolean;
  status?: number;
  durationMs: number;
  error?: string;
};

export type RequestState = {
  active: number;
  slow: boolean;
  lastSlowMs: number | null;
  lastErrorAt: number | null;
  lastError: { url: string; status?: number; message?: string } | null;
};

const state: RequestState = {
  active: 0,
  slow: false,
  lastSlowMs: null,
  lastErrorAt: null,
  lastError: null
};

const listeners = new Set<(snapshot: RequestState) => void>();
let slowResetTimer: number | null = null;

function snapshot(): RequestState {
  return { ...state, lastError: state.lastError ? { ...state.lastError } : null };
}

function applyDomState() {
  try {
    const el = document.documentElement;
    el.dataset.acgBusy = state.active > 0 ? "true" : "false";
    el.dataset.acgNet = state.slow ? "slow" : "ok";
  } catch {
    // ignore
  }
}

function notify() {
  const snap = snapshot();
  for (const fn of listeners) {
    try {
      fn(snap);
    } catch {
      // ignore
    }
  }
}

function setSlowTemporarily(durationMs: number) {
  state.slow = true;
  state.lastSlowMs = durationMs;

  if (slowResetTimer != null) {
    window.clearTimeout(slowResetTimer);
    slowResetTimer = null;
  }
  slowResetTimer = window.setTimeout(() => {
    state.slow = false;
    applyDomState();
    notify();
  }, NETWORK.SLOW_STATE_HOLD_MS);
}

export function subscribeRequestState(listener: (snapshot: RequestState) => void): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function reportRequestStart(meta: RequestMeta) {
  void meta;
  state.active += 1;
  applyDomState();
  notify();
}

export function reportRequestEnd(meta: RequestMeta, result: RequestResult) {
  state.active = Math.max(0, state.active - 1);

  if (result.durationMs >= NETWORK.SLOW_REQUEST_THRESHOLD_MS) {
    setSlowTemporarily(result.durationMs);
  }

  if (!result.ok) {
    state.lastErrorAt = Date.now();
    state.lastError = {
      url: meta.url,
      status: result.status,
      message: result.error
    };
  }

  applyDomState();
  notify();
}
