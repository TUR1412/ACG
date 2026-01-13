export type VirtualGridOptions<T> = {
  container: HTMLElement;
  items: T[];
  renderItem: (item: T) => HTMLElement;
  estimateRowHeight?: number;
  overscanRows?: number;
};

export type VirtualGridController<T> = {
  setItems: (items: T[]) => void;
  destroy: () => void;
  renderNow: () => void;
};

function parsePx(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function countGridColumns(container: HTMLElement): number {
  try {
    const tpl = window.getComputedStyle(container).gridTemplateColumns;
    if (!tpl || tpl === "none") return 1;
    const parts = tpl
      .split(" ")
      .map((x) => x.trim())
      .filter(Boolean);
    return Math.max(1, parts.length);
  } catch {
    return 1;
  }
}

function getGaps(container: HTMLElement): { rowGap: number; colGap: number } {
  try {
    const cs = window.getComputedStyle(container);
    const rowGap = parsePx(cs.rowGap || cs.gap || "0");
    const colGap = parsePx(cs.columnGap || cs.gap || "0");
    return { rowGap, colGap };
  } catch {
    return { rowGap: 0, colGap: 0 };
  }
}

function nowMs(): number {
  try {
    return Math.floor(performance.now());
  } catch {
    return Date.now();
  }
}

export function createVirtualGrid<T>(opts: VirtualGridOptions<T>): VirtualGridController<T> {
  const container = opts.container;
  const prevPosition = container.style.position;
  const prevHeight = container.style.height;
  if (!container.style.position) container.style.position = "relative";
  let items = opts.items;
  const renderItem = opts.renderItem;
  const baseOverscan = Math.max(1, Math.floor(opts.overscanRows ?? 4));
  const perfLow = typeof document !== "undefined" && document.documentElement?.dataset?.acgPerf === "low";
  const overscanRows = perfLow ? Math.min(2, baseOverscan) : baseOverscan;

  let destroyed = false;
  let rowHeight = Math.max(0, Math.floor(opts.estimateRowHeight ?? 0));
  let cols = 1;
  let colWidth = 0;
  let rowGap = 0;
  let colGap = 0;

  // index -> element
  const mounted = new Map<number, HTMLElement>();

  let rafId: number | null = null;
  let lastLayoutAt = 0;

  const clearMountedOutside = (minIndex: number, maxIndex: number) => {
    for (const [idx, el] of mounted) {
      if (idx >= minIndex && idx <= maxIndex) continue;
      mounted.delete(idx);
      el.remove();
    }
  };

  const ensureLayout = () => {
    const t = nowMs();
    // 降低连续 resize/scroll 时的重复 layout 计算开销
    if (t - lastLayoutAt < 32 && rowHeight > 0) return;
    lastLayoutAt = t;

    cols = countGridColumns(container);
    const gaps = getGaps(container);
    rowGap = gaps.rowGap;
    colGap = gaps.colGap;

    const width = container.getBoundingClientRect().width;
    colWidth = cols > 0 ? (width - colGap * (cols - 1)) / cols : width;
    if (!Number.isFinite(colWidth) || colWidth <= 0) colWidth = Math.max(0, width);

    if (rowHeight <= 0 && items.length > 0) {
      const sample = renderItem(items[0]);
      sample.style.position = "absolute";
      sample.style.visibility = "hidden";
      sample.style.pointerEvents = "none";
      sample.style.left = "0";
      sample.style.top = "0";
      sample.style.width = `${Math.floor(colWidth)}px`;
      container.appendChild(sample);
      rowHeight = Math.max(1, Math.ceil(sample.getBoundingClientRect().height));
      sample.remove();
    }
  };

  const setContainerHeight = () => {
    const total = items.length;
    if (total <= 0 || rowHeight <= 0) {
      container.style.height = "";
      return;
    }
    const rows = Math.ceil(total / cols);
    const stride = rowHeight + rowGap;
    const height = Math.max(0, rows * stride - rowGap);
    container.style.height = `${Math.ceil(height)}px`;
  };

  const renderRange = (startIndex: number, endIndex: number) => {
    if (destroyed) return;
    if (items.length === 0) {
      clearMountedOutside(0, -1);
      container.style.height = "";
      return;
    }

    ensureLayout();
    setContainerHeight();

    const safeStart = Math.max(0, Math.min(items.length - 1, startIndex));
    const safeEnd = Math.max(0, Math.min(items.length - 1, endIndex));
    const minIndex = Math.min(safeStart, safeEnd);
    const maxIndex = Math.max(safeStart, safeEnd);

    clearMountedOutside(minIndex, maxIndex);

    for (let i = minIndex; i <= maxIndex; i += 1) {
      if (mounted.has(i)) continue;
      const item = items[i];
      if (item == null) continue;
      const el = renderItem(item);
      el.style.position = "absolute";
      el.style.width = `${Math.floor(colWidth)}px`;
      container.appendChild(el);
      mounted.set(i, el);
    }

    // 定位：统一在一轮里完成，减少 layout thrash
    for (let i = minIndex; i <= maxIndex; i += 1) {
      const el = mounted.get(i);
      if (!el) continue;
      const row = Math.floor(i / cols);
      const col = i - row * cols;
      const top = row * (rowHeight + rowGap);
      const left = col * (colWidth + colGap);
      el.style.transform = `translate3d(${Math.floor(left)}px, ${Math.floor(top)}px, 0)`;
    }
  };

  const computeAndRender = () => {
    if (destroyed) return;
    if (items.length === 0) {
      renderRange(0, -1);
      return;
    }

    ensureLayout();
    if (rowHeight <= 0) {
      // 未测到高度时，先保守渲染一屏（避免空白）
      renderRange(0, Math.min(items.length - 1, cols * 6 - 1));
      return;
    }

    const rect = container.getBoundingClientRect();
    const topInDoc = rect.top + (window.scrollY || 0);
    const scrollTop = window.scrollY || 0;
    const viewportTop = Math.max(0, scrollTop - topInDoc);
    const viewportBottom = viewportTop + window.innerHeight;

    const stride = rowHeight + rowGap;
    const startRow = Math.max(0, Math.floor((viewportTop - overscanRows * stride) / stride));
    const endRow = Math.max(0, Math.floor((viewportBottom + overscanRows * stride) / stride));

    const startIndex = startRow * cols;
    const endIndex = Math.min(items.length - 1, (endRow + 1) * cols - 1);

    renderRange(startIndex, endIndex);
  };

  const schedule = () => {
    if (destroyed) return;
    if (rafId != null) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = null;
      computeAndRender();
    });
  };

  const onScroll = () => schedule();
  const onResize = () => schedule();

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);

  let ro: ResizeObserver | null = null;
  if ("ResizeObserver" in window) {
    try {
      ro = new ResizeObserver(() => schedule());
      ro.observe(container);
    } catch {
      ro = null;
    }
  }

  // 初始渲染
  computeAndRender();

  return {
    setItems(next: T[]) {
      items = Array.isArray(next) ? next : [];
      schedule();
    },
    renderNow() {
      computeAndRender();
    },
    destroy() {
      destroyed = true;
      if (rafId != null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      try {
        ro?.disconnect();
      } catch {
        // ignore
      }
      ro = null;
      mounted.clear();
      container.style.height = prevHeight;
      container.style.position = prevPosition;
    }
  };
}
