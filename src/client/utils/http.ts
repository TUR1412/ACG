import { NETWORK } from "../constants";
import { reportRequestEnd, reportRequestStart, type RequestMeta } from "../state/requests";

export type HttpInterceptor = {
  onRequest?: (ctx: { url: string; init: RequestInit; label: string }) => void;
  onResponse?: (ctx: {
    url: string;
    init: RequestInit;
    label: string;
    res: Response;
    durationMs: number;
  }) => void;
  onError?: (ctx: {
    url: string;
    init: RequestInit;
    label: string;
    error: unknown;
    durationMs: number;
  }) => void;
};

const interceptors: HttpInterceptor[] = [];

export function addHttpInterceptor(interceptor: HttpInterceptor): () => void {
  interceptors.push(interceptor);
  return () => {
    const i = interceptors.indexOf(interceptor);
    if (i >= 0) interceptors.splice(i, 1);
  };
}

function nowMs(): number {
  try {
    return Math.floor(performance.now());
  } catch {
    return Date.now();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms)));
}

function mergeHeaders(a: HeadersInit | undefined, b: HeadersInit | undefined): Headers {
  const out = new Headers();
  const apply = (it: HeadersInit | undefined) => {
    if (!it) return;
    try {
      new Headers(it).forEach((v, k) => out.set(k, v));
    } catch {
      // ignore
    }
  };
  apply(a);
  apply(b);
  return out;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return "unknown error";
  }
}

export type HttpRequestOptions = {
  label?: string;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  cache?: RequestCache;
  headers?: HeadersInit;
};

export async function httpFetch(
  url: string,
  init?: RequestInit,
  options?: HttpRequestOptions
): Promise<Response> {
  const label = options?.label ?? url;
  const timeoutMs = options?.timeoutMs ?? NETWORK.DEFAULT_TIMEOUT_MS;
  const retries = Math.max(0, Math.floor(options?.retries ?? 0));
  const retryDelayMs = Math.max(0, Math.floor(options?.retryDelayMs ?? NETWORK.DEFAULT_RETRY_DELAY_MS));

  const baseInit: RequestInit = {
    ...init,
    cache: options?.cache ?? init?.cache,
    headers: mergeHeaders(init?.headers, options?.headers)
  };

  const meta: RequestMeta = { url, label };
  reportRequestStart(meta);

  const startedAt = nowMs();

  const run = async (): Promise<Response> => {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);

      const onAbort = () => controller.abort();
      try {
        if (baseInit.signal) {
          if (baseInit.signal.aborted) controller.abort();
          else baseInit.signal.addEventListener("abort", onAbort, { once: true });
        }
      } catch {
        // ignore
      }

      const attemptInit: RequestInit = { ...baseInit, signal: controller.signal };

      try {
        for (const it of interceptors) {
          try {
            it.onRequest?.({ url, init: attemptInit, label });
          } catch {
            // ignore
          }
        }

        const res = await fetch(url, attemptInit);
        const durationMs = nowMs() - startedAt;

        for (const it of interceptors) {
          try {
            it.onResponse?.({ url, init: attemptInit, label, res, durationMs });
          } catch {
            // ignore
          }
        }

        // 5xx/429：允许做一次轻量重试；其他情况交给调用方处理（比如 404/451 有明确语义）。
        const retryable = res.status >= 500 || res.status === 429;
        if (!res.ok && retryable && attempt < retries) {
          const base = retryDelayMs * Math.pow(2, attempt);
          const jitter = 0.85 + Math.random() * 0.3;
          await sleep(Math.floor(base * jitter));
          continue;
        }

        reportRequestEnd(meta, { ok: res.ok, status: res.status, durationMs });
        return res;
      } catch (error) {
        const durationMs = nowMs() - startedAt;
        for (const it of interceptors) {
          try {
            it.onError?.({ url, init: attemptInit, label, error, durationMs });
          } catch {
            // ignore
          }
        }

        if (attempt < retries) {
          const base = retryDelayMs * Math.pow(2, attempt);
          const jitter = 0.85 + Math.random() * 0.3;
          await sleep(Math.floor(base * jitter));
          continue;
        }

        reportRequestEnd(meta, { ok: false, durationMs, error: toErrorMessage(error) });
        throw error;
      } finally {
        window.clearTimeout(timer);
        try {
          baseInit.signal?.removeEventListener("abort", onAbort);
        } catch {
          // ignore
        }
      }
    }

    // unreachable
    throw new Error("unreachable");
  };

  return await run();
}

export async function fetchJson<T>(
  url: string,
  options?: Omit<HttpRequestOptions, "headers"> & { headers?: HeadersInit }
): Promise<T> {
  const res = await httpFetch(url, undefined, {
    ...options,
    headers: mergeHeaders({ accept: "application/json" }, options?.headers)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

function supportsGzipDecompression(): boolean {
  try {
    const DS = (globalThis as unknown as { DecompressionStream?: unknown }).DecompressionStream;
    return typeof DS === "function";
  } catch {
    return false;
  }
}

async function gunzipToText(res: Response): Promise<string> {
  if (!res.body) throw new Error("empty body");
  const DS = (globalThis as unknown as { DecompressionStream?: unknown }).DecompressionStream;
  if (typeof DS !== "function") throw new Error("DecompressionStream unsupported");

  // `DecompressionStream` 是浏览器原生能力（零依赖）；不支持的环境将回退到 JSON。
  const ctor = DS as unknown as {
    new (format: "gzip"): TransformStream<Uint8Array, Uint8Array>;
  };
  const ds = new ctor("gzip");
  const stream = (res.body as ReadableStream).pipeThrough(ds);
  return await new Response(stream).text();
}

export async function fetchJsonPreferGzip<T>(params: {
  url: string;
  gzUrl?: string;
  options?: Omit<HttpRequestOptions, "headers"> & { headers?: HeadersInit };
}): Promise<T> {
  const { url, gzUrl } = params;
  const options = params.options;

  if (gzUrl && supportsGzipDecompression()) {
    try {
      const res = await httpFetch(gzUrl, undefined, {
        ...options,
        headers: mergeHeaders({ accept: "application/gzip" }, options?.headers)
      });
      if (res.ok) {
        const text = await gunzipToText(res);
        return JSON.parse(text) as T;
      }
    } catch {
      // ignore, fallback to JSON
    }
  }

  return fetchJson<T>(url, options);
}
