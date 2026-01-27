export function isLowPerfMode(): boolean {
  try {
    return document.documentElement.dataset.acgPerf === "low";
  } catch {
    return false;
  }
}

export function isScrollingNow(): boolean {
  try {
    return document.documentElement.dataset.acgScroll === "1";
  } catch {
    return false;
  }
}

export function runWhenIdle(task: () => void, timeoutMs: number) {
  try {
    type RequestIdleCallbackLike = (cb: (deadline?: unknown) => void, opts?: { timeout?: number }) => number;
    const ric = (window as unknown as { requestIdleCallback?: RequestIdleCallbackLike }).requestIdleCallback;
    if (typeof ric === "function") {
      ric(
        () => {
          try {
            task();
          } catch {
            // ignore
          }
        },
        { timeout: timeoutMs }
      );
      return;
    }
  } catch {
    // ignore
  }

  window.setTimeout(
    () => {
      try {
        task();
      } catch {
        // ignore
      }
    },
    Math.min(80, Math.max(0, timeoutMs))
  );
}

export type IdleDeadlineLike = {
  timeRemaining?: () => number;
  didTimeout?: boolean;
};

export function runDuringIdle(task: (deadline?: IdleDeadlineLike) => void, timeoutMs: number) {
  try {
    type RequestIdleCallbackLike = (
      cb: (deadline: IdleDeadlineLike) => void,
      opts?: { timeout?: number }
    ) => number;
    const ric = (window as unknown as { requestIdleCallback?: RequestIdleCallbackLike }).requestIdleCallback;
    if (typeof ric === "function") {
      ric(
        (deadline) => {
          try {
            task(deadline);
          } catch {
            // ignore
          }
        },
        { timeout: timeoutMs }
      );
      return;
    }
  } catch {
    // ignore
  }

  window.setTimeout(
    () => {
      try {
        task();
      } catch {
        // ignore
      }
    },
    Math.min(80, Math.max(0, timeoutMs))
  );
}
