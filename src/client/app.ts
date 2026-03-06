import { isBlockedRemoteCoverUrl, toWeservImageUrl } from "../lib/cover";
import { href } from "../lib/href";
import { NETWORK, STORAGE_KEYS, UI, MS } from "./constants";
import { normalizeText, parseQuery } from "../lib/search/query";
import { bestInitialCoverSrc } from "./utils/cover";
import { isJapanese } from "./utils/lang";
import { fetchJsonPreferGzip } from "./utils/http";
import { copyToClipboard } from "./utils/clipboard";
import { createVirtualGrid, type VirtualGridController } from "./utils/virtual-grid";
import { maybeStartHealthMonitor } from "./utils/health";
import { track, wireTelemetry } from "./utils/telemetry";
import {
  sanitizeOneLine,
  sanitizeStack,
  wireGlobalErrorMonitoring,
  wirePerfMonitoring
} from "./utils/monitoring";
import {
  loadIds,
  loadJson,
  loadString,
  loadWords,
  normalizeWord,
  saveIds,
  saveJson,
  saveString,
  saveWords
} from "./state/storage";
import { wireTelemetryPrefs } from "./features/telemetry-prefs";
import { loadAccentMode, normalizeAccentMode, wireAccentMode } from "./features/accent";
import { loadThemeMode, wireThemeMode } from "./features/theme";
import { syncRadioGroupsFromButtons, wireRadioGroupKeyboardNav } from "./ui/radiogroup";

const BOOKMARK_KEY = STORAGE_KEYS.BOOKMARKS;
const READ_KEY = STORAGE_KEYS.READ;
const FOLLOWS_KEY = STORAGE_KEYS.FOLLOWS;
const BLOCKLIST_KEY = STORAGE_KEYS.BLOCKLIST;
const FILTERS_KEY = STORAGE_KEYS.FILTERS;
const VIEW_MODE_KEY = STORAGE_KEYS.VIEW_MODE;
const DENSITY_KEY = STORAGE_KEYS.DENSITY;
const DISABLED_SOURCES_KEY = STORAGE_KEYS.DISABLED_SOURCES;
const FOLLOWED_SOURCES_KEY = STORAGE_KEYS.FOLLOWED_SOURCES;
const VIEW_PRESETS_KEY = STORAGE_KEYS.VIEW_PRESETS;

type FilterStore = {
  version: 3;
  onlyFollowed: boolean;
  onlyFollowedSources: boolean;
  hideRead: boolean;
  onlyStableSources: boolean;
  dedup: boolean;
  timeLens: TimeLens;
  sortMode: SortMode;
};

type ThemeMode = "auto" | "light" | "dark";

type AccentMode = "neon" | "sakura" | "ocean" | "amber";

type SearchScope = "page" | "all";

type ViewMode = "grid" | "list";

type DensityMode = "comfort" | "compact";

type TimeLens = "all" | "2h" | "6h" | "24h";

type SortMode = "latest" | "pulse";

type ViewSnapshotV1 = {
  q: string;
  scope: SearchScope;
  filters: Omit<FilterStore, "version">;
  view: ViewMode;
  density: DensityMode;
  theme: ThemeMode;
  accent: AccentMode;
};

type ViewPresetV1 = {
  version: 1;
  id: string;
  name: string;
  createdAt: number;
  snapshot: ViewSnapshotV1;
};

type ViewPresetStoreV1 = {
  version: 1;
  presets: ViewPresetV1[];
};

function loadSearchScope(): SearchScope {
  try {
    const raw = loadString(STORAGE_KEYS.SEARCH_SCOPE);
    return raw === "all" || raw === "page" ? raw : "page";
  } catch {
    return "page";
  }
}

function saveSearchScope(scope: SearchScope) {
  try {
    saveString(STORAGE_KEYS.SEARCH_SCOPE, scope);
  } catch {
    // ignore
  }
}

let searchScope: SearchScope = loadSearchScope();
let cmdkModulePromise: Promise<{ openCommandPalette: () => void }> | null = null;

function requestOpenCommandPalette() {
  try {
    if (!cmdkModulePromise) {
      cmdkModulePromise = import("./features/cmdk") as Promise<{ openCommandPalette: () => void }>;
    }
    void cmdkModulePromise.then((m) => m.openCommandPalette());
  } catch {
    // ignore
  }
}

function getSearchScope(): SearchScope {
  return searchScope;
}

function setSearchScope(scope: SearchScope) {
  searchScope = scope;
  saveSearchScope(scope);
  try {
    document.documentElement.dataset.acgSearchScope = scope;
  } catch {
    // ignore
  }
  document.dispatchEvent(new CustomEvent("acg:search-scope-changed", { detail: { scope } }));
}

declare global {
  interface Window {
    __acgCoverError?: (img: HTMLImageElement) => void;
    __acgCoverLoad?: (img: HTMLImageElement) => void;
  }
}

function normalizeTimeLens(value: unknown): TimeLens {
  return value === "2h" || value === "6h" || value === "24h" || value === "all" ? value : "all";
}

function normalizeSortMode(value: unknown): SortMode {
  return value === "pulse" || value === "latest" ? value : "latest";
}

function loadFilters(): FilterStore {
  try {
    const parsed = loadJson<Record<string, unknown>>(FILTERS_KEY);
    const getBool = (key: string): boolean => parsed?.[key] === true;
    const get = (key: string): unknown => parsed?.[key];
    return {
      version: 3,
      onlyFollowed: getBool("onlyFollowed"),
      onlyFollowedSources: getBool("onlyFollowedSources"),
      hideRead: getBool("hideRead"),
      onlyStableSources: getBool("onlyStableSources"),
      dedup: getBool("dedup"),
      timeLens: normalizeTimeLens(get("timeLens")),
      sortMode: normalizeSortMode(get("sortMode"))
    };
  } catch {
    return {
      version: 3,
      onlyFollowed: false,
      onlyFollowedSources: false,
      hideRead: false,
      onlyStableSources: false,
      dedup: false,
      timeLens: "all",
      sortMode: "latest"
    };
  }
}

function saveFilters(filters: FilterStore) {
  try {
    saveJson(FILTERS_KEY, filters);
  } catch {
    // ignore
  }
}

function syncFilterDataset(filters: FilterStore) {
  try {
    const root = document.documentElement;
    root.dataset.acgLens = filters.timeLens;
    root.dataset.acgSort = filters.sortMode;
    root.dataset.acgDedup = filters.dedup ? "1" : "0";
    root.dataset.acgStable = filters.onlyStableSources ? "1" : "0";
  } catch {
    // ignore
  }
}

type ToastVariant = "info" | "success" | "error";

function getToastRoot(): HTMLElement {
  let root = document.querySelector<HTMLElement>("#acg-toast-root");
  if (root) return root;
  root = document.createElement("div");
  root.id = "acg-toast-root";
  root.className = "acg-toast-root";
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-atomic", "true");
  document.body.appendChild(root);
  return root;
}

function toast(params: { title: string; desc?: string; variant?: ToastVariant; timeoutMs?: number }) {
  const { title, desc, variant = "info", timeoutMs = 2200 } = params;
  try {
    const root = getToastRoot();
    const el = document.createElement("div");
    el.className = "acg-toast";
    el.dataset.variant = variant;

    const t = document.createElement("div");
    t.className = "acg-toast-title";
    t.textContent = title;
    el.appendChild(t);

    if (desc) {
      const d = document.createElement("div");
      d.className = "acg-toast-desc";
      d.textContent = desc;
      el.appendChild(d);
    }

    root.appendChild(el);
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      try {
        el.classList.add("is-leaving");
      } catch {
        // ignore
      }
      window.setTimeout(() => {
        try {
          el.remove();
        } catch {
          // ignore
        }
        try {
          if (root.childElementCount === 0) root.remove();
        } catch {
          // ignore
        }
      }, 180);
    };

    const timer = window.setTimeout(dispose, timeoutMs);
    el.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        window.clearTimeout(timer);
        dispose();
      },
      { once: true }
    );
  } catch {
    // ignore
  }
}

type ToastBridgeEventDetail = {
  title?: unknown;
  desc?: unknown;
  variant?: unknown;
  timeoutMs?: unknown;
};

function wireToastBridge() {
  document.addEventListener("acg:toast", (e) => {
    const detail = (e as CustomEvent).detail as ToastBridgeEventDetail | null | undefined;
    if (!detail || typeof detail !== "object") return;
    const title = typeof detail.title === "string" ? detail.title : "";
    if (!title) return;
    const desc = typeof detail.desc === "string" ? detail.desc : undefined;
    const variantRaw = detail.variant;
    const variant: ToastVariant | undefined =
      variantRaw === "info" || variantRaw === "success" || variantRaw === "error" ? variantRaw : undefined;
    const timeoutMsRaw = detail.timeoutMs;
    const timeoutMs =
      typeof timeoutMsRaw === "number" && Number.isFinite(timeoutMsRaw) ? timeoutMsRaw : undefined;
    toast({ title, desc, variant, timeoutMs });
  });
}

function wireNetworkStatusToasts() {
  let lastToastAt = 0;
  const MIN_GAP_MS = 3500;

  const emit = (params: { title: string; desc?: string; variant?: ToastVariant; timeoutMs?: number }) => {
    const now = Date.now();
    if (now - lastToastAt < MIN_GAP_MS) return;
    lastToastAt = now;
    toast(params);
  };

  const onOffline = () => {
    emit({
      title: isJapanese() ? "オフライン" : "离线模式",
      desc: isJapanese()
        ? "ネットワークが利用できません。キャッシュがあれば表示できます。"
        : "网络不可用：如已缓存，可继续浏览最近访问过的页面。",
      variant: "info",
      timeoutMs: 2400
    });
  };

  const onOnline = () => {
    emit({
      title: isJapanese() ? "オンラインに復帰" : "网络已恢复",
      desc: isJapanese() ? "最新データは再読み込みで取得できます。" : "刷新即可获取最新数据。",
      variant: "success",
      timeoutMs: 1800
    });
  };

  window.addEventListener("offline", onOffline);
  window.addEventListener("online", onOnline);

  // 首次进入页面时，如果已处于离线状态，给一次轻提示。
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      window.setTimeout(onOffline, 420);
    }
  } catch {
    // ignore
  }
}

function pop(el: HTMLElement) {
  el.classList.remove("pop");
  window.requestAnimationFrame(() => {
    el.classList.add("pop");
  });
}

function setBookmarkButtonState(button: HTMLButtonElement, on: boolean) {
  button.setAttribute("aria-pressed", on ? "true" : "false");
  button.classList.toggle("ring-2", on);
  button.classList.toggle("ring-violet-400/50", on);
}

function applyReadState(readIds: Set<string>) {
  const cards = document.querySelectorAll<HTMLElement>("[data-post-id]");
  for (const card of cards) {
    const id = card.dataset.postId ?? "";
    const isRead = readIds.has(id);
    if (isRead) card.setAttribute("data-read", "true");
    else card.removeAttribute("data-read");
  }
}

function wireBookmarks(bookmarkIds: Set<string>) {
  const apply = () => {
    const buttons = document.querySelectorAll<HTMLButtonElement>("button[data-bookmark-id]");
    for (const btn of buttons) {
      const id = btn.dataset.bookmarkId ?? "";
      setBookmarkButtonState(btn, bookmarkIds.has(id));
    }
  };

  apply();

  document.addEventListener("click", (e) => {
    if (e.defaultPrevented) return;
    if (!(e.target instanceof HTMLElement)) return;
    const el = e.target.closest("button[data-bookmark-id]");
    if (!(el instanceof HTMLButtonElement)) return;

    const id = el.dataset.bookmarkId ?? "";
    if (!id) return;

    if (bookmarkIds.has(id)) bookmarkIds.delete(id);
    else bookmarkIds.add(id);
    saveIds(BOOKMARK_KEY, bookmarkIds);
    const on = bookmarkIds.has(id);
    setBookmarkButtonState(el, on);
    pop(el);
    track({ type: "bookmark_toggle", data: { id, on } });
    toast({
      title: on
        ? isJapanese()
          ? "ブックマークしました"
          : "已收藏"
        : isJapanese()
          ? "已取消ブックマーク"
          : "已取消收藏",
      variant: on ? "success" : "info"
    });
    document.dispatchEvent(new CustomEvent("acg:bookmarks-changed"));
  });

  document.addEventListener("acg:bookmarks-changed", apply);
}

function wireTagChips() {
  const input = document.querySelector<HTMLInputElement>("#acg-search");
  if (!input) return;

  document.addEventListener("click", (e) => {
    if (e.defaultPrevented) return;
    if (!(e.target instanceof HTMLElement)) return;
    const el = e.target.closest("button[data-tag]");
    if (!(el instanceof HTMLButtonElement)) return;

    const tag = el.dataset.tag ?? "";
    if (!tag) return;
    input.value = tag;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
    track({ type: "tag_filter", data: { tag } });
  });
}

function wireSearchSyntaxGuide() {
  const input = document.querySelector<HTMLInputElement>("#acg-search");
  if (!input) return;
  const wrap = input.closest<HTMLElement>(".acg-home-search-wrap");
  if (!wrap) return;
  if (wrap.querySelector("[data-search-guide]")) return;

  const isJa = isJapanese();
  const chips = isJa
    ? [
        { label: "tag:コラボ", preset: "tag:コラボ" },
        { label: "source:animate", preset: "source:animate" },
        { label: "cat:anime", preset: "cat:anime" },
        { label: "after:2026-01-01", preset: "after:2026-01-01" },
        { label: "is:unread", preset: "is:unread" },
        { label: "-tag:ネタバレ", preset: "-tag:ネタバレ" }
      ]
    : [
        { label: "tag:联动", preset: "tag:联动" },
        { label: "source:bilibili", preset: "source:bilibili" },
        { label: "cat:anime", preset: "cat:anime" },
        { label: "after:2026-01-01", preset: "after:2026-01-01" },
        { label: "is:unread", preset: "is:unread" },
        { label: "-tag:剧透", preset: "-tag:剧透" }
      ];
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const scenePresets: Array<{ label: string; preset: string; lens?: TimeLens; sort?: SortMode }> = isJa
    ? [
        { label: "未読のみ", preset: "is:unread" },
        { label: "24h + Pulse", preset: `after:${last24h}`, lens: "24h", sort: "pulse" },
        { label: "アニメのみ", preset: "cat:anime" },
        { label: "ソース指定", preset: "source:animate" }
      ]
    : [
        { label: "只看未读", preset: "is:unread" },
        { label: "24h + 热度", preset: `after:${last24h}`, lens: "24h", sort: "pulse" },
        { label: "只看动画", preset: "cat:anime" },
        { label: "按来源筛选", preset: "source:bilibili" }
      ];

  const row = document.createElement("div");
  row.className =
    "acg-query-hints acg-hscroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0";
  row.setAttribute("data-search-guide", "chips");

  for (const chip of chips) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "acg-chip acg-query-chip rounded-full px-3 py-1 text-xs font-semibold clickable";
    btn.dataset.searchPreset = chip.preset;
    btn.textContent = chip.label;
    btn.title = chip.preset;
    row.appendChild(btn);
  }

  const sceneRow = document.createElement("div");
  sceneRow.className =
    "acg-query-scenes acg-hscroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0";
  sceneRow.setAttribute("data-search-guide", "scenes");
  for (const scene of scenePresets) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "acg-chip acg-query-scene-chip rounded-full px-3 py-1 text-xs font-semibold clickable";
    btn.dataset.searchPreset = scene.preset;
    if (scene.lens) btn.dataset.searchPresetLens = scene.lens;
    if (scene.sort) btn.dataset.searchPresetSort = scene.sort;
    btn.textContent = scene.label;
    btn.title = scene.preset;
    sceneRow.appendChild(btn);
  }

  const note = document.createElement("p");
  note.className = "acg-query-hint-note mt-2 text-[11px] leading-relaxed text-slate-600";
  note.setAttribute("data-search-guide", "note");
  note.textContent = isJa
    ? "構文ガイド: tag/source/cat/after/is:unread（先頭に - を付けると除外）"
    : "语法提示：tag/source/cat/after/is:unread（前缀 - 表示排除）";

  wrap.appendChild(row);
  wrap.appendChild(sceneRow);
  wrap.appendChild(note);
  document.dispatchEvent(new CustomEvent("acg:search-presets-mounted"));
}

function wirePostCardInteractions() {
  const cardSelector = ".acg-post-card[data-post-id], .acg-post-link-item[data-post-id]";
  const interactiveSelector = "a[href],button,input,textarea,select,label,[role='button'],[role='link']";

  const getPrimaryLink = (card: HTMLElement): HTMLAnchorElement | null =>
    card.querySelector<HTMLAnchorElement>("a.acg-post-card-title[href], a.acg-post-link-anchor[href]") ??
    card.querySelector<HTMLAnchorElement>("a[href]:not([target])");

  const openCard = (card: HTMLElement, openInNewTab = false): boolean => {
    const link = getPrimaryLink(card);
    if (!link?.href) return false;
    try {
      if (openInNewTab) window.open(link.href, "_blank", "noopener");
      else window.location.href = link.href;
      return true;
    } catch {
      return false;
    }
  };

  const syncFocusableCards = () => {
    const cards = document.querySelectorAll<HTMLElement>(cardSelector);
    for (const card of cards) {
      card.classList.add("acg-card-focusable");
      if (!card.hasAttribute("tabindex")) card.tabIndex = 0;
    }
  };

  const focusAdjacent = (from: HTMLElement, delta: -1 | 1) => {
    const cards = [...document.querySelectorAll<HTMLElement>(cardSelector)].filter(
      (card) => !card.classList.contains("hidden")
    );
    const index = cards.indexOf(from);
    if (index < 0) return;
    const next = cards[Math.max(0, Math.min(cards.length - 1, index + delta))];
    if (!next || next === from) return;
    try {
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch {
      // ignore
    }
  };

  const pressedByPointer = new Map<number, HTMLElement>();
  const releasePressedCard = (pointerId: number, delayMs = 0) => {
    const card = pressedByPointer.get(pointerId);
    if (!card) return;
    pressedByPointer.delete(pointerId);
    const clear = () => card.classList.remove("acg-card-touch-active");
    if (delayMs > 0) window.setTimeout(clear, delayMs);
    else clear();
  };
  const releaseAllPressedCards = () => {
    for (const card of pressedByPointer.values()) card.classList.remove("acg-card-touch-active");
    pressedByPointer.clear();
  };

  syncFocusableCards();
  document.addEventListener("acg:bookmarks-changed", () => {
    runWhenIdle(syncFocusableCards, 360);
  });

  document.addEventListener("pointerdown", (e) => {
    if (e.defaultPrevented) return;
    if (e.pointerType === "mouse") return;
    if (!(e.target instanceof HTMLElement)) return;
    const card = e.target.closest<HTMLElement>(cardSelector);
    if (!card) return;
    if (e.target.closest(interactiveSelector)) return;
    card.classList.add("acg-card-touch-active");
    pressedByPointer.set(e.pointerId, card);
  });

  document.addEventListener("pointerup", (e) => {
    releasePressedCard(e.pointerId, 88);
  });
  document.addEventListener("pointercancel", (e) => {
    releasePressedCard(e.pointerId);
  });
  document.addEventListener(
    "scroll",
    () => {
      if (pressedByPointer.size === 0) return;
      releaseAllPressedCards();
    },
    { passive: true, capture: true }
  );

  document.addEventListener("click", (e) => {
    if (e.defaultPrevented) return;
    if (!(e.target instanceof HTMLElement)) return;
    const card = e.target.closest<HTMLElement>(cardSelector);
    if (!card) return;
    if (e.target.closest(interactiveSelector)) return;
    if (window.getSelection()?.type === "Range") return;
    e.preventDefault();
    openCard(card, e.metaKey || e.ctrlKey);
  });

  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!(e.target instanceof HTMLElement)) return;
    const card = e.target.closest<HTMLElement>(cardSelector);
    if (!card || e.target !== card) return;

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openCard(card);
      return;
    }

    if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key.toLowerCase() === "j") {
      e.preventDefault();
      focusAdjacent(card, 1);
      return;
    }

    if (e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key.toLowerCase() === "k") {
      e.preventDefault();
      focusAdjacent(card, -1);
    }
  });
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return target.isContentEditable;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  } catch {
    return false;
  }
}

function maybeAutoTunePerfMode() {
  const el = document.documentElement;
  if (el.dataset.acgPerf === "low") return;
  if (!("requestAnimationFrame" in window)) return;

  let frames = 0;
  let start = 0;

  const targetDurationMs = 1200;
  const tick = (t: number) => {
    frames += 1;
    if (!start) start = t;
    const dt = t - start;
    if (dt >= targetDurationMs) {
      const fps = (frames * 1000) / Math.max(1, dt);
      if (fps < 55) {
        try {
          el.dataset.acgPerf = "low";
        } catch {
          // ignore
        }
        track({ type: "perf_auto_low", data: { fps: Math.round(fps * 10) / 10 } });
      }
      return;
    }
    window.requestAnimationFrame(tick);
  };

  window.requestAnimationFrame(tick);
}

function loadViewMode(): ViewMode {
  try {
    const raw = loadString(VIEW_MODE_KEY);
    return raw === "grid" || raw === "list" ? raw : "grid";
  } catch {
    return "grid";
  }
}

function saveViewMode(mode: ViewMode) {
  try {
    saveString(VIEW_MODE_KEY, mode);
  } catch {
    // ignore
  }
}

function applyViewMode(mode: ViewMode) {
  try {
    document.documentElement.dataset.acgView = mode;
  } catch {
    // ignore
  }
}

function wireViewMode() {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-view-mode]")];

  const apply = (mode: ViewMode) => {
    applyViewMode(mode);
    for (const btn of buttons) {
      const active = (btn.dataset.viewMode ?? "") === mode;
      btn.dataset.active = active ? "true" : "false";
      btn.setAttribute("aria-checked", active ? "true" : "false");
    }
    syncRadioGroupsFromButtons(buttons);
  };

  const mode = loadViewMode();
  apply(mode);

  if (buttons.length > 0) {
    document.addEventListener("click", (e) => {
      if (e.defaultPrevented) return;
      if (!(e.target instanceof HTMLElement)) return;
      const el = e.target.closest<HTMLButtonElement>("[data-view-mode]");
      if (!el) return;
      const next = el.dataset.viewMode;
      if (next !== "grid" && next !== "list") return;
      e.preventDefault();
      saveViewMode(next);
      apply(next);
    });
  }
}

function loadDensityMode(): DensityMode {
  try {
    const raw = loadString(DENSITY_KEY);
    return raw === "comfort" || raw === "compact" ? raw : "comfort";
  } catch {
    return "comfort";
  }
}

function saveDensityMode(mode: DensityMode) {
  try {
    saveString(DENSITY_KEY, mode);
  } catch {
    // ignore
  }
}

function applyDensityMode(mode: DensityMode) {
  try {
    document.documentElement.dataset.acgDensity = mode;
  } catch {
    // ignore
  }
}

function wireDensityMode() {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-density-mode]")];

  const apply = (mode: DensityMode) => {
    applyDensityMode(mode);
    for (const btn of buttons) {
      const active = (btn.dataset.densityMode ?? "") === mode;
      btn.dataset.active = active ? "true" : "false";
      btn.setAttribute("aria-checked", active ? "true" : "false");
    }
    syncRadioGroupsFromButtons(buttons);
  };

  const mode = loadDensityMode();
  apply(mode);

  if (buttons.length > 0) {
    document.addEventListener("click", (e) => {
      if (e.defaultPrevented) return;
      if (!(e.target instanceof HTMLElement)) return;
      const el = e.target.closest<HTMLButtonElement>("[data-density-mode]");
      if (!el) return;
      const next = el.dataset.densityMode;
      if (next !== "comfort" && next !== "compact") return;
      e.preventDefault();
      saveDensityMode(next);
      apply(next);
    });
  }
}

function runWhenIdle(task: () => void, timeoutMs: number = UI.IDLE_DEFAULT_TIMEOUT_MS) {
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
    Math.min(UI.IDLE_FALLBACK_DELAY_MS, Math.max(0, timeoutMs))
  );
}

function getCoverContainer(img: HTMLElement): HTMLElement | null {
  return (
    img.closest<HTMLElement>("[data-has-cover]") ??
    img.closest<HTMLElement>("[data-carousel-slide]") ??
    img.closest<HTMLElement>("[data-post-id]") ??
    img.closest<HTMLElement>("a") ??
    null
  );
}

function withCacheBust(url: string, key = "acg"): string {
  try {
    const u = new URL(url);
    u.searchParams.set(key, String(Date.now()));
    return u.toString();
  } catch {
    return url;
  }
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function isCoverProxyUrl(url: string): boolean {
  return /^https:\/\/(images\.weserv\.nl|wsrv\.nl)\//i.test(url);
}

function toCoverProxyUrl(url: string, width = 1200, host?: string): string | null {
  if (!isHttpUrl(url)) return null;
  if (isCoverProxyUrl(url)) return null;
  return toWeservImageUrl({ url, width, host });
}

function handleCoverLoad(img: HTMLImageElement) {
  try {
    const container = getCoverContainer(img);
    container?.classList.remove("cover-failed");
    container?.classList.add("cover-loaded");
    img.style.opacity = "";
    img.style.pointerEvents = "";
  } catch {
    // ignore
  }
}

function handleCoverError(img: HTMLImageElement) {
  try {
    const container = getCoverContainer(img);
    const attempted = img.currentSrc ?? img.src;
    const original = img.dataset.acgCoverOriginalSrc ?? attempted;
    if (!img.dataset.acgCoverOriginalSrc) img.dataset.acgCoverOriginalSrc = original;

    const retry = Number(img.dataset.acgCoverRetry ?? "0");
    const canRetry = retry < 4;

    if (canRetry) {
      // step 1：https 页面里遇到 http 图片，优先尝试升级（部分站点两者都存在）
      if (retry === 0 && attempted.startsWith("http://") && window.location.protocol === "https:") {
        img.dataset.acgCoverRetry = "1";
        container?.classList.remove("cover-failed");
        img.style.opacity = "";
        img.style.pointerEvents = "";
        img.src = `https://${attempted.slice("http://".length)}`;
        return;
      }

      // step 2：有些图床对 referrer 更敏感，失败后放宽一次 + cache bust
      if (img.referrerPolicy === "no-referrer" && !isCoverProxyUrl(attempted)) {
        img.dataset.acgCoverRetry = String(retry + 1);
        img.referrerPolicy = "strict-origin-when-cross-origin";
        container?.classList.remove("cover-failed");
        img.style.opacity = "";
        img.style.pointerEvents = "";
        img.src = withCacheBust(original);
        return;
      }

      // step 3：封面代理兜底（绕开混合内容/部分站点 hotlink 限制）
      // 注意：不默认全站走代理，仅在失败后触发。
      const proxy = toCoverProxyUrl(original, 1200, "images.weserv.nl");
      if (proxy && !isCoverProxyUrl(attempted)) {
        img.dataset.acgCoverRetry = String(retry + 1);
        container?.classList.remove("cover-failed");
        img.style.opacity = "";
        img.style.pointerEvents = "";
        img.src = withCacheBust(proxy, "acg_p");
        return;
      }

      // step 4：常规 cache bust（网络抖动/中间缓存偶发）
      img.dataset.acgCoverRetry = String(retry + 1);
      container?.classList.remove("cover-failed");
      img.style.opacity = "";
      img.style.pointerEvents = "";
      // proxy 已失败：切换 Weserv 域名再试一次（部分网络环境下可用性不同）
      if (isCoverProxyUrl(attempted) && !img.dataset.acgCoverProxyAlt) {
        const host = attempted.startsWith("https://wsrv.nl/") ? "images.weserv.nl" : "wsrv.nl";
        const alt = toCoverProxyUrl(original, 1200, host);
        if (alt) {
          img.dataset.acgCoverProxyAlt = "1";
          img.src = withCacheBust(alt, "acg_p2");
          return;
        }
      }
      img.src = withCacheBust(attempted);
      return;
    }

    container?.classList.add("cover-failed");
    img.style.opacity = "0";
    img.style.pointerEvents = "none";
  } catch {
    // ignore
  }
}

function hydrateCoverStates() {
  try {
    const imgs = document.querySelectorAll<HTMLImageElement>("img[data-acg-cover]");
    for (const img of imgs) {
      if (!img.complete) continue;
      // 部分封面（尤其是同源本地 covers）可能在 DOMContentLoaded 前就已加载完成，
      // 此时 onload handler 会因为 __acgCoverLoad 尚未挂载而“错过”标记 cover-loaded。
      // 这里统一补齐：成功的 -> cover-loaded；失败的 -> 走重试链路。
      if (img.naturalWidth > 0) handleCoverLoad(img);
      else handleCoverError(img);
    }
  } catch {
    // ignore
  }
}

function wireCoverRetry() {
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented) return;
    if (!(e.target instanceof HTMLElement)) return;
    const btn = e.target.closest("button[data-cover-retry]");
    if (!(btn instanceof HTMLButtonElement)) return;

    e.preventDefault();
    e.stopPropagation();

    try {
      btn.classList.remove("is-spinning");
      window.requestAnimationFrame(() => {
        btn.classList.add("is-spinning");
        window.setTimeout(() => btn.classList.remove("is-spinning"), 650);
      });
    } catch {
      // ignore
    }

    const scope =
      btn.closest<HTMLElement>("[data-carousel-slide]") ??
      btn.closest<HTMLElement>("[data-has-cover]") ??
      btn.closest<HTMLElement>("[data-post-id]");
    if (!scope) return;
    const postId = scope.dataset.postId ?? "";
    if (postId) track({ type: "cover_retry", data: { id: postId } });

    const img = scope.querySelector<HTMLImageElement>("img[data-acg-cover]");
    if (!img) {
      toast({ title: isJapanese() ? "画像が見つかりません" : "未找到封面图", variant: "error" });
      return;
    }

    const original = img.dataset.acgCoverOriginalSrc ?? img.currentSrc ?? img.src;
    if (original) img.dataset.acgCoverOriginalSrc = original;
    img.dataset.acgCoverRetry = "0";
    if (img.dataset.acgCoverProxyAlt) delete img.dataset.acgCoverProxyAlt;
    img.referrerPolicy = "no-referrer";

    scope.classList.remove("cover-failed");
    scope.classList.remove("cover-loaded");
    img.style.opacity = "";
    img.style.pointerEvents = "";

    img.src = withCacheBust(bestInitialCoverSrc(original), "acg_retry");
    toast({
      title: isJapanese() ? "画像を再試行中…" : "正在重试封面…",
      variant: "info",
      timeoutMs: UI.TOAST_HINT_TIMEOUT_MS
    });
  });
}

function wireBackToTop() {
  try {
    const button = document.createElement("button");
    button.type = "button";
    button.id = "acg-back-to-top";
    button.className = "acg-fab glass clickable";
    button.hidden = true;
    button.setAttribute("aria-label", isJapanese() ? "トップへ戻る" : "回到顶部");

    const icon = document.createElement("span");
    icon.className = "acg-fab-icon";
    icon.appendChild(createUiIcon({ name: "arrow-up", size: 18 }));

    const label = document.createElement("span");
    label.className = "acg-fab-label";
    label.textContent = isJapanese() ? "トップ" : "顶部";

    button.appendChild(icon);
    button.appendChild(label);
    document.body.appendChild(button);

    button.addEventListener("click", () => {
      const behavior = prefersReducedMotion() ? "auto" : "smooth";
      window.scrollTo({ top: 0, behavior });
    });

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        button.hidden = window.scrollY < UI.BACK_TO_TOP_SHOW_SCROLL_Y;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  } catch {
    // ignore
  }
}

function wireMobileQuickActions() {
  const searchInput = document.querySelector<HTMLInputElement>("#acg-search");
  const hasSearch = Boolean(searchInput);
  const hasPrefs = Boolean(document.querySelector<HTMLElement>("[data-open-prefs]"));
  if (!hasSearch && !hasPrefs) return;

  const isJa = isJapanese();
  const root = document.documentElement;
  const host = document.createElement("div");
  host.id = "acg-mobile-quick-actions";
  host.className = "acg-mobile-quick-actions";
  host.hidden = true;

  const makeButton = (params: {
    action: "search" | "prefs";
    icon: "search" | "sliders";
    label: string;
    title: string;
  }): HTMLButtonElement => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "acg-mobile-quick-action acg-icon-fab clickable";
    btn.dataset.mobileAction = params.action;
    btn.setAttribute("aria-label", params.title);
    btn.title = params.title;

    const iconWrap = document.createElement("span");
    iconWrap.className = "acg-mobile-quick-action-icon";
    iconWrap.appendChild(createUiIcon({ name: params.icon, size: 16 }));
    btn.appendChild(iconWrap);

    const label = document.createElement("span");
    label.className = "acg-mobile-quick-action-label";
    label.textContent = params.label;
    btn.appendChild(label);
    return btn;
  };

  const searchBtn = hasSearch
    ? makeButton({
        action: "search",
        icon: "search",
        label: isJa ? "検索" : "搜索",
        title: isJa ? "検索欄へ移動" : "回到搜索框"
      })
    : null;
  const prefsBtn = hasPrefs
    ? makeButton({
        action: "prefs",
        icon: "sliders",
        label: isJa ? "絞込" : "筛选",
        title: isJa ? "絞り込みを開く" : "打开筛选面板"
      })
    : null;
  if (searchBtn) searchBtn.setAttribute("aria-controls", "acg-search");
  if (prefsBtn) {
    prefsBtn.setAttribute("aria-controls", "acg-prefs");
    prefsBtn.setAttribute("aria-haspopup", "dialog");
  }
  if (searchBtn) searchBtn.setAttribute("aria-pressed", "false");
  if (prefsBtn) prefsBtn.setAttribute("aria-pressed", "false");
  if (searchBtn) host.appendChild(searchBtn);
  if (prefsBtn) host.appendChild(prefsBtn);
  if (host.childElementCount === 0) return;
  document.body.appendChild(host);

  const focusSearch = () => {
    if (!searchInput) return;
    const behavior = prefersReducedMotion() ? "auto" : "smooth";
    try {
      searchInput.scrollIntoView({ behavior, block: "center" });
      searchInput.focus();
      searchInput.select();
      flashSearchFocusCue();
    } catch {
      // ignore
    }
  };
  const openPrefs = () => {
    const opener = document.querySelector<HTMLElement>("[data-open-prefs]");
    if (!opener) return;
    opener.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  };

  searchBtn?.addEventListener("click", () => {
    focusSearch();
    track({ type: "mobile_quick_action", data: { action: "search" } });
  });
  prefsBtn?.addEventListener("click", () => {
    openPrefs();
    track({ type: "mobile_quick_action", data: { action: "prefs" } });
  });

  let searchVisible = false;
  if (searchInput && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        searchVisible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio > 0.2);
        scheduleUpdate();
      },
      { root: null, threshold: [0, 0.2, 0.48] }
    );
    io.observe(searchInput);
  }

  let ticking = false;
  const updateVisibility = () => {
    const isPhone = root.dataset.acgDevice === "phone";
    const drawerOpen = document.body.classList.contains("acg-no-scroll");
    const inputFocused = Boolean(searchInput && document.activeElement === searchInput);

    if (searchBtn) {
      const active = inputFocused ? "true" : "false";
      searchBtn.dataset.active = active;
      searchBtn.setAttribute("aria-pressed", active);
    }
    if (prefsBtn) {
      const active = drawerOpen ? "true" : "false";
      prefsBtn.dataset.active = active;
      prefsBtn.setAttribute("aria-pressed", active);
    }

    const shouldShow = isPhone && !drawerOpen && !inputFocused && !searchVisible && window.scrollY > 200;
    host.hidden = !shouldShow;
    host.classList.toggle("is-visible", shouldShow);
  };
  const scheduleUpdate = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      ticking = false;
      updateVisibility();
    });
  };

  window.addEventListener("scroll", scheduleUpdate, { passive: true });
  window.addEventListener("resize", scheduleUpdate);
  window.visualViewport?.addEventListener("resize", scheduleUpdate);
  document.addEventListener("acg:prefs-drawer-state", scheduleUpdate);
  document.addEventListener("focusin", scheduleUpdate);
  document.addEventListener("focusout", scheduleUpdate);
  scheduleUpdate();
}

function wireMobileDensityAutoTune() {
  const root = document.documentElement;
  let rafId = 0;

  const updateNow = () => {
    const isPhone = root.dataset.acgDevice === "phone";
    if (!isPhone) {
      delete root.dataset.acgPhoneNarrow;
      delete root.dataset.acgPhoneCompact;
      return;
    }

    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const shortSide = Math.min(vw || 0, vh || 0);
    const narrow = shortSide > 0 && shortSide <= 390;
    const compact = shortSide > 0 && shortSide <= 360;

    if (narrow) root.dataset.acgPhoneNarrow = "1";
    else delete root.dataset.acgPhoneNarrow;

    if (compact) root.dataset.acgPhoneCompact = "1";
    else delete root.dataset.acgPhoneCompact;
  };

  const schedule = () => {
    if (rafId) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      updateNow();
    });
  };

  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);
  window.visualViewport?.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("scroll", schedule);
  schedule();
}

function wireScrollPerfHints() {
  // 目标：滚动期临时降级昂贵效果（backdrop-filter / shimmer 等），让滚动更稳更顺；
  // 停止滚动后自动恢复质感。
  //
  // 约束：尽量低开销（passive + rAF 节流），避免把“优化”本身变成负担。
  try {
    const root = document.documentElement;
    if (!("requestAnimationFrame" in window)) return;

    let rafId = 0;
    let clearTimer: number | null = null;
    let scrolling = false;

    const markScrolling = () => {
      if (!scrolling) {
        scrolling = true;
        try {
          root.dataset.acgScroll = "1";
        } catch {
          // ignore
        }
      }

      if (clearTimer) window.clearTimeout(clearTimer);
      clearTimer = window.setTimeout(() => {
        scrolling = false;
        try {
          delete root.dataset.acgScroll;
        } catch {
          // ignore
        }
      }, 160);
    };

    const onAnyScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        markScrolling();
      });
    };

    // capture: true → 捕获所有滚动容器（scroll 事件不冒泡）
    document.addEventListener("scroll", onAnyScroll, { passive: true, capture: true });
  } catch {
    // ignore
  }
}

function wireCardInViewAnimations() {
  // 目标：低成本“入场”微动效（transform/opacity），让信息流更有层次；
  // 低性能设备或减少动效偏好时自动关闭。
  try {
    if (prefersReducedMotion()) return;
    if (!("IntersectionObserver" in window)) return;
    const root = document.documentElement;
    if (root.dataset.acgPerf === "low") return;

    runWhenIdle(() => {
      const cards = [...document.querySelectorAll<HTMLElement>(".acg-card.clickable:not(.stagger-item)")];
      if (cards.length === 0) return;
      // 极端情况下避免扫全量导致“首屏卡一下”
      if (cards.length > 240) return;

      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!(entry.target instanceof HTMLElement)) continue;
            if (!entry.isIntersecting && entry.intersectionRatio < 0.12) continue;
            entry.target.dataset.acgInview = "1";
            io.unobserve(entry.target);
          }
        },
        { root: null, rootMargin: "80px 0px", threshold: [0.12, 0.25] }
      );

      for (const el of cards) {
        if (el.dataset.acgInview) continue;
        el.dataset.acgInview = "0";
        io.observe(el);
      }
    }, 900);
  } catch {
    // ignore
  }
}

function wireSearchCounterA11y() {
  const count = document.querySelector<HTMLElement>("#acg-search-count");
  const unreadCount = document.querySelector<HTMLElement>("#acg-unread-count");
  const isJa = isJapanese();

  if (count) {
    count.setAttribute("aria-live", "polite");
    count.setAttribute("aria-atomic", "true");
    if (!count.hasAttribute("aria-label")) {
      count.setAttribute("aria-label", isJa ? "検索結果件数" : "搜索结果数量");
    }
  }

  if (unreadCount && !unreadCount.hasAttribute("aria-label")) {
    unreadCount.setAttribute("aria-label", isJa ? "未読件数" : "未读数量");
  }
}

let searchFocusCueTimer: number | null = null;
function flashSearchFocusCue() {
  const input = document.querySelector<HTMLInputElement>("#acg-search");
  if (!input) return;

  const wrap = input.closest<HTMLElement>(".acg-home-search-wrap");
  const count = document.querySelector<HTMLElement>("#acg-search-count");
  wrap?.classList.remove("acg-search-focus-cue");
  input.classList.remove("acg-search-focus-cue");
  count?.classList.remove("acg-count-bump");
  void input.offsetWidth;
  wrap?.classList.add("acg-search-focus-cue");
  input.classList.add("acg-search-focus-cue");
  count?.classList.add("acg-count-bump");

  if (searchFocusCueTimer != null) window.clearTimeout(searchFocusCueTimer);
  searchFocusCueTimer = window.setTimeout(() => {
    wrap?.classList.remove("acg-search-focus-cue");
    input.classList.remove("acg-search-focus-cue");
    count?.classList.remove("acg-count-bump");
    searchFocusCueTimer = null;
  }, 760);
}

function wireKeyboardShortcuts() {
  const input = document.querySelector<HTMLInputElement>("#acg-search");
  if (!input) return;

  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === "/" && !isTypingTarget(e.target)) {
      e.preventDefault();
      input.focus();
      input.select();
      flashSearchFocusCue();
      toast({
        title: isJapanese() ? "検索へフォーカス" : "已聚焦搜索",
        variant: "info",
        timeoutMs: UI.TOAST_HINT_TIMEOUT_MS
      });
      return;
    }

    if (e.key === "?" && !isTypingTarget(e.target)) {
      e.preventDefault();
      toast({
        title: isJapanese() ? "検索構文のヒント" : "搜索语法提示",
        desc: isJapanese()
          ? "例: tag:xxx / source:xxx / cat:anime / after:2025-12-01 / is:unread（反転は -tag:xxx など）"
          : "例: tag:xxx / source:xxx / cat:anime / after:2025-12-01 / is:unread（反选用 -tag:xxx 等）",
        variant: "info",
        timeoutMs: 3600
      });
      return;
    }

    if (e.key === "Escape" && document.activeElement === input) {
      if (input.value) {
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        toast({ title: isJapanese() ? "検索をクリアしました" : "已清空搜索", variant: "info" });
      }
      input.blur();
    }
  });
}

function wireCommandPaletteShortcut() {
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    if (e.altKey) return;
    if (!e.ctrlKey && !e.metaKey) return;
    if (String(e.key).toLowerCase() !== "k") return;
    e.preventDefault();
    requestOpenCommandPalette();
  });
}

function wireSearchClear() {
  const input = document.querySelector<HTMLInputElement>("#acg-search");
  const btn = document.querySelector<HTMLButtonElement>("#acg-search-clear");
  if (!input || !btn) return;

  const apply = () => {
    btn.hidden = input.value.trim().length === 0;
  };

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    try {
      input.focus();
      input.select();
    } catch {
      // ignore
    }
    apply();
    toast({
      title: isJapanese() ? "検索をクリアしました" : "已清空搜索",
      variant: "info",
      timeoutMs: UI.TOAST_HINT_TIMEOUT_MS
    });
  });

  input.addEventListener("input", apply);
  apply();
}

function wirePrefsDrawer() {
  const drawer = document.querySelector<HTMLElement>("[data-prefs-drawer]");
  if (!drawer) return;

  const openers = [...document.querySelectorAll<HTMLElement>("[data-open-prefs]")];
  const closers = [...drawer.querySelectorAll<HTMLElement>("[data-close-prefs]")];
  const panel = drawer.querySelector<HTMLElement>(".acg-prefs-drawer-panel");
  const dialog = panel ?? drawer;
  const liveRegionId = "acg-prefs-live-region";
  const dialogLabel = isJapanese() ? "絞り込み設定" : "筛选设置";
  const openedAnnouncement = isJapanese() ? "絞り込みパネルを開きました" : "已打开筛选面板";
  const closedAnnouncement = isJapanese() ? "絞り込みパネルを閉じました" : "已关闭筛选面板";
  let restoreFocusTarget: HTMLElement | null = null;
  let liveRegionTimer: number | null = null;

  const ensureLiveRegion = (): HTMLElement => {
    let region = document.querySelector<HTMLElement>(`#${liveRegionId}`);
    if (region) return region;
    region = document.createElement("div");
    region.id = liveRegionId;
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-atomic", "true");
    region.style.position = "fixed";
    region.style.width = "1px";
    region.style.height = "1px";
    region.style.margin = "-1px";
    region.style.padding = "0";
    region.style.border = "0";
    region.style.overflow = "hidden";
    region.style.clipPath = "inset(50%)";
    region.style.whiteSpace = "nowrap";
    region.style.pointerEvents = "none";
    document.body.appendChild(region);
    return region;
  };

  const announceDrawerState = (message: string) => {
    const region = ensureLiveRegion();
    region.textContent = "";
    if (liveRegionTimer) window.clearTimeout(liveRegionTimer);
    liveRegionTimer = window.setTimeout(() => {
      region.textContent = message;
    }, 16);
  };

  const ensureDialogA11y = () => {
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    if (!dialog.hasAttribute("tabindex")) dialog.setAttribute("tabindex", "-1");

    const title = dialog.querySelector<HTMLElement>("h1,h2,h3,h4,h5,h6");
    if (title) {
      if (!title.id) title.id = "acg-prefs-title";
      dialog.setAttribute("aria-labelledby", title.id);
      dialog.removeAttribute("aria-label");
    } else {
      dialog.removeAttribute("aria-labelledby");
      dialog.setAttribute("aria-label", dialogLabel);
    }
  };

  const getFocusableElements = (): HTMLElement[] => {
    const scope = panel ?? drawer;
    const selectors = [
      "a[href]",
      "area[href]",
      "input:not([disabled]):not([type='hidden'])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "button:not([disabled])",
      "[tabindex]:not([tabindex='-1'])"
    ].join(",");
    const all = [...scope.querySelectorAll<HTMLElement>(selectors)];
    return all.filter((el) => {
      if (el.hasAttribute("inert")) return false;
      if (el.getAttribute("aria-hidden") === "true") return false;
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    });
  };

  const emitDrawerState = () => {
    document.dispatchEvent(
      new CustomEvent("acg:prefs-drawer-state", {
        detail: { open: drawer.classList.contains("is-open") }
      })
    );
  };
  const clearPanelSwipeDrag = () => {
    if (!panel) return;
    delete panel.dataset.swipeDragging;
    panel.style.removeProperty("transform");
  };

  const syncA11y = () => {
    const open = drawer.classList.contains("is-open");
    if (!open) {
      drawer.setAttribute("aria-hidden", "true");
      drawer.setAttribute("inert", "");
      document.body.classList.remove("acg-no-scroll");
    } else {
      drawer.removeAttribute("aria-hidden");
      drawer.removeAttribute("inert");
    }
  };

  const open = (trigger?: EventTarget | null) => {
    if (trigger instanceof HTMLElement) restoreFocusTarget = trigger;
    else if (document.activeElement instanceof HTMLElement) restoreFocusTarget = document.activeElement;

    clearPanelSwipeDrag();
    ensureDialogA11y();
    drawer.classList.add("is-open");
    drawer.removeAttribute("inert");
    drawer.removeAttribute("aria-hidden");
    document.body.classList.add("acg-no-scroll");
    emitDrawerState();
    announceDrawerState(openedAnnouncement);

    window.setTimeout(() => {
      const focusTarget =
        drawer.querySelector<HTMLInputElement>("#acg-follow-input") ??
        drawer.querySelector<HTMLInputElement>("#acg-block-input") ??
        drawer.querySelector<HTMLInputElement>("#acg-only-followed");
      const fallbackFocus = getFocusableElements()[0] ?? dialog;
      try {
        (focusTarget ?? fallbackFocus)?.focus();
      } catch {
        // ignore
      }
    }, 0);
  };

  const close = (options?: { restoreFocus?: boolean }) => {
    const shouldRestoreFocus = options?.restoreFocus ?? true;
    clearPanelSwipeDrag();
    drawer.classList.remove("is-open");
    document.body.classList.remove("acg-no-scroll");
    drawer.setAttribute("aria-hidden", "true");
    drawer.setAttribute("inert", "");
    emitDrawerState();
    announceDrawerState(closedAnnouncement);

    if (!shouldRestoreFocus) return;
    const target = restoreFocusTarget;
    restoreFocusTarget = null;
    if (!target || !target.isConnected) return;
    window.setTimeout(() => {
      try {
        target.focus();
      } catch {
        // ignore
      }
    }, 0);
  };

  for (const el of openers) {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      open(e.currentTarget);
    });
  }

  for (const el of closers) {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      close();
    });
  }

  drawer.addEventListener("click", (e) => {
    if (e.target === drawer) close();
  });

  document.addEventListener("keydown", (e) => {
    if (!drawer.classList.contains("is-open")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab") return;

    const focusable = getFocusableElements();
    if (focusable.length === 0) {
      e.preventDefault();
      try {
        dialog.focus();
      } catch {
        // ignore
      }
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    const withinDialog = active instanceof HTMLElement && dialog.contains(active);
    if (e.shiftKey) {
      if (!withinDialog || active === first) {
        e.preventDefault();
        try {
          last.focus();
        } catch {
          // ignore
        }
      }
      return;
    }
    if (!withinDialog || active === last) {
      e.preventDefault();
      try {
        first.focus();
      } catch {
        // ignore
      }
    }
  });

  if (panel) {
    const SWIPE_CLOSE_THRESHOLD_PX = 72;
    const SWIPE_FLICK_MIN_PX = 28;
    const SWIPE_FLICK_VELOCITY = 0.52;
    const SWIPE_HANDLE_ZONE_PX = 90;
    let swipePointerId: number | null = null;
    let swipeStartX = 0;
    let swipeStartY = 0;
    let swipeStartAt = 0;

    const isPhoneDrawerUi = () => document.documentElement.dataset.acgDevice === "phone";
    const applyDrag = (dyRaw: number) => {
      const dy = Math.max(0, dyRaw);
      const eased = Math.min(150, dy * 0.88);
      panel.dataset.swipeDragging = "1";
      panel.style.transform = `translateY(${eased.toFixed(1)}px)`;
    };

    const resetSwipe = () => {
      if (swipePointerId != null) {
        try {
          panel.releasePointerCapture(swipePointerId);
        } catch {
          // ignore
        }
      }
      swipePointerId = null;
      swipeStartX = 0;
      swipeStartY = 0;
      swipeStartAt = 0;
      clearPanelSwipeDrag();
    };

    panel.addEventListener("pointerdown", (e) => {
      if (!isPhoneDrawerUi()) return;
      if (!drawer.classList.contains("is-open")) return;
      if (e.defaultPrevented) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!(e.target instanceof HTMLElement)) return;
      if (panel.scrollTop > 2) return;
      if (e.target.closest("input,textarea,select,button,a,[role='button'],[role='link']")) return;

      const rect = panel.getBoundingClientRect();
      if (e.clientY - rect.top > SWIPE_HANDLE_ZONE_PX) return;

      swipePointerId = e.pointerId;
      swipeStartX = e.clientX;
      swipeStartY = e.clientY;
      swipeStartAt = e.timeStamp || performance.now();
      try {
        panel.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    });

    panel.addEventListener("pointermove", (e) => {
      if (swipePointerId == null) return;
      if (e.pointerId !== swipePointerId) return;
      if (!drawer.classList.contains("is-open")) return;

      const dx = e.clientX - swipeStartX;
      const dy = e.clientY - swipeStartY;
      if (dy <= 0 || Math.abs(dy) < Math.abs(dx)) {
        applyDrag(0);
        return;
      }
      applyDrag(dy);
    });

    panel.addEventListener("pointerup", (e) => {
      if (swipePointerId == null) return;
      if (e.pointerId !== swipePointerId) return;

      const dx = e.clientX - swipeStartX;
      const dy = e.clientY - swipeStartY;
      const elapsed = Math.max(1, (e.timeStamp || performance.now()) - swipeStartAt);
      const velocity = dy / elapsed;
      const shouldClose =
        dy > Math.abs(dx) &&
        panel.scrollTop <= 12 &&
        (dy >= SWIPE_CLOSE_THRESHOLD_PX || (dy >= SWIPE_FLICK_MIN_PX && velocity >= SWIPE_FLICK_VELOCITY));

      resetSwipe();
      if (shouldClose) close();
    });

    panel.addEventListener("pointercancel", resetSwipe);
  }

  ensureDialogA11y();
  syncA11y();
  emitDrawerState();
}

function wireQuickToggles() {
  const buttons = [
    ...document.querySelectorAll<HTMLButtonElement>(
      "button[data-quick-toggle],button[data-quick-lens],button[data-quick-sort]"
    )
  ];
  if (buttons.length === 0) return;

  const onlyFollowed = document.querySelector<HTMLInputElement>("#acg-only-followed");
  const onlyFollowedSources = document.querySelector<HTMLInputElement>("#acg-only-followed-sources");
  const hideRead = document.querySelector<HTMLInputElement>("#acg-hide-read");
  const onlyStable = document.querySelector<HTMLInputElement>("#acg-only-stable-sources");
  const dedup = document.querySelector<HTMLInputElement>("#acg-dedup-view");
  const lensButtons = [...document.querySelectorAll<HTMLButtonElement>("button[data-time-lens]")];
  const sortButtons = [...document.querySelectorAll<HTMLButtonElement>("button[data-sort-mode]")];

  const getLens = (): TimeLens => (document.documentElement.dataset.acgLens as TimeLens | undefined) ?? "all";
  const getSort = (): SortMode =>
    (document.documentElement.dataset.acgSort as SortMode | undefined) ?? "latest";

  const apply = () => {
    const only = Boolean(onlyFollowed?.checked);
    const onlySources = Boolean(onlyFollowedSources?.checked);
    const hide = Boolean(hideRead?.checked);
    const stable = Boolean(onlyStable?.checked);
    const dedupEnabled = Boolean(dedup?.checked);
    const lens = getLens();
    const sort = getSort();
    for (const btn of buttons) {
      const kind = btn.dataset.quickToggle ?? "";
      const quickLens = btn.dataset.quickLens;
      const quickSort = btn.dataset.quickSort;
      const active =
        kind === "only-followed"
          ? only
          : kind === "only-followed-sources"
            ? onlySources
            : kind === "hide-read"
              ? hide
              : kind === "only-stable"
                ? stable
                : kind === "dedup"
                  ? dedupEnabled
                  : quickLens
                    ? quickLens === lens
                    : quickSort
                      ? quickSort === sort
                      : false;
      const activeStr = active ? "true" : "false";
      btn.dataset.active = activeStr;
      btn.setAttribute("aria-pressed", activeStr);
    }
  };

  const toggle = (
    kind: "only-followed" | "only-followed-sources" | "hide-read" | "only-stable" | "dedup"
  ) => {
    if (kind === "only-followed" && onlyFollowed) {
      onlyFollowed.checked = !onlyFollowed.checked;
      onlyFollowed.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (kind === "only-followed-sources" && onlyFollowedSources) {
      onlyFollowedSources.checked = !onlyFollowedSources.checked;
      onlyFollowedSources.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (kind === "hide-read" && hideRead) {
      hideRead.checked = !hideRead.checked;
      hideRead.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (kind === "only-stable" && onlyStable) {
      onlyStable.checked = !onlyStable.checked;
      onlyStable.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (kind === "dedup" && dedup) {
      dedup.checked = !dedup.checked;
      dedup.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  const setLens = (lens: TimeLens) => {
    const btn = lensButtons.find((b) => (b.dataset.timeLens ?? "") === lens);
    btn?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  };

  const setSort = (sort: SortMode) => {
    const btn = sortButtons.find((b) => (b.dataset.sortMode ?? "") === sort);
    btn?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  };

  document.addEventListener("click", (e) => {
    if (e.defaultPrevented) return;
    if (!(e.target instanceof HTMLElement)) return;
    const el = e.target.closest("button[data-quick-toggle],button[data-quick-lens],button[data-quick-sort]");
    if (!(el instanceof HTMLButtonElement)) return;

    const kind = el.dataset.quickToggle ?? "";
    const lens = el.dataset.quickLens as TimeLens | undefined;
    const sort = el.dataset.quickSort as SortMode | undefined;
    if (kind) {
      if (
        kind !== "only-followed" &&
        kind !== "only-followed-sources" &&
        kind !== "hide-read" &&
        kind !== "only-stable" &&
        kind !== "dedup"
      ) {
        return;
      }
      toggle(kind);
      apply();
      const enabled =
        kind === "only-followed"
          ? Boolean(onlyFollowed?.checked)
          : kind === "only-followed-sources"
            ? Boolean(onlyFollowedSources?.checked)
            : kind === "hide-read"
              ? Boolean(hideRead?.checked)
              : kind === "only-stable"
                ? Boolean(onlyStable?.checked)
                : Boolean(dedup?.checked);
      track({ type: "quick_toggle", data: { kind, enabled } });
      return;
    }

    if (lens) {
      const current = getLens();
      setLens(lens === current ? "all" : lens);
      apply();
      track({ type: "quick_lens", data: { lens: lens === current ? "all" : lens } });
      return;
    }

    if (sort) {
      const current = getSort();
      setSort(sort === current ? "latest" : sort);
      apply();
      track({ type: "quick_sort", data: { sort: sort === current ? "latest" : sort } });
    }
  });

  document.addEventListener("acg:filters-changed", apply);
  apply();
}

function focusSearchFromHash() {
  try {
    if (window.location.hash !== "#search") return;
    const input = document.querySelector<HTMLInputElement>("#acg-search");
    if (!input) return;
    const behavior = prefersReducedMotion() ? "auto" : "smooth";
    input.scrollIntoView({ behavior, block: "center" });
    input.focus();
    input.select();
    flashSearchFocusCue();
    // 清理 hash，避免返回/刷新时重复聚焦
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  } catch {
    // ignore
  }
}

function openPrefsFromHash() {
  try {
    if (window.location.hash !== "#prefs") return;
    const opener = document.querySelector<HTMLElement>("[data-open-prefs]");
    if (opener) {
      opener.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }
    // 清理 hash，避免返回/刷新时重复打开
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  } catch {
    // ignore
  }
}

function openCmdkFromHash() {
  try {
    if (window.location.hash !== "#cmdk") return;
    // 清理 hash，避免返回/刷新时重复打开
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  } catch {
    // ignore
    return;
  }

  requestOpenCommandPalette();
}

function handleHashIntents() {
  openPrefsFromHash();
  openCmdkFromHash();
  focusSearchFromHash();
}

function applySearchQueryFromUrl() {
  // Legacy alias: older deep links only carried `?q=...` and should keep working.
  // New view links (copy-view-link / view presets) use a richer snapshot and are
  // handled by applyViewSnapshotFromUrl().
  applyViewSnapshotFromUrl();
}

function applyViewSnapshotFromUrl() {
  let params: URLSearchParams | null = null;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    params = null;
  }

  if (!params) return;

  const viewKeys = [
    "only",
    "onlySources",
    "hide",
    "stable",
    "dedup",
    "lens",
    "sort",
    "view",
    "density",
    "theme",
    "accent",
    "scope"
  ] as const;

  const hasViewParams = viewKeys.some((k) => params.has(k));
  const q = (params.get("q") ?? "").trim();

  if (!q && !hasViewParams) return;

  const click = (selector: string): boolean => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return false;
    try {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      return true;
    } catch {
      try {
        el.click();
        return true;
      } catch {
        return false;
      }
    }
  };

  const setCheckbox = (selector: string, checked: boolean): boolean => {
    const el = document.querySelector<HTMLInputElement>(selector);
    if (!el) return false;
    try {
      el.checked = checked;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  };

  const setInputValue = (selector: string, value: string): boolean => {
    const el = document.querySelector<HTMLInputElement>(selector);
    if (!el) return false;
    try {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  };

  const cleanupUrl = (keys: readonly string[]) => {
    try {
      const u = new URL(window.location.href);
      for (const k of keys) u.searchParams.delete(k);
      window.history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch {
      // ignore
    }
  };

  // Backward-compat: `?q=...` should not wipe existing view prefs unless the
  // URL explicitly carries view params.
  if (!hasViewParams) {
    if (!q) return;
    setInputValue("#acg-search", q);
    try {
      document.querySelector<HTMLInputElement>("#acg-search")?.focus();
    } catch {
      // ignore
    }
    cleanupUrl(["q"]);
    return;
  }

  const getBool = (k: string): boolean => {
    const v = params.get(k);
    return v === "1" || v === "true";
  };

  const themeRaw = params.get("theme");
  const theme: ThemeMode = themeRaw === "light" || themeRaw === "dark" ? themeRaw : "auto";

  const snap: ViewSnapshotV1 = {
    q,
    scope: params.get("scope") === "all" ? "all" : "page",
    filters: {
      onlyFollowed: getBool("only"),
      onlyFollowedSources: getBool("onlySources"),
      hideRead: getBool("hide"),
      onlyStableSources: getBool("stable"),
      dedup: getBool("dedup"),
      timeLens: normalizeTimeLens(params.get("lens")),
      sortMode: normalizeSortMode(params.get("sort"))
    },
    view: params.get("view") === "list" ? "list" : "grid",
    density: params.get("density") === "compact" ? "compact" : "comfort",
    theme,
    accent: normalizeAccentMode(params.get("accent"))
  };

  try {
    setSearchScope(snap.scope);
  } catch {
    // ignore
  }

  setCheckbox("#acg-only-followed", snap.filters.onlyFollowed);
  setCheckbox("#acg-only-followed-sources", snap.filters.onlyFollowedSources);
  setCheckbox("#acg-hide-read", snap.filters.hideRead);
  setCheckbox("#acg-only-stable-sources", snap.filters.onlyStableSources);
  setCheckbox("#acg-dedup-view", snap.filters.dedup);

  click(`button[data-time-lens="${snap.filters.timeLens}"]`);
  click(`button[data-sort-mode="${snap.filters.sortMode}"]`);
  click(`button[data-view-mode="${snap.view}"]`);
  click(`button[data-density-mode="${snap.density}"]`);
  click(`button[data-theme-mode="${snap.theme}"]`);
  click(`button[data-accent-mode="${snap.accent}"]`);
  setInputValue("#acg-search", snap.q);

  try {
    document.dispatchEvent(new CustomEvent("acg:filters-changed"));
  } catch {
    // ignore
  }

  cleanupUrl(["q", ...viewKeys]);
}

function wireDeviceDebug() {
  const details = document.querySelector<HTMLDetailsElement>("#acg-device-debug-details");
  const pre = document.querySelector<HTMLElement>("#acg-device-debug");
  if (!details || !pre) return;

  let enabled = false;
  try {
    const params = new URLSearchParams(window.location.search);
    enabled = params.get("debug") === "1" || loadString("acg.debug") === "1";
  } catch {
    enabled = false;
  }

  if (!enabled) return;
  details.hidden = false;

  const lines: string[] = [];
  const el = document.documentElement;
  const vw = window.visualViewport
    ? `${Math.round(window.visualViewport.width)}x${Math.round(window.visualViewport.height)}`
    : "-";
  const inner = `${window.innerWidth}x${window.innerHeight}`;
  const screen = window.screen ? `${window.screen.width}x${window.screen.height}` : "-";
  const device = el.dataset.acgDevice ?? "-";
  const ua = (navigator.userAgent ?? "").replace(/\s+/g, " ").trim();
  type NavigatorUADataLike = { platform?: string; mobile?: boolean };
  type NavigatorWithUAData = Navigator & { userAgentData?: NavigatorUADataLike };
  const uaData = (navigator as NavigatorWithUAData).userAgentData;
  const uaDataPlatform = uaData?.platform ?? "-";
  const uaDataMobile = uaData?.mobile != null ? String(Boolean(uaData.mobile)) : "-";

  const screenShortSide = window.screen ? Math.min(window.screen.width, window.screen.height) : 0;
  const vvShortSide = window.visualViewport
    ? Math.min(window.visualViewport.width, window.visualViewport.height)
    : 0;
  const innerShortSide = Math.min(window.innerWidth || 0, window.innerHeight || 0);
  const candidates = [screenShortSide, vvShortSide, innerShortSide].filter((v) => v > 0);
  const shortSide = candidates.length ? Math.min(...candidates) : 0;

  const mq = (q: string) => {
    try {
      return window.matchMedia(q).matches;
    } catch {
      return false;
    }
  };

  lines.push(`acgDevice: ${device}`);
  lines.push(`inner: ${inner}`);
  lines.push(`visualViewport: ${vw}`);
  lines.push(`screen: ${screen}`);
  lines.push(
    `shortSide: ${shortSide} (screen=${screenShortSide}, vv=${vvShortSide}, inner=${innerShortSide})`
  );
  lines.push(`devicePixelRatio: ${window.devicePixelRatio || 1}`);
  lines.push(`uaData.platform: ${uaDataPlatform}`);
  lines.push(`uaData.mobile: ${uaDataMobile}`);
  lines.push(`maxTouchPoints: ${navigator.maxTouchPoints || 0}`);
  lines.push(`pointer: coarse=${mq("(pointer: coarse)")} fine=${mq("(pointer: fine)")}`);
  lines.push(`any-pointer: coarse=${mq("(any-pointer: coarse)")} fine=${mq("(any-pointer: fine)")}`);
  lines.push(`hover: none=${mq("(hover: none)")} hover=${mq("(hover: hover)")}`);
  lines.push(`any-hover: none=${mq("(any-hover: none)")} hover=${mq("(any-hover: hover)")}`);
  lines.push(`ua: ${ua}`);

  pre.textContent = lines.join("\n");
}

function createListFilter(params: {
  readIds: Set<string>;
  follows: Set<string>;
  blocklist: Set<string>;
  disabledSources: Set<string>;
  followedSources: Set<string>;
  filters: FilterStore;
}) {
  const { readIds, follows, blocklist, disabledSources, followedSources, filters } = params;
  const input = document.querySelector<HTMLInputElement>("#acg-search");
  const pageGrid = document.querySelector<HTMLElement>(".acg-post-grid[data-post-grid]");
  const count = document.querySelector<HTMLElement>("#acg-search-count");
  const unreadCount = document.querySelector<HTMLElement>("#acg-unread-count");
  const empty = document.querySelector<HTMLElement>("#acg-list-empty");
  const clear = document.querySelector<HTMLButtonElement>("#acg-clear-search");
  if (!input || !pageGrid) return;
  type GroupCategory = "anime" | "game" | "goods" | "seiyuu";
  const isJa = isJapanese();
  const groupCategoryOrder: GroupCategory[] = ["anime", "game", "goods", "seiyuu"];
  const groupCategoryLabels: Record<GroupCategory, string> = isJa
    ? { anime: "アニメ", game: "ゲーム", goods: "グッズ", seiyuu: "声優" }
    : { anime: "动画", game: "游戏", goods: "周边", seiyuu: "声优" };
  const groupTexts = isJa
    ? {
        title: "カテゴリ分布",
        totalPrefix: "ヒット ",
        emptyRecommendTitle: "候補フィルター",
        unreadOnly: "未読のみ",
        categoryPrefix: "カテゴリ",
        sourcePrefix: "ソース",
        recent24h: "24h + Pulse",
        excludeSpoiler: "ネタバレ除外"
      }
    : {
        title: "分类分布",
        totalPrefix: "命中 ",
        emptyRecommendTitle: "试试这些筛选",
        unreadOnly: "只看未读",
        categoryPrefix: "分类",
        sourcePrefix: "来源",
        recent24h: "24h + 热度",
        excludeSpoiler: "排除剧透"
      };
  const isGroupCategory = (value: string): value is GroupCategory =>
    value === "anime" || value === "game" || value === "goods" || value === "seiyuu";

  const groupSummaryUi = (() => {
    const host = input.closest<HTMLElement>(".acg-home-search-wrap");
    if (!host) return null;

    let root = host.querySelector<HTMLElement>("#acg-search-groups");
    if (!root) {
      root = document.createElement("section");
      root.id = "acg-search-groups";
      root.className = "acg-search-groups mt-3 hidden";
      root.setAttribute("aria-live", "polite");

      const head = document.createElement("div");
      head.className = "acg-search-groups-head";

      const title = document.createElement("span");
      title.className = "acg-search-groups-title";
      title.textContent = groupTexts.title;

      const total = document.createElement("span");
      total.className = "acg-search-groups-count";
      total.dataset.searchGroupsCount = "1";
      total.textContent = `${groupTexts.totalPrefix}0`;

      head.appendChild(title);
      head.appendChild(total);
      root.appendChild(head);

      const chips = document.createElement("div");
      chips.className = "acg-search-groups-chips";
      chips.dataset.searchGroupsChips = "1";
      root.appendChild(chips);
      host.appendChild(root);
    }

    const countEl = root.querySelector<HTMLElement>("[data-search-groups-count]");
    const chipsEl = root.querySelector<HTMLElement>("[data-search-groups-chips]");
    if (!countEl || !chipsEl) return null;
    return { root, countEl, chipsEl };
  })();

  const emptyRecommendationsUi = (() => {
    if (!empty) return null;
    const host = empty.firstElementChild instanceof HTMLElement ? empty.firstElementChild : empty;
    let root = host.querySelector<HTMLElement>("#acg-empty-recommendations");
    if (!root) {
      root = document.createElement("div");
      root.id = "acg-empty-recommendations";
      root.className = "acg-empty-recommendations mt-3 hidden";

      const title = document.createElement("p");
      title.className = "acg-empty-recommendations-title";
      title.textContent = groupTexts.emptyRecommendTitle;
      root.appendChild(title);

      const chips = document.createElement("div");
      chips.className =
        "acg-empty-recommendations-chips acg-hscroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0";
      chips.dataset.emptyRecommendationChips = "1";
      root.appendChild(chips);

      host.appendChild(root);
    }

    const chipsEl = root.querySelector<HTMLElement>("[data-empty-recommendation-chips]");
    if (!chipsEl) return null;
    return { root, chipsEl };
  })();

  // 性能：首页/分类页卡片较多时，DOMContentLoaded 里全量 query + textContent 拼接会造成“首屏卡一下”。
  // 这里做“惰性初始化”：如果没有任何筛选条件，就延后到 idle；用户一交互则立即初始化并生效。
  let cards: HTMLElement[] = [];
  let haystacks: string[] = [];
  const tagsByCard: string[][] = [];
  const tagButtonsByCard: HTMLButtonElement[][] = [];
  const tagTokensByCard: string[][] = [];
  const tagLabelByToken = new Map<string, string>();
  const tagTokenFrequency = new Map<string, number>();
  const sourceNames: string[] = [];
  const sourceLabelByToken = new Map<string, string>();
  const sourceTokenFrequency = new Map<string, number>();
  const sourceBadgeByCard: (HTMLElement | null)[] = [];
  const titleByCard: (HTMLElement | null)[] = [];
  const categories: string[] = [];
  const allCategoryCounts: Record<GroupCategory, number> = {
    anime: 0,
    game: 0,
    goods: 0,
    seiyuu: 0
  };
  const publishedAtMs: (number | null)[] = [];
  const pulseScores: number[] = [];
  const dedupKeys: string[] = [];
  const sourceHealth: string[] = [];
  const orderIndex: number[] = [];
  let hiddenState: boolean[] = [];
  let lastSortKey = "";
  let initialized = false;

  const bestTitleText = (card: HTMLElement): string => {
    const candidates = [...card.querySelectorAll<HTMLAnchorElement>("a[href]:not([target])")]
      .map((a) => (a.textContent ?? "").trim())
      .filter(Boolean);
    if (candidates.length === 0) return "";
    return candidates.sort((a, b) => b.length - a.length)[0] ?? "";
  };

  const initIfNeeded = () => {
    if (initialized) return;
    // 仅针对“主列表”的卡片做筛选/排序。
    // Spotlight/Carousel 也包含 data-post-id（用于收藏等），但它不应参与列表筛选/排序，
    // 否则会导致元素被 appendChild 移动到错误容器，出现“列表消失/重叠/闪一下”的问题。
    cards = [...pageGrid.querySelectorAll<HTMLElement>("[data-post-id]")];
    haystacks = cards.map((card, index) => {
      const title = bestTitleText(card);
      const summary = card.querySelector("p")?.textContent ?? "";

      const tagButtons = [...card.querySelectorAll<HTMLButtonElement>("button[data-tag]")];
      const rawTags = tagButtons.map((b) => String(b.dataset.tag ?? b.textContent ?? "").trim());
      const tagTokens = rawTags.map((raw) => normalizeText(raw));
      const tags = tagTokens.filter(Boolean);
      for (let j = 0; j < tagTokens.length; j += 1) {
        const token = tagTokens[j] ?? "";
        const raw = rawTags[j] ?? "";
        if (!token) continue;
        tagTokenFrequency.set(token, (tagTokenFrequency.get(token) ?? 0) + 1);
        if (raw && !tagLabelByToken.has(token)) tagLabelByToken.set(token, raw);
      }

      const sourceEl = card.querySelector<HTMLElement>("[data-source-badge]");
      const sourceNameRaw =
        sourceEl?.dataset.sourceName ?? sourceEl?.getAttribute("title") ?? sourceEl?.textContent ?? "";
      const sourceLabel = String(sourceNameRaw).trim();
      const sourceName = normalizeText(sourceNameRaw);
      if (sourceName) {
        sourceTokenFrequency.set(sourceName, (sourceTokenFrequency.get(sourceName) ?? 0) + 1);
        if (sourceLabel && !sourceLabelByToken.has(sourceName))
          sourceLabelByToken.set(sourceName, sourceLabel);
      }
      const titleEl =
        card.querySelector<HTMLElement>(".acg-post-card-title") ??
        card.querySelector<HTMLElement>(".acg-post-link-title") ??
        card.querySelector<HTMLElement>("a[href]");

      const category = normalizeText(card.dataset.category ?? "");
      const publishedAtRaw = card.dataset.publishedAt ?? "";
      const ts = publishedAtRaw ? Date.parse(publishedAtRaw) : NaN;
      const published = Number.isFinite(ts) ? ts : null;

      const pulseRaw = Number.parseFloat(card.dataset.pulse ?? "");
      const pulse = Number.isFinite(pulseRaw) ? pulseRaw : 0;
      const dedupKey = card.dataset.dedup ?? "";
      const health = (card.dataset.sourceHealth ?? "").toLowerCase();
      const orderRaw = Number.parseInt(card.dataset.order ?? "", 10);
      const order = Number.isFinite(orderRaw) ? orderRaw : index;

      tagsByCard.push(tags);
      tagButtonsByCard.push(tagButtons);
      tagTokensByCard.push(tagTokens);
      sourceNames.push(sourceName);
      sourceBadgeByCard.push(sourceEl ?? null);
      titleByCard.push(titleEl ?? null);
      categories.push(category);
      if (isGroupCategory(category)) allCategoryCounts[category] += 1;
      publishedAtMs.push(published);
      pulseScores.push(pulse);
      dedupKeys.push(dedupKey);
      sourceHealth.push(health);
      orderIndex.push(order);
      card.dataset.idx = String(index);

      return normalizeText(`${title} ${summary} ${tags.join(" ")} ${sourceName}`);
    });
    hiddenState = cards.map((c) => c.classList.contains("hidden"));
    initialized = true;
  };

  clear?.addEventListener("click", () => {
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
    toast({ title: isJapanese() ? "検索をクリアしました" : "已清空搜索", variant: "info" });
  });

  const isStableHealth = (level: string) => level === "excellent" || level === "good";
  let filterRevealToken = 0;
  let lastCountPulseAt = 0;
  const canAnimateFilterFx = (): boolean => {
    if (prefersReducedMotion()) return false;
    const perf = document.documentElement.dataset.acgPerf ?? "";
    if (perf === "low") return false;
    return true;
  };
  const pulseCounter = (el: HTMLElement | null) => {
    if (!el) return;
    if (!canAnimateFilterFx()) return;
    const now = Date.now();
    if (now - lastCountPulseAt < 120) return;
    lastCountPulseAt = now;

    el.classList.remove("acg-count-bump");
    void el.offsetWidth;
    el.classList.add("acg-count-bump");
    window.setTimeout(() => {
      el.classList.remove("acg-count-bump");
    }, 260);
  };
  const animateRevealedCards = (cardsToReveal: HTMLElement[]) => {
    if (!canAnimateFilterFx()) return;
    const revealList = cardsToReveal.filter((el) => !el.classList.contains("hidden")).slice(0, 18);
    if (revealList.length === 0) return;

    filterRevealToken += 1;
    const token = filterRevealToken;
    for (let i = 0; i < revealList.length; i += 1) {
      const card = revealList[i];
      const delayMs = Math.min(i * 18, 160);
      card.style.setProperty("--acg-filter-reveal-delay", `${delayMs}ms`);
      card.classList.remove("acg-filter-reveal");
      void card.offsetWidth;
      card.classList.add("acg-filter-reveal");
      window.setTimeout(() => {
        if (token !== filterRevealToken) return;
        card.classList.remove("acg-filter-reveal");
        card.style.removeProperty("--acg-filter-reveal-delay");
      }, 420 + delayMs);
    }
  };
  const topTokenFromFrequency = (map: Map<string, number>): string | null => {
    let bestToken = "";
    let bestCount = 0;
    for (const [token, count] of map) {
      if (!token || count <= 0) continue;
      if (count > bestCount || (count === bestCount && token.length > bestToken.length)) {
        bestToken = token;
        bestCount = count;
      }
    }
    return bestToken || null;
  };
  const topCategoryByTotal = (): GroupCategory | null => {
    let best: GroupCategory | null = null;
    let bestCount = 0;
    for (const cat of groupCategoryOrder) {
      const count = allCategoryCounts[cat] ?? 0;
      if (count > bestCount) {
        best = cat;
        bestCount = count;
      }
    }
    return best;
  };
  const toggleSearchToken = (token: string) => {
    const normalizedToken = normalizeText(token);
    if (!normalizedToken) return;

    const rawTokens = input.value.trim().split(/\s+/).filter(Boolean);
    const normalizedTokens = rawTokens.map((part) => normalizeText(part));
    const exists = normalizedTokens.includes(normalizedToken);
    const nextTokens = exists
      ? rawTokens.filter((_, index) => normalizedTokens[index] !== normalizedToken)
      : [...rawTokens, token];
    const next = nextTokens.join(" ").trim();
    if (next !== input.value) {
      input.value = next;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    try {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    } catch {
      // ignore
    }
    flashSearchFocusCue();
    track({ type: "search_group_chip", data: { token: normalizedToken, active: !exists } });
  };
  const renderGroupSummary = (params: {
    shown: number;
    shownByCategory: Record<GroupCategory, number>;
    parsed: ReturnType<typeof parseQuery>;
  }) => {
    if (!groupSummaryUi) return;
    const { shown, shownByCategory, parsed } = params;
    if (shown <= 0 || getSearchScope() === "all") {
      groupSummaryUi.root.classList.add("hidden");
      groupSummaryUi.chipsEl.innerHTML = "";
      return;
    }

    const entries = groupCategoryOrder
      .map((cat) => ({ cat, count: shownByCategory[cat] ?? 0 }))
      .filter((entry) => entry.count > 0);
    if (entries.length === 0) {
      groupSummaryUi.root.classList.add("hidden");
      groupSummaryUi.chipsEl.innerHTML = "";
      return;
    }

    const peak = Math.max(...entries.map((entry) => entry.count));
    groupSummaryUi.countEl.textContent = `${groupTexts.totalPrefix}${shown}`;
    groupSummaryUi.chipsEl.innerHTML = "";
    for (const entry of entries) {
      const token = `cat:${entry.cat}`;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "acg-search-group-chip clickable";
      chip.title = token;
      chip.setAttribute(
        "aria-label",
        `${groupTexts.categoryPrefix}: ${groupCategoryLabels[entry.cat]} (${entry.count})`
      );
      const active = parsed.categories.includes(entry.cat);
      chip.dataset.active = active ? "true" : "false";
      chip.setAttribute("aria-pressed", active ? "true" : "false");
      chip.textContent = `${groupCategoryLabels[entry.cat]} ${entry.count}`;
      if (entry.count === peak && entries.length > 1) chip.dataset.strong = "true";
      chip.addEventListener("click", (e) => {
        e.preventDefault();
        toggleSearchToken(token);
      });
      groupSummaryUi.chipsEl.appendChild(chip);
    }
    groupSummaryUi.root.classList.remove("hidden");
  };
  type EmptyRecommendation = { preset: string; label: string; lens?: TimeLens; sort?: SortMode };
  const buildEmptyRecommendations = (parsed: ReturnType<typeof parseQuery>): EmptyRecommendation[] => {
    const recs: EmptyRecommendation[] = [];
    const seen = new Set<string>();
    const pushRec = (item: EmptyRecommendation) => {
      const preset = item.preset.trim();
      if (!preset) return;
      const key = `${preset}|${item.lens ?? ""}|${item.sort ?? ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      recs.push({ ...item, preset });
    };

    if (!parsed.isUnread) {
      pushRec({ preset: "is:unread", label: groupTexts.unreadOnly });
    }
    if (parsed.categories.length === 0) {
      const topCategory = topCategoryByTotal();
      if (topCategory) {
        pushRec({
          preset: `cat:${topCategory}`,
          label: `${groupTexts.categoryPrefix}: ${groupCategoryLabels[topCategory]}`
        });
      }
    }
    if (parsed.tags.length === 0) {
      const tagToken = topTokenFromFrequency(tagTokenFrequency);
      if (tagToken) {
        const tagLabel = tagLabelByToken.get(tagToken) ?? tagToken;
        pushRec({ preset: `tag:${tagToken}`, label: `tag:${tagLabel}` });
      }
    }
    if (parsed.sources.length === 0) {
      const sourceToken = topTokenFromFrequency(sourceTokenFrequency);
      if (sourceToken) {
        const sourceLabel = sourceLabelByToken.get(sourceToken) ?? sourceToken;
        pushRec({ preset: `source:${sourceToken}`, label: `${groupTexts.sourcePrefix}: ${sourceLabel}` });
      }
    }
    if (parsed.afterMs == null && parsed.beforeMs == null) {
      const after = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      pushRec({
        preset: `after:${after}`,
        label: groupTexts.recent24h,
        lens: "24h",
        sort: "pulse"
      });
    }
    if (parsed.notTags.length === 0) {
      const spoilerWord = isJa ? "ネタバレ" : "剧透";
      pushRec({ preset: `-tag:${spoilerWord}`, label: groupTexts.excludeSpoiler });
    }
    return recs.slice(0, 5);
  };
  const renderEmptyRecommendations = (params: { shown: number; parsed: ReturnType<typeof parseQuery> }) => {
    if (!emptyRecommendationsUi) return;
    const { shown, parsed } = params;
    if (getSearchScope() === "all" || shown > 0) {
      emptyRecommendationsUi.root.classList.add("hidden");
      emptyRecommendationsUi.chipsEl.innerHTML = "";
      return;
    }

    const recommendations = buildEmptyRecommendations(parsed);
    if (recommendations.length === 0) {
      emptyRecommendationsUi.root.classList.add("hidden");
      emptyRecommendationsUi.chipsEl.innerHTML = "";
      return;
    }

    emptyRecommendationsUi.chipsEl.innerHTML = "";
    for (const rec of recommendations) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "acg-chip acg-empty-recommendation-chip rounded-full px-3 py-1 text-xs font-semibold clickable";
      btn.dataset.searchPreset = rec.preset;
      if (rec.lens) btn.dataset.searchPresetLens = rec.lens;
      if (rec.sort) btn.dataset.searchPresetSort = rec.sort;
      btn.textContent = rec.label;
      btn.title = rec.preset;
      emptyRecommendationsUi.chipsEl.appendChild(btn);
    }
    emptyRecommendationsUi.root.classList.remove("hidden");
  };

  const applySort = () => {
    const container = pageGrid;
    const mode = filters.sortMode ?? "latest";
    const sorted = [...cards].sort((a, b) => {
      const ia = Number.parseInt(a.dataset.idx ?? "", 10);
      const ib = Number.parseInt(b.dataset.idx ?? "", 10);
      const idxA = Number.isFinite(ia) ? ia : 0;
      const idxB = Number.isFinite(ib) ? ib : 0;
      if (mode === "pulse") {
        const pa = pulseScores[idxA] ?? 0;
        const pb = pulseScores[idxB] ?? 0;
        if (pb !== pa) return pb - pa;
        const ta = publishedAtMs[idxA] ?? 0;
        const tb = publishedAtMs[idxB] ?? 0;
        if (tb !== ta) return tb - ta;
      }
      return (orderIndex[idxA] ?? 0) - (orderIndex[idxB] ?? 0);
    });
    const visibleOrderKey = sorted
      .filter((el) => !el.classList.contains("hidden"))
      .map((el) => el.dataset.idx ?? "")
      .join(",");
    const sortKey = `${mode}|${visibleOrderKey}`;
    if (sortKey === lastSortKey) return;

    const currentOrder = [...container.querySelectorAll<HTMLElement>("[data-post-id]")];
    const sameOrder =
      currentOrder.length === sorted.length && currentOrder.every((el, index) => el === sorted[index]);
    if (sameOrder) {
      lastSortKey = sortKey;
      return;
    }

    const frag = document.createDocumentFragment();
    for (const el of sorted) frag.appendChild(el);
    container.appendChild(frag);
    lastSortKey = sortKey;
  };

  const applyNow = () => {
    if (getSearchScope() === "all") {
      groupSummaryUi?.root.classList.add("hidden");
      emptyRecommendationsUi?.root.classList.add("hidden");
      return;
    }
    initIfNeeded();
    if (!initialized) return;

    const parsed = parseQuery(input.value);
    const followOnlyEnabled = filters.onlyFollowed;
    const followSourcesOnlyEnabled = filters.onlyFollowedSources;
    const hideReadEnabled = filters.hideRead;
    const stableOnlyEnabled = filters.onlyStableSources;
    const dedupEnabled = filters.dedup;
    const lens = filters.timeLens ?? "all";
    const lensMs =
      lens === "2h" ? UI.LENS_2H_MS : lens === "6h" ? UI.LENS_6H_MS : lens === "24h" ? UI.LENS_24H_MS : null;
    const followWords = followOnlyEnabled ? [...follows].map((w) => normalizeText(w)).filter(Boolean) : [];
    const blockWords = blocklist.size > 0 ? [...blocklist].map((w) => normalizeText(w)).filter(Boolean) : [];
    const now = Date.now();
    const hasVisualFilters =
      parsed.text.length > 0 ||
      parsed.tags.length > 0 ||
      parsed.sources.length > 0 ||
      parsed.categories.length > 0 ||
      parsed.afterMs != null ||
      parsed.beforeMs != null ||
      parsed.isRead != null ||
      parsed.isUnread != null ||
      parsed.isFresh != null ||
      lensMs != null ||
      followOnlyEnabled ||
      followSourcesOnlyEnabled ||
      hideReadEnabled ||
      stableOnlyEnabled ||
      dedupEnabled;

    if (hasVisualFilters) document.documentElement.dataset.acgFiltering = "1";
    else delete document.documentElement.dataset.acgFiltering;

    let dedupLeader: Map<string, number> | null = null;
    if (dedupEnabled) {
      dedupLeader = new Map<string, number>();
      for (let i = 0; i < cards.length; i += 1) {
        const id = cards[i].dataset.postId ?? "";
        const sourceId = cards[i].dataset.sourceId ?? "";
        const hay = haystacks[i];
        const tags = tagsByCard[i] ?? [];
        const sourceName = sourceNames[i] ?? "";
        const category = categories[i] ?? "";
        const published = publishedAtMs[i] ?? null;
        const key = dedupKeys[i] ?? "";
        const health = sourceHealth[i] ?? "";

        const matchText = parsed.text.length === 0 ? true : parsed.text.every((t) => t && hay.includes(t));
        const matchNotText =
          parsed.notText.length === 0 ? true : parsed.notText.every((t) => t && !hay.includes(t));
        const matchTags =
          parsed.tags.length === 0 ? true : parsed.tags.every((t) => t && tags.some((x) => x.includes(t)));
        const matchNotTags =
          parsed.notTags.length === 0
            ? true
            : parsed.notTags.every((t) => t && !tags.some((x) => x.includes(t)));
        const matchSources =
          parsed.sources.length === 0
            ? true
            : parsed.sources.every(
                (t) =>
                  t && (sourceName.includes(t) || (sourceId ? normalizeText(sourceId).includes(t) : false))
              );
        const matchNotSources =
          parsed.notSources.length === 0
            ? true
            : parsed.notSources.every(
                (t) =>
                  t && !(sourceName.includes(t) || (sourceId ? normalizeText(sourceId).includes(t) : false))
              );
        const matchCats =
          parsed.categories.length === 0 ? true : parsed.categories.some((c) => c && category === c);
        const matchNotCats =
          parsed.notCategories.length === 0 ? true : parsed.notCategories.every((c) => c && category !== c);
        const matchAfter =
          parsed.afterMs == null ? true : published != null ? published >= parsed.afterMs : false;
        const matchBefore =
          parsed.beforeMs == null ? true : published != null ? published <= parsed.beforeMs : false;
        const matchFollow = !followOnlyEnabled
          ? true
          : followWords.length === 0
            ? false
            : followWords.some((w) => w && hay.includes(w));
        const matchFollowSources = !followSourcesOnlyEnabled
          ? true
          : sourceId
            ? followedSources.has(sourceId)
            : false;
        const read = id ? readIds.has(id) : false;
        const matchIsRead = parsed.isRead == null ? true : parsed.isRead ? read : !read;
        const matchIsUnread = parsed.isUnread == null ? true : parsed.isUnread ? !read : read;
        const matchIsFresh =
          parsed.isFresh == null
            ? true
            : published != null
              ? parsed.isFresh
                ? now - published >= 0 && now - published < UI.FRESH_WINDOW_MS
                : !(now - published >= 0 && now - published < UI.FRESH_WINDOW_MS)
              : false;
        const matchLens = lensMs == null ? true : published != null ? now - published <= lensMs : false;
        const matchStable = !stableOnlyEnabled ? true : isStableHealth(health);

        const blocked = blockWords.some((w) => w && hay.includes(w));
        const hideByRead = hideReadEnabled && read;
        const sourceEnabled = !sourceId || !disabledSources.has(sourceId);

        const ok =
          matchText &&
          matchNotText &&
          matchTags &&
          matchNotTags &&
          matchSources &&
          matchNotSources &&
          matchCats &&
          matchNotCats &&
          matchAfter &&
          matchBefore &&
          matchIsRead &&
          matchIsUnread &&
          matchIsFresh &&
          matchLens &&
          matchFollow &&
          matchFollowSources &&
          matchStable &&
          !blocked &&
          !hideByRead &&
          sourceEnabled;
        if (!ok) continue;
        if (!key) continue;
        const existing = dedupLeader.get(key);
        if (existing == null) {
          dedupLeader.set(key, i);
          continue;
        }
        const currentPulse = pulseScores[i] ?? 0;
        const existingPulse = pulseScores[existing] ?? 0;
        if (currentPulse > existingPulse) dedupLeader.set(key, i);
      }
    }

    let shown = 0;
    let unreadShown = 0;
    const revealedCards: HTMLElement[] = [];
    const shownByCategory: Record<GroupCategory, number> = {
      anime: 0,
      game: 0,
      goods: 0,
      seiyuu: 0
    };
    for (let i = 0; i < cards.length; i += 1) {
      const id = cards[i].dataset.postId ?? "";
      const sourceId = cards[i].dataset.sourceId ?? "";
      const hay = haystacks[i];
      const tags = tagsByCard[i] ?? [];
      const sourceName = sourceNames[i] ?? "";
      const category = categories[i] ?? "";
      const published = publishedAtMs[i] ?? null;
      const health = sourceHealth[i] ?? "";
      const key = dedupKeys[i] ?? "";

      const matchText = parsed.text.length === 0 ? true : parsed.text.every((t) => t && hay.includes(t));
      const matchNotText =
        parsed.notText.length === 0 ? true : parsed.notText.every((t) => t && !hay.includes(t));
      const matchTags =
        parsed.tags.length === 0 ? true : parsed.tags.every((t) => t && tags.some((x) => x.includes(t)));
      const matchNotTags =
        parsed.notTags.length === 0
          ? true
          : parsed.notTags.every((t) => t && !tags.some((x) => x.includes(t)));
      const matchSources =
        parsed.sources.length === 0
          ? true
          : parsed.sources.every(
              (t) => t && (sourceName.includes(t) || (sourceId ? normalizeText(sourceId).includes(t) : false))
            );
      const matchNotSources =
        parsed.notSources.length === 0
          ? true
          : parsed.notSources.every(
              (t) =>
                t && !(sourceName.includes(t) || (sourceId ? normalizeText(sourceId).includes(t) : false))
            );
      const matchCats =
        parsed.categories.length === 0 ? true : parsed.categories.some((c) => c && category === c);
      const matchNotCats =
        parsed.notCategories.length === 0 ? true : parsed.notCategories.every((c) => c && category !== c);
      const matchAfter =
        parsed.afterMs == null ? true : published != null ? published >= parsed.afterMs : false;
      const matchBefore =
        parsed.beforeMs == null ? true : published != null ? published <= parsed.beforeMs : false;
      const matchFollow = !followOnlyEnabled
        ? true
        : followWords.length === 0
          ? false
          : followWords.some((w) => w && hay.includes(w));
      const matchFollowSources = !followSourcesOnlyEnabled
        ? true
        : sourceId
          ? followedSources.has(sourceId)
          : false;
      const read = id ? readIds.has(id) : false;
      const matchIsRead = parsed.isRead == null ? true : parsed.isRead ? read : !read;
      const matchIsUnread = parsed.isUnread == null ? true : parsed.isUnread ? !read : read;
      const matchIsFresh =
        parsed.isFresh == null
          ? true
          : published != null
            ? parsed.isFresh
              ? now - published >= 0 && now - published < UI.FRESH_WINDOW_MS
              : !(now - published >= 0 && now - published < UI.FRESH_WINDOW_MS)
            : false;
      const matchLens = lensMs == null ? true : published != null ? now - published <= lensMs : false;
      const matchStable = !stableOnlyEnabled ? true : isStableHealth(health);

      const blocked = blockWords.some((w) => w && hay.includes(w));
      const hideByRead = hideReadEnabled && read;
      const sourceEnabled = !sourceId || !disabledSources.has(sourceId);

      const ok =
        matchText &&
        matchNotText &&
        matchTags &&
        matchNotTags &&
        matchSources &&
        matchNotSources &&
        matchCats &&
        matchNotCats &&
        matchAfter &&
        matchBefore &&
        matchIsRead &&
        matchIsUnread &&
        matchIsFresh &&
        matchLens &&
        matchFollow &&
        matchFollowSources &&
        matchStable &&
        !blocked &&
        !hideByRead &&
        sourceEnabled &&
        (!dedupEnabled || !key || dedupLeader?.get(key) === i);
      const hidden = !ok;
      const prevHidden = hiddenState[i];
      if (prevHidden !== hidden) {
        cards[i].classList.toggle("hidden", hidden);
        hiddenState[i] = hidden;
        if (!hidden && prevHidden) revealedCards.push(cards[i]);
      }
      const titleEl = titleByCard[i];
      const sourceBadgeEl = sourceBadgeByCard[i];
      const tagButtons = tagButtonsByCard[i] ?? [];
      const tagTokens = tagTokensByCard[i] ?? [];

      const textFocus = parsed.text.length > 0 ? matchText : parsed.categories.length > 0 ? matchCats : false;
      const sourceFocus =
        (parsed.sources.length > 0 && matchSources) || (followSourcesOnlyEnabled && matchFollowSources);
      const tagFocus = parsed.tags.length > 0 && matchTags;
      const strongFocus = Number(textFocus) + Number(sourceFocus) + Number(tagFocus) >= 2;
      const enableCardFocus = hasVisualFilters && ok;

      if (enableCardFocus) cards[i].dataset.filterHit = "1";
      else delete cards[i].dataset.filterHit;
      if (enableCardFocus && strongFocus) cards[i].dataset.filterStrong = "1";
      else delete cards[i].dataset.filterStrong;

      titleEl?.classList.toggle("is-filter-match", enableCardFocus && textFocus);
      sourceBadgeEl?.classList.toggle("is-filter-match", enableCardFocus && sourceFocus);
      for (let j = 0; j < tagButtons.length; j += 1) {
        const token = tagTokens[j] ?? "";
        const tagMatched =
          enableCardFocus && parsed.tags.length > 0 && token
            ? parsed.tags.some((t) => t && token.includes(t))
            : false;
        tagButtons[j].classList.toggle("is-filter-match", Boolean(tagMatched));
      }

      if (ok) {
        shown += 1;
        if (!read) unreadShown += 1;
        if (isGroupCategory(category)) shownByCategory[category] += 1;
      }
    }
    if (count) {
      const next = `${shown}/${cards.length}`;
      if (count.textContent !== next) {
        const prev = count.textContent ?? "";
        count.textContent = next;
        if (prev && prev !== "-") pulseCounter(count);
      }
    }
    if (unreadCount) {
      const next = String(unreadShown);
      if (unreadCount.textContent !== next) {
        const prev = unreadCount.textContent ?? "";
        unreadCount.textContent = next;
        if (prev && prev !== "-") pulseCounter(unreadCount);
      }
    }
    if (empty) empty.classList.toggle("hidden", shown > 0);
    renderGroupSummary({ shown, shownByCategory, parsed });
    renderEmptyRecommendations({ shown, parsed });
    applySort();
    animateRevealedCards(revealedCards);
  };

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      applyNow();
    });
  };

  let searchTrackTimer: number | null = null;
  let lastTrackedQuery = "";
  const scheduleSearchTrack = () => {
    if (searchTrackTimer != null) window.clearTimeout(searchTrackTimer);
    searchTrackTimer = window.setTimeout(() => {
      searchTrackTimer = null;
      const q = input.value.trim();
      const normalized = q ? q.slice(0, 160) : "";
      if (normalized === lastTrackedQuery) return;
      lastTrackedQuery = normalized;
      if (!normalized) return;
      track({ type: "search", data: { q: normalized } });
    }, 360);
  };

  input.addEventListener("input", schedule);
  input.addEventListener("input", scheduleSearchTrack);
  input.addEventListener("focus", () => initIfNeeded());
  document.addEventListener("acg:filters-changed", schedule);
  document.addEventListener("acg:search-scope-changed", () => {
    if (getSearchScope() === "all") {
      groupSummaryUi?.root.classList.add("hidden");
      emptyRecommendationsUi?.root.classList.add("hidden");
      return;
    }
    schedule();
  });
  document.addEventListener("acg:filters-changed", () => {
    track({
      type: "filters_changed",
      data: {
        onlyFollowed: Boolean(filters.onlyFollowed),
        onlyFollowedSources: Boolean(filters.onlyFollowedSources),
        hideRead: Boolean(filters.hideRead),
        onlyStableSources: Boolean(filters.onlyStableSources),
        dedup: Boolean(filters.dedup),
        timeLens: filters.timeLens,
        sortMode: filters.sortMode
      }
    });
  });

  const shouldInitImmediately =
    input.value.trim().length > 0 ||
    filters.onlyFollowed ||
    filters.onlyFollowedSources ||
    filters.hideRead ||
    filters.onlyStableSources ||
    filters.dedup ||
    filters.timeLens !== "all" ||
    filters.sortMode !== "latest" ||
    blocklist.size > 0 ||
    disabledSources.size > 0;

  if (shouldInitImmediately) applyNow();
  else runWhenIdle(() => applyNow(), UI.LIST_FILTER_IDLE_DELAY_MS);
}

type BookmarkLang = "zh" | "ja";
type BookmarkCategory = "anime" | "game" | "goods" | "seiyuu";

type BookmarkPost = {
  id: string;
  title: string;
  titleZh?: string;
  titleJa?: string;
  summary?: string;
  summaryZh?: string;
  summaryJa?: string;
  preview?: string;
  previewZh?: string;
  previewJa?: string;
  url: string;
  publishedAt: string;
  cover?: string;
  coverOriginal?: string;
  category: BookmarkCategory;
  tags?: string[];
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
};

const BOOKMARK_CATEGORY_LABELS: Record<BookmarkLang, Record<BookmarkCategory, string>> = {
  zh: { anime: "动画", game: "游戏联动", goods: "周边手办", seiyuu: "声优活动" },
  ja: { anime: "アニメ", game: "ゲーム/コラボ", goods: "グッズ/フィギュア", seiyuu: "声優/イベント" }
};

const BOOKMARK_CATEGORY_THEME: Record<
  BookmarkCategory,
  { dot: string; ink: string; cover: string; glow: string }
> = {
  anime: {
    dot: "bg-violet-400",
    ink: "text-violet-900",
    cover: "from-violet-500/25 via-fuchsia-500/15 to-sky-500/20",
    glow: "bg-violet-500/10"
  },
  game: {
    dot: "bg-sky-400",
    ink: "text-sky-900",
    cover: "from-sky-500/25 via-cyan-500/15 to-emerald-500/15",
    glow: "bg-sky-500/10"
  },
  goods: {
    dot: "bg-amber-400",
    ink: "text-amber-900",
    cover: "from-amber-500/25 via-orange-500/15 to-rose-500/15",
    glow: "bg-amber-500/10"
  },
  seiyuu: {
    dot: "bg-emerald-400",
    ink: "text-emerald-900",
    cover: "from-emerald-500/25 via-teal-500/15 to-sky-500/15",
    glow: "bg-emerald-500/10"
  }
};

const SVG_NS = "http://www.w3.org/2000/svg";

function createSvgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

function createCategoryIcon(params: { category: BookmarkCategory; size: number }): SVGSVGElement {
  const { category, size } = params;

  const svg = createSvgEl("svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const addPath = (attrs: Record<string, string>) => {
    const p = createSvgEl("path");
    for (const [k, v] of Object.entries(attrs)) p.setAttribute(k, v);
    svg.appendChild(p);
  };

  if (category === "anime") {
    addPath({
      d: "M7.5 4.8h9A2.7 2.7 0 0 1 19.2 7.5v6.2A2.7 2.7 0 0 1 16.5 16.4H12l-3.4 2.8v-2.8H7.5A2.7 2.7 0 0 1 4.8 13.7V7.5A2.7 2.7 0 0 1 7.5 4.8Z",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linejoin": "round"
    });
    addPath({ d: "M9 9.5h6", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" });
    addPath({ d: "M9 12.2h4.2", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" });
  } else if (category === "game") {
    addPath({
      d: "M8.4 10.5h7.2c1.6 0 2.9 1.3 2.9 2.9v2.2A3.4 3.4 0 0 1 15.1 19H8.9a3.4 3.4 0 0 1-3.4-3.4v-2.2c0-1.6 1.3-2.9 2.9-2.9Z",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linejoin": "round"
    });
    addPath({ d: "M9.2 14.2h3.2", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" });
    addPath({ d: "M10.8 12.6v3.2", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" });
    addPath({ d: "M16.1 13.6h.01", stroke: "currentColor", "stroke-width": "3", "stroke-linecap": "round" });
    addPath({ d: "M17.7 15.2h.01", stroke: "currentColor", "stroke-width": "3", "stroke-linecap": "round" });
  } else if (category === "goods") {
    addPath({
      d: "M6 10.5V8.8A2.8 2.8 0 0 1 8.8 6h6.4A2.8 2.8 0 0 1 18 8.8v1.7",
      stroke: "currentColor",
      "stroke-width": "2"
    });
    addPath({
      d: "M5.5 10.5h13v9.2A2.3 2.3 0 0 1 16.2 22H7.8A2.3 2.3 0 0 1 5.5 19.7v-9.2Z",
      stroke: "currentColor",
      "stroke-width": "2"
    });
    addPath({ d: "M9 13.2h6", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" });
  } else {
    addPath({
      d: "M12 22a8.5 8.5 0 1 0-8.5-8.5",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round"
    });
    addPath({
      d: "M7.5 11.5c.7-1.8 2.4-3 4.5-3s3.8 1.2 4.5 3",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round"
    });
    addPath({
      d: "M9.2 15.4h.01M14.8 15.4h.01",
      stroke: "currentColor",
      "stroke-width": "3",
      "stroke-linecap": "round"
    });
  }

  return svg;
}

type UiIconName = "arrow-up" | "external-link" | "refresh" | "search" | "sliders" | "star" | "x";

function createUiIcon(params: { name: UiIconName; size: number; filled?: boolean }): SVGSVGElement {
  const { name, size, filled = false } = params;

  const svg = createSvgEl("svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("data-icon", name);
  svg.classList.add("acg-icon");

  const addPath = (attrs: Record<string, string>) => {
    const p = createSvgEl("path");
    for (const [k, v] of Object.entries(attrs)) p.setAttribute(k, v);
    svg.appendChild(p);
  };

  if (name === "refresh") {
    addPath({
      d: "M20 12a8 8 0 1 1-2.35-5.65",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round"
    });
    addPath({
      d: "M20 4v4h-4",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
  }

  if (name === "arrow-up") {
    addPath({
      d: "M12 19V5",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round"
    });
    addPath({
      d: "m6 11 6-6 6 6",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
  }

  if (name === "external-link") {
    addPath({
      d: "M14 5h5v5",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
    addPath({
      d: "M10 14 19 5",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
    addPath({
      d: "M10 5H6.8A2.8 2.8 0 0 0 4 7.8v9.4A2.8 2.8 0 0 0 6.8 20h9.4A2.8 2.8 0 0 0 19 17.2V14",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
  }

  if (name === "search") {
    addPath({
      d: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
    addPath({
      d: "m21 21-4.35-4.35",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
  }

  if (name === "sliders") {
    addPath({
      d: "M4 6h16",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round"
    });
    addPath({
      d: "M4 12h16",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round"
    });
    addPath({
      d: "M4 18h16",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round"
    });
    addPath({
      d: "M9 6a1.5 1.5 0 1 0 0 .01",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round"
    });
    addPath({
      d: "M15 12a1.5 1.5 0 1 0 0 .01",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round"
    });
    addPath({
      d: "M10 18a1.5 1.5 0 1 0 0 .01",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round"
    });
  }

  if (name === "star") {
    addPath({
      class: "acg-icon-star",
      d: "M12 17.3l-5.1 2.7 1-5.7-4.1-4 5.7-.8L12 4.3l2.6 5.2 5.7.8-4.1 4 1 5.7L12 17.3Z",
      fill: filled ? "currentColor" : "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linejoin": "round"
    });
  }

  if (name === "x") {
    addPath({
      d: "M6 6l12 12",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round"
    });
    addPath({
      d: "M18 6 6 18",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round"
    });
  }

  return svg;
}

function getBookmarkLang(): BookmarkLang {
  return isJapanese() ? "ja" : "zh";
}

function normalizeCategory(value: unknown): BookmarkCategory {
  if (value === "anime" || value === "game" || value === "goods" || value === "seiyuu") return value;
  return "anime";
}

function whenLabel(lang: BookmarkLang, publishedAt: string): string {
  const t = new Date(publishedAt).getTime();
  if (!Number.isFinite(t)) return publishedAt;
  const diffMs = Date.now() - t;
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return new Date(t).toLocaleDateString(lang === "ja" ? "ja-JP" : "zh-CN");
  }
  const hours = Math.floor(diffMs / MS.HOUR);
  if (hours < 1) return lang === "ja" ? "たった今" : "刚刚";
  if (hours < 24) return lang === "ja" ? `${hours}時間前` : `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return lang === "ja" ? `${days}日前` : `${days} 天前`;
  return new Date(t).toLocaleDateString(lang === "ja" ? "ja-JP" : "zh-CN");
}

let bookmarkPostsByIdPromise: Promise<Map<string, BookmarkPost>> | null = null;
async function getBookmarkPostsById(): Promise<Map<string, BookmarkPost>> {
  if (bookmarkPostsByIdPromise) return bookmarkPostsByIdPromise;
  bookmarkPostsByIdPromise = (async () => {
    const url = href(NETWORK.POSTS_JSON_PATH);
    const json = await fetchJsonPreferGzip<unknown>({
      url,
      gzUrl: href(NETWORK.POSTS_JSON_GZ_PATH),
      options: {
        label: "posts.json",
        timeoutMs: NETWORK.DEFAULT_TIMEOUT_MS,
        retries: 1,
        cache: "force-cache"
      }
    });
    if (!Array.isArray(json)) throw new Error("posts.json 格式错误");
    const map = new Map<string, BookmarkPost>();
    for (const item of json) {
      if (!item || typeof item !== "object") continue;
      const it = item as Record<string, unknown>;
      const id = typeof it.id === "string" ? it.id : "";
      if (!id) continue;
      const post: BookmarkPost = {
        id,
        title: typeof it.title === "string" ? it.title : "",
        titleZh: typeof it.titleZh === "string" ? it.titleZh : undefined,
        titleJa: typeof it.titleJa === "string" ? it.titleJa : undefined,
        summary: typeof it.summary === "string" ? it.summary : undefined,
        summaryZh: typeof it.summaryZh === "string" ? it.summaryZh : undefined,
        summaryJa: typeof it.summaryJa === "string" ? it.summaryJa : undefined,
        preview: typeof it.preview === "string" ? it.preview : undefined,
        previewZh: typeof it.previewZh === "string" ? it.previewZh : undefined,
        previewJa: typeof it.previewJa === "string" ? it.previewJa : undefined,
        url: typeof it.url === "string" ? it.url : "",
        publishedAt: typeof it.publishedAt === "string" ? it.publishedAt : "",
        cover: typeof it.cover === "string" ? it.cover : undefined,
        coverOriginal: typeof it.coverOriginal === "string" ? it.coverOriginal : undefined,
        category: normalizeCategory(it.category),
        tags: Array.isArray(it.tags) ? it.tags.filter((x: unknown) => typeof x === "string") : undefined,
        sourceId: typeof it.sourceId === "string" ? it.sourceId : "",
        sourceName: typeof it.sourceName === "string" ? it.sourceName : "",
        sourceUrl: typeof it.sourceUrl === "string" ? it.sourceUrl : ""
      };
      map.set(id, post);
    }
    return map;
  })();

  return bookmarkPostsByIdPromise;
}

function shouldPrefetchAllPosts(): boolean {
  try {
    const root = document.documentElement;
    const device = root.dataset.acgDevice ?? "";
    const perf = root.dataset.acgPerf ?? "";
    if (perf === "low") return false;

    type NetworkInformationLike = { saveData?: boolean; effectiveType?: string };
    type NavigatorWithConnection = Navigator & { connection?: NetworkInformationLike };
    type NavigatorWithDeviceHints = Navigator & { deviceMemory?: number };
    const conn = (navigator as NavigatorWithConnection).connection;
    if (conn?.saveData) return false;
    const effective = String(conn?.effectiveType ?? "").toLowerCase();
    if (effective.includes("2g")) return false;

    // 手机弱网（3g）时，优先保持交互响应，不做全量预取。
    if (device === "phone" && effective.includes("3g")) return false;

    const memRaw = (navigator as NavigatorWithDeviceHints).deviceMemory;
    const coresRaw = navigator.hardwareConcurrency;
    const memoryLow = typeof memRaw === "number" && memRaw <= 4;
    const coresLow = typeof coresRaw === "number" && Number.isFinite(coresRaw) && coresRaw <= 4;

    if ((device === "phone" || device === "tablet") && (memoryLow || coresLow)) return false;
  } catch {
    // ignore
  }
  return true;
}

function wireGlobalSearch(params: {
  bookmarkIds: Set<string>;
  readIds: Set<string>;
  follows: Set<string>;
  blocklist: Set<string>;
  disabledSources: Set<string>;
  followedSources: Set<string>;
  filters: FilterStore;
}) {
  const { bookmarkIds, readIds, follows, blocklist, disabledSources, followedSources, filters } = params;

  const input = document.querySelector<HTMLInputElement>("#acg-search");
  const pageGrid = document.querySelector<HTMLElement>(".acg-post-grid");
  const empty = document.querySelector<HTMLElement>("#acg-list-empty");
  const count = document.querySelector<HTMLElement>("#acg-search-count");
  const unreadCount = document.querySelector<HTMLElement>("#acg-unread-count");
  if (!input || !pageGrid || !empty) return;

  const chipRow = (() => {
    const anyQuick = document.querySelector<HTMLButtonElement>("button[data-quick-toggle]");
    return anyQuick?.closest<HTMLElement>(".acg-hscroll") ?? null;
  })();
  if (!chipRow) return;

  const toggleId = "acg-search-scope-toggle";
  let toggle = chipRow.querySelector<HTMLButtonElement>(`#${toggleId}`);
  if (!toggle) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.id = toggleId;
    toggle.className = "acg-chip rounded-full px-3 py-1 text-xs font-semibold clickable";
    toggle.textContent = isJapanese() ? "全件" : "全站";
    toggle.title = isJapanese() ? "全件検索（全データを読み込む）" : "全站搜索（加载全部数据）";
    toggle.setAttribute("aria-pressed", "false");
    toggle.dataset.active = "false";
    chipRow.appendChild(toggle);
  }

  type SearchWorkerInMessage =
    | {
        type: "init";
        postsUrl: string;
        postsGzUrl?: string;
        indexUrl?: string;
        indexGzUrl?: string;
        indexUrlFallback?: string;
        indexGzUrlFallback?: string;
      }
    | {
        type: "set_state";
        state: {
          readIds: string[];
          follows: string[];
          blocklist: string[];
          disabledSources: string[];
          followedSources: string[];
          filters: FilterStore;
        };
      }
    | { type: "search"; requestId: number; q: string; freshWindowMs: number };

  type SearchWorkerOutMessage =
    | { type: "ready"; total: number }
    | {
        type: "result";
        requestId: number;
        total: number;
        matched: number;
        unread: number;
        posts: BookmarkPost[];
        truncated: boolean;
      }
    | { type: "error"; requestId?: number; message: string };

  let worker: Worker | null = null;
  let workerInitStartedAt = 0;
  let workerReady = false;
  let workerTotal = 0;
  let workerRequestId = 0;
  let latestRequestId = 0;
  let lastTruncatedToastRequestId = 0;
  let stateDirty = true;
  let wrap: HTMLElement | null = null;
  let grid: HTMLElement | null = null;
  let virtual: VirtualGridController<BookmarkPost> | null = null;
  let scheduled = false;

  const destroyVirtual = () => {
    try {
      virtual?.destroy();
    } catch {
      // ignore
    }
    virtual = null;
  };

  const ensureWrap = () => {
    if (wrap && grid) return;
    wrap = document.createElement("div");
    wrap.id = "acg-global-search";
    grid = document.createElement("div");
    grid.id = "acg-global-search-grid";
    grid.className = pageGrid.className;
    wrap.appendChild(grid);
    empty.parentElement?.insertBefore(wrap, empty);
  };

  const removeWrap = () => {
    destroyVirtual();
    try {
      wrap?.remove();
    } catch {
      // ignore
    }
    wrap = null;
    grid = null;
  };

  const setPageGridVisible = (visible: boolean) => {
    pageGrid.classList.toggle("hidden", !visible);
  };

  const setEmptyVisible = (visible: boolean) => {
    empty.classList.toggle("hidden", !visible);
  };

  const syncToggleUi = () => {
    const enabled = getSearchScope() === "all";
    toggle!.dataset.active = enabled ? "true" : "false";
    toggle!.setAttribute("aria-pressed", enabled ? "true" : "false");
  };

  let lastCountPulseAt = 0;
  const canAnimateCounterFx = (): boolean => {
    if (prefersReducedMotion()) return false;
    const perf = document.documentElement.dataset.acgPerf ?? "";
    if (perf === "low") return false;
    return true;
  };
  const pulseCounter = (el: HTMLElement | null) => {
    if (!el) return;
    if (!canAnimateCounterFx()) return;
    const now = Date.now();
    if (now - lastCountPulseAt < 120) return;
    lastCountPulseAt = now;

    el.classList.remove("acg-count-bump");
    void el.offsetWidth;
    el.classList.add("acg-count-bump");
    window.setTimeout(() => {
      el.classList.remove("acg-count-bump");
    }, 260);
  };
  const setCounterText = (el: HTMLElement | null, next: string) => {
    if (!el) return;
    if (el.textContent === next) return;
    const prev = el.textContent ?? "";
    el.textContent = next;
    if (prev && prev !== "-") pulseCounter(el);
  };

  const ensureWorker = (showSkeleton: boolean) => {
    if (worker) return;

    if (showSkeleton) {
      ensureWrap();
      if (grid) renderBookmarksSkeleton(grid);
      setEmptyVisible(false);
    }

    let next: Worker;
    try {
      next = new Worker(new URL("./workers/search.worker.ts", import.meta.url), { type: "module" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({
        title: isJapanese() ? "全件検索の初期化に失敗" : "全站搜索初始化失败",
        desc: msg,
        variant: "error"
      });
      return;
    }

    worker = next;
    workerReady = false;
    workerTotal = 0;

    workerInitStartedAt = (() => {
      try {
        return performance.now();
      } catch {
        return Date.now();
      }
    })();

    track({ type: "prefetch_posts_start" });

    worker.addEventListener("message", (ev: MessageEvent<SearchWorkerOutMessage>) => {
      const msg = ev.data;
      if (!msg || typeof msg !== "object") return;
      if (getSearchScope() !== "all") return;

      if (msg.type === "ready") {
        workerReady = true;
        workerTotal = msg.total;
        const tookMs = Math.round(
          (() => {
            try {
              return performance.now() - workerInitStartedAt;
            } catch {
              return Date.now() - workerInitStartedAt;
            }
          })()
        );
        track({ type: "prefetch_posts_done", data: { count: msg.total, ms: tookMs } });
        return;
      }

      if (msg.type === "result") {
        if (msg.requestId !== latestRequestId) return;
        renderResults(msg.posts, getBookmarkLang());
        setCounterText(count, msg.truncated ? `${msg.matched}+/${msg.total}` : `${msg.matched}/${msg.total}`);
        setCounterText(unreadCount, String(msg.unread));
        setEmptyVisible(msg.matched === 0);

        if (msg.truncated && msg.requestId !== lastTruncatedToastRequestId) {
          lastTruncatedToastRequestId = msg.requestId;
          toast({
            title: isJapanese() ? "結果が多すぎます" : "结果过多",
            desc: isJapanese()
              ? `先頭 ${msg.matched} 件のみ表示します。条件を絞ってください。`
              : `仅展示前 ${msg.matched} 条，请继续缩小条件。`,
            variant: "info",
            timeoutMs: 1600
          });
        }
        return;
      }

      if (msg.type === "error") {
        const desc = msg.message ? String(msg.message) : "";
        toast({
          title: isJapanese() ? "全件検索の処理に失敗" : "全站搜索处理失败",
          desc,
          variant: "error"
        });
        return;
      }
    });

    worker.addEventListener("error", () => {
      if (getSearchScope() !== "all") return;
      toast({
        title: isJapanese() ? "全件検索ワーカーが停止しました" : "全站搜索 Worker 异常停止",
        variant: "error"
      });
    });

    try {
      worker.postMessage({
        type: "init",
        postsUrl: href(NETWORK.POSTS_JSON_PATH),
        postsGzUrl: href(NETWORK.POSTS_JSON_GZ_PATH),
        indexUrl: href(NETWORK.SEARCH_PACK_V2_JSON_PATH),
        indexGzUrl: href(NETWORK.SEARCH_PACK_V2_JSON_GZ_PATH),
        indexUrlFallback: href(NETWORK.SEARCH_PACK_JSON_PATH),
        indexGzUrlFallback: href(NETWORK.SEARCH_PACK_JSON_GZ_PATH)
      } satisfies SearchWorkerInMessage);
    } catch {
      // ignore
    }
  };

  const syncWorkerState = () => {
    if (!worker) return;
    if (!stateDirty) return;
    stateDirty = false;
    try {
      worker.postMessage({
        type: "set_state",
        state: {
          readIds: [...readIds],
          follows: [...follows],
          blocklist: [...blocklist],
          disabledSources: [...disabledSources],
          followedSources: [...followedSources],
          filters
        }
      } satisfies SearchWorkerInMessage);
    } catch {
      stateDirty = true;
    }
  };

  const requestSearch = (q: string) => {
    if (!worker) return;
    const requestId = (workerRequestId += 1);
    latestRequestId = requestId;
    try {
      worker.postMessage({
        type: "search",
        requestId,
        q,
        freshWindowMs: UI.FRESH_WINDOW_MS
      } satisfies SearchWorkerInMessage);
    } catch {
      // ignore
    }
  };

  const renderResults = (list: BookmarkPost[], lang: BookmarkLang) => {
    ensureWrap();
    if (!grid) return;

    const useVirtual = list.length >= 240;
    if (useVirtual) {
      if (!virtual) {
        grid.innerHTML = "";
        virtual = createVirtualGrid<BookmarkPost>({
          container: grid,
          items: list,
          overscanRows: 6,
          estimateRowHeight: UI.BOOKMARK_CARD_ESTIMATE_ROW_HEIGHT,
          renderItem: (post) => buildBookmarkCard({ post, lang, readIds, bookmarkIds })
        });
      } else {
        virtual.setItems(list);
      }
      return;
    }

    if (virtual) destroyVirtual();

    const frag = document.createDocumentFragment();
    for (const post of list) frag.appendChild(buildBookmarkCard({ post, lang, readIds, bookmarkIds }));
    grid.innerHTML = "";
    grid.appendChild(frag);
  };

  const applyNow = () => {
    if (getSearchScope() !== "all") return;

    setPageGridVisible(false);

    ensureWorker(true);
    if (!worker) return;

    syncWorkerState();

    const q = input.value.trim();
    const shouldSearch =
      Boolean(q) || filters.hideRead || filters.onlyFollowed || filters.onlyFollowedSources;
    if (shouldSearch) {
      requestSearch(input.value);
    } else {
      renderResults([], getBookmarkLang());
      setCounterText(count, workerTotal > 0 ? `0/${workerTotal}` : "0/0");
      setCounterText(unreadCount, "0");
      setEmptyVisible(true);
      return;
    }

    if (!workerReady) {
      ensureWrap();
      if (grid) renderBookmarksSkeleton(grid);
    }

    setEmptyVisible(false);
  };

  const schedule = () => {
    if (getSearchScope() !== "all") return;
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      applyNow();
    });
  };

  const setEnabled = (enabled: boolean) => {
    setSearchScope(enabled ? "all" : "page");
    syncToggleUi();
    stateDirty = true;

    if (enabled) {
      ensureWrap();
      setPageGridVisible(false);
      track({ type: "search_scope", data: { scope: "all" } });
      toast({
        title: isJapanese() ? "全件検索モード" : "已切换到全站搜索",
        desc: isJapanese() ? "初回はデータを読み込みます。" : "首次使用会加载全部数据。",
        variant: "info",
        timeoutMs: 1400
      });
      schedule();
      return;
    }

    track({ type: "search_scope", data: { scope: "page" } });
    toast({
      title: isJapanese() ? "ページ内検索モード" : "已切换到本页搜索",
      variant: "info",
      timeoutMs: 1200
    });

    removeWrap();
    setPageGridVisible(true);
    // 让页面内筛选立刻接管并刷新计数/空态
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const applySearchPreset = (params: { presetRaw: string; lens?: TimeLens; sort?: SortMode }) => {
    const { presetRaw, lens, sort } = params;
    const preset = presetRaw.trim();
    if (!preset && !lens && !sort) return;

    try {
      if (preset) input.value = preset;
    } catch {
      // ignore
    }

    if (lens) {
      const lensBtn = document.querySelector<HTMLButtonElement>(`button[data-time-lens="${lens}"]`);
      if (lensBtn) {
        lensBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      } else if (filters.timeLens !== lens) {
        filters.timeLens = lens;
        saveFilters(filters);
        syncFilterDataset(filters);
        document.dispatchEvent(new CustomEvent("acg:filters-changed"));
      }
    }

    if (sort) {
      const sortBtn = document.querySelector<HTMLButtonElement>(`button[data-sort-mode="${sort}"]`);
      if (sortBtn) {
        sortBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      } else if (filters.sortMode !== sort) {
        filters.sortMode = sort;
        saveFilters(filters);
        syncFilterDataset(filters);
        document.dispatchEvent(new CustomEvent("acg:filters-changed"));
      }
    }

    if (getSearchScope() !== "all") {
      setEnabled(true);
    } else {
      schedule();
    }

    try {
      if (preset) input.dispatchEvent(new Event("input", { bubbles: true }));
    } catch {
      // ignore
    }

    try {
      const behavior = prefersReducedMotion() ? "auto" : "smooth";
      input.scrollIntoView({ behavior, block: "center" });
      input.focus();
      input.select();
      flashSearchFocusCue();
    } catch {
      // ignore
    }

    track({ type: "search_preset", data: { preset, lens, sort } });
    schedulePresetSync();
  };

  const syncSearchPresetState = () => {
    const chips = [...document.querySelectorAll<HTMLElement>("[data-search-preset]")];
    if (chips.length === 0) return;
    const currentPreset = input.value.trim();
    const currentLens = filters.timeLens ?? "all";
    const currentSort = filters.sortMode ?? "latest";
    const scopeAll = getSearchScope() === "all";

    for (const chip of chips) {
      const preset = String(chip.dataset.searchPreset ?? "").trim();
      const lensRaw = String(chip.dataset.searchPresetLens ?? "").trim();
      const sortRaw = String(chip.dataset.searchPresetSort ?? "").trim();
      const lens = lensRaw ? normalizeTimeLens(lensRaw) : null;
      const sort = sortRaw ? normalizeSortMode(sortRaw) : null;
      const presetMatch = preset ? preset === currentPreset : true;
      const lensMatch = lens ? lens === currentLens : true;
      const sortMatch = sort ? sort === currentSort : true;
      const active = scopeAll && presetMatch && lensMatch && sortMatch && Boolean(preset || lens || sort);
      chip.dataset.active = active ? "true" : "false";
      chip.setAttribute("aria-pressed", active ? "true" : "false");
    }
  };

  let presetSyncScheduled = false;
  const schedulePresetSync = () => {
    if (presetSyncScheduled) return;
    presetSyncScheduled = true;
    window.requestAnimationFrame(() => {
      presetSyncScheduled = false;
      syncSearchPresetState();
    });
  };

  document.addEventListener("click", (e) => {
    if (e.defaultPrevented) return;
    if (!(e.target instanceof HTMLElement)) return;
    const el = e.target.closest<HTMLElement>("[data-search-preset]");
    if (!el) return;
    const preset = String(el.dataset.searchPreset ?? "");
    const lensRaw = String(el.dataset.searchPresetLens ?? "").trim();
    const sortRaw = String(el.dataset.searchPresetSort ?? "").trim();
    const lens = lensRaw ? normalizeTimeLens(lensRaw) : undefined;
    const sort = sortRaw ? normalizeSortMode(sortRaw) : undefined;
    if (!preset.trim() && !lens && !sort) return;
    e.preventDefault();
    applySearchPreset({ presetRaw: preset, lens, sort });
  });

  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    const enabled = getSearchScope() === "all";
    setEnabled(!enabled);
    schedulePresetSync();
  });

  input.addEventListener("input", () => {
    schedule();
    schedulePresetSync();
  });
  input.addEventListener("focus", () => {
    if (!shouldPrefetchAllPosts()) return;
    void getBookmarkPostsById().catch(() => {
      // ignore
    });
  });
  document.addEventListener("acg:filters-changed", () => {
    stateDirty = true;
    schedule();
    schedulePresetSync();
  });
  document.addEventListener("acg:read-changed", () => {
    stateDirty = true;
    schedule();
  });
  document.addEventListener("acg:search-presets-mounted", schedulePresetSync);
  document.addEventListener("acg:search-scope-changed", () => {
    syncToggleUi();
    if (getSearchScope() === "all") schedule();
    schedulePresetSync();
  });

  // 静默预取：弱网/省流量偏好下不主动拉全量数据；否则在空闲时预热缓存。
  runWhenIdle(() => {
    if (!shouldPrefetchAllPosts()) return;
    if (getSearchScope() === "all") return;
    void getBookmarkPostsById().catch(() => {
      // ignore
    });
  }, UI.IDLE_DEFAULT_TIMEOUT_MS);

  // 初始：若用户上次停留在全站搜索，则自动恢复
  syncToggleUi();
  if (getSearchScope() === "all") setEnabled(true);
  schedulePresetSync();
}

type BookmarkMetaStore = {
  version: 1;
  savedAt: string;
  posts: BookmarkPost[];
};

function readBookmarkMetaCache(): Map<string, BookmarkPost> {
  try {
    const parsed = loadJson<{ version?: unknown; posts?: unknown }>(STORAGE_KEYS.BOOKMARK_META);
    const version = typeof parsed?.version === "number" ? parsed?.version : 0;
    if (version !== 1) return new Map();

    const postsRaw = parsed?.posts;
    if (!Array.isArray(postsRaw)) return new Map();

    const map = new Map<string, BookmarkPost>();
    for (const item of postsRaw) {
      if (!item || typeof item !== "object") continue;
      const it = item as Record<string, unknown>;
      const id = typeof it.id === "string" ? it.id : "";
      if (!id) continue;
      const post: BookmarkPost = {
        id,
        title: typeof it.title === "string" ? it.title : "",
        titleZh: typeof it.titleZh === "string" ? it.titleZh : undefined,
        titleJa: typeof it.titleJa === "string" ? it.titleJa : undefined,
        summary: typeof it.summary === "string" ? it.summary : undefined,
        summaryZh: typeof it.summaryZh === "string" ? it.summaryZh : undefined,
        summaryJa: typeof it.summaryJa === "string" ? it.summaryJa : undefined,
        preview: typeof it.preview === "string" ? it.preview : undefined,
        previewZh: typeof it.previewZh === "string" ? it.previewZh : undefined,
        previewJa: typeof it.previewJa === "string" ? it.previewJa : undefined,
        url: typeof it.url === "string" ? it.url : "",
        publishedAt: typeof it.publishedAt === "string" ? it.publishedAt : "",
        cover: typeof it.cover === "string" ? it.cover : undefined,
        coverOriginal: typeof it.coverOriginal === "string" ? it.coverOriginal : undefined,
        category: normalizeCategory(it.category),
        tags: Array.isArray(it.tags) ? it.tags.filter((x: unknown) => typeof x === "string") : undefined,
        sourceId: typeof it.sourceId === "string" ? it.sourceId : "",
        sourceName: typeof it.sourceName === "string" ? it.sourceName : "",
        sourceUrl: typeof it.sourceUrl === "string" ? it.sourceUrl : ""
      };
      map.set(id, post);
    }
    return map;
  } catch {
    return new Map();
  }
}

function writeBookmarkMetaCache(posts: BookmarkPost[]) {
  try {
    const sliced = posts.slice(0, UI.BOOKMARK_META_MAX_ITEMS);
    const payload: BookmarkMetaStore = { version: 1, savedAt: new Date().toISOString(), posts: sliced };
    saveJson(STORAGE_KEYS.BOOKMARK_META, payload);
  } catch {
    // ignore
  }
}

function renderBookmarksSkeleton(grid: HTMLElement) {
  const count = Math.max(1, UI.BOOKMARKS_SKELETON_CARDS);
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i += 1) {
    const card = document.createElement("article");
    card.className = "glass-card rounded-2xl p-4";
    card.setAttribute("aria-hidden", "true");
    card.innerHTML = `
      <div class="acg-skeleton aspect-[16/9] rounded-xl"></div>
      <div class="acg-skeleton mt-4 h-4 w-2/3 rounded"></div>
      <div class="acg-skeleton mt-2 h-3 w-5/6 rounded"></div>
      <div class="acg-skeleton mt-2 h-3 w-4/6 rounded"></div>
    `;
    frag.appendChild(card);
  }
  grid.innerHTML = "";
  grid.appendChild(frag);
}

function buildBookmarkCard(params: {
  post: BookmarkPost;
  lang: BookmarkLang;
  readIds: Set<string>;
  bookmarkIds: Set<string>;
}): HTMLElement {
  const { post, lang, readIds, bookmarkIds } = params;
  const theme = BOOKMARK_CATEGORY_THEME[post.category];
  const label = BOOKMARK_CATEGORY_LABELS[lang][post.category];
  const retryCoverLabel = lang === "ja" ? "画像を再試行" : "重试封面";
  const detailHref = href(`/${lang}/p/${post.id}/`);
  const when = whenLabel(lang, post.publishedAt);
  const publishedAtMs = new Date(post.publishedAt).getTime();
  const isFresh =
    Number.isFinite(publishedAtMs) &&
    Date.now() - publishedAtMs >= 0 &&
    Date.now() - publishedAtMs < UI.FRESH_WINDOW_MS;
  const freshLabel = lang === "ja" ? "新着" : "NEW";

  const displayTitle = lang === "zh" ? (post.titleZh ?? post.title) : (post.titleJa ?? post.title);
  const displaySnippet =
    lang === "zh"
      ? (post.summaryZh ?? post.previewZh ?? post.summary ?? post.preview)
      : (post.summaryJa ?? post.previewJa ?? post.summary ?? post.preview);

  const article = document.createElement("article");
  article.className =
    "acg-post-card acg-post-card-shell glass-card acg-card clickable shine group relative overflow-hidden rounded-2xl";
  article.dataset.postId = post.id;
  article.dataset.category = post.category;
  article.dataset.sourceId = post.sourceId;
  article.dataset.publishedAt = post.publishedAt;
  article.dataset.hasCover = post.cover ? "true" : "false";
  if (readIds.has(post.id)) article.setAttribute("data-read", "true");

  const cardBody = document.createElement("div");
  cardBody.className = "acg-post-card-body flex gap-3 p-3 sm:block sm:p-0";
  article.appendChild(cardBody);

  const coverWrap = document.createElement("div");
  coverWrap.className = "acg-post-card-cover relative w-32 shrink-0 sm:w-full";
  cardBody.appendChild(coverWrap);

  const topLink = document.createElement("a");
  topLink.href = detailHref;
  topLink.className =
    "acg-post-card-cover-link relative block aspect-[4/3] overflow-hidden rounded-xl sm:aspect-[16/9] sm:rounded-none";
  topLink.setAttribute("aria-label", displayTitle || (lang === "ja" ? "（無題）" : "（无标题）"));
  topLink.title = displayTitle || (lang === "ja" ? "（無題）" : "（无标题）");
  coverWrap.appendChild(topLink);

  const retryBtn = document.createElement("button");
  retryBtn.type = "button";
  retryBtn.className = "acg-cover-retry glass-card clickable";
  retryBtn.dataset.coverRetry = "true";
  retryBtn.setAttribute("aria-label", retryCoverLabel);
  retryBtn.title = retryCoverLabel;
  retryBtn.appendChild(createUiIcon({ name: "refresh", size: 18 }));
  coverWrap.appendChild(retryBtn);

  const coverGrad = document.createElement("div");
  coverGrad.className = `absolute inset-0 bg-gradient-to-br ${theme.cover}`;
  topLink.appendChild(coverGrad);

  const fallback = document.createElement("div");
  fallback.className = "acg-cover-fallback";
  fallback.setAttribute("aria-hidden", "true");
  const fallbackInner = document.createElement("div");
  fallbackInner.className = "acg-cover-fallback-inner";

  const fallbackIcon = document.createElement("div");
  fallbackIcon.className = "acg-cover-fallback-icon";
  fallbackIcon.appendChild(createCategoryIcon({ category: post.category, size: 22 }));

  const fallbackBrand = document.createElement("div");
  fallbackBrand.className = "acg-cover-fallback-brand";
  fallbackBrand.textContent = "ACG Radar";

  const fallbackMeta = document.createElement("div");
  fallbackMeta.className = "acg-cover-fallback-meta";
  fallbackMeta.textContent = label;

  fallbackInner.appendChild(fallbackIcon);
  fallbackInner.appendChild(fallbackBrand);
  fallbackInner.appendChild(fallbackMeta);
  fallback.appendChild(fallbackInner);
  topLink.appendChild(fallback);

  const initialCoverUrl = post.coverOriginal ?? post.cover;
  if (post.cover && !isBlockedRemoteCoverUrl(initialCoverUrl)) {
    const img = document.createElement("img");
    img.src = bestInitialCoverSrc(post.cover, 960);
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.dataset.acgCover = "true";
    img.dataset.acgCoverOriginalSrc = initialCoverUrl;
    img.className =
      "absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]";
    img.addEventListener("load", () => handleCoverLoad(img));
    img.addEventListener("error", () => {
      article.classList.add("cover-failed");
      img.style.opacity = "0";
      img.style.pointerEvents = "none";
      handleCoverError(img);
    });
    topLink.appendChild(img);
  }

  const overlay = document.createElement("div");
  overlay.className = "absolute inset-0 bg-gradient-to-t from-slate-950/45 via-slate-950/10 to-transparent";
  topLink.appendChild(overlay);

  const badgeWrap = document.createElement("div");
  badgeWrap.className =
    "acg-post-card-cover-badges absolute left-3 top-3 hidden flex-wrap items-center gap-2 sm:flex";
  const badge = document.createElement("span");
  badge.className =
    "inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white";
  const dot = document.createElement("span");
  dot.className = `size-1.5 rounded-full ${theme.dot}`;
  const badgeText = document.createElement("span");
  badgeText.textContent = label;
  badge.appendChild(dot);
  badge.appendChild(badgeText);
  badgeWrap.appendChild(badge);

  if (isFresh) {
    const fresh = document.createElement("span");
    fresh.className =
      "inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/90";
    const freshDot = document.createElement("span");
    freshDot.className = "acg-dot-pulse size-1.5 rounded-full bg-emerald-400";
    const freshText = document.createElement("span");
    freshText.textContent = freshLabel;
    fresh.appendChild(freshDot);
    fresh.appendChild(freshText);
    badgeWrap.appendChild(fresh);
  }

  topLink.appendChild(badgeWrap);

  const whenWrap = document.createElement("div");
  whenWrap.className = "acg-post-card-cover-when absolute bottom-3 left-3 hidden sm:block";
  const whenChip = document.createElement("span");
  whenChip.className =
    "inline-flex max-w-[22ch] truncate rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/90";
  whenChip.textContent = when;
  whenWrap.appendChild(whenChip);
  topLink.appendChild(whenWrap);

  const body = document.createElement("div");
  body.className = "acg-post-card-content min-w-0 flex-1 py-1 sm:p-5";
  cardBody.appendChild(body);

  const head = document.createElement("div");
  head.className = "flex items-start justify-between gap-3";
  body.appendChild(head);

  const left = document.createElement("div");
  left.className = "min-w-0";
  head.appendChild(left);

  const titleLink = document.createElement("a");
  titleLink.href = detailHref;
  titleLink.className =
    "acg-post-card-title block text-[15px] font-semibold leading-snug text-slate-950 hover:underline line-clamp-2 sm:text-base";
  titleLink.textContent = displayTitle || (lang === "ja" ? "（無題）" : "（无标题）");
  left.appendChild(titleLink);

  const meta = document.createElement("div");
  meta.className =
    "acg-post-card-meta mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-600 sm:text-xs";
  left.appendChild(meta);

  const categoryMeta = document.createElement("span");
  categoryMeta.className = "inline-flex items-center gap-2 font-medium text-slate-700";
  const categoryMetaDot = document.createElement("span");
  categoryMetaDot.className = `size-1.5 rounded-full ${theme.dot}`;
  const categoryMetaText = document.createElement("span");
  categoryMetaText.textContent = label;
  categoryMeta.appendChild(categoryMetaDot);
  categoryMeta.appendChild(categoryMetaText);
  meta.appendChild(categoryMeta);

  const sep = document.createElement("span");
  sep.className = "text-slate-400";
  sep.textContent = "·";
  meta.appendChild(sep);

  const whenText = document.createElement("span");
  whenText.textContent = when;
  meta.appendChild(whenText);

  if (isFresh) {
    const freshChip = document.createElement("span");
    freshChip.className =
      "inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-800";
    const freshDot = document.createElement("span");
    freshDot.className = "acg-dot-pulse size-1.5 rounded-full bg-emerald-500";
    const freshText = document.createElement("span");
    freshText.textContent = freshLabel;
    freshChip.appendChild(freshDot);
    freshChip.appendChild(freshText);
    meta.appendChild(freshChip);
  }

  const sourceRow = document.createElement("div");
  sourceRow.className = "mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs";
  left.appendChild(sourceRow);

  if (post.sourceUrl && post.sourceName) {
    const sourceLink = document.createElement("a");
    sourceLink.className =
      "inline-flex items-center gap-2 rounded-full border border-slate-900/10 bg-white/55 px-2.5 py-1 text-[11px] text-slate-700 hover:bg-white/75 clickable";
    sourceLink.href = post.sourceUrl;
    sourceLink.target = "_blank";
    sourceLink.rel = "noreferrer noopener";
    sourceLink.dataset.sourceBadge = "true";
    sourceLink.dataset.sourceName = post.sourceName;

    const sourceDot = document.createElement("span");
    sourceDot.className = `size-1.5 rounded-full ${theme.dot}`;
    sourceLink.appendChild(sourceDot);

    const sourceText = document.createElement("span");
    sourceText.className = "min-w-0 max-w-[22ch] truncate";
    sourceText.textContent = post.sourceName;
    sourceLink.appendChild(sourceText);

    const sourceIcon = document.createElement("span");
    sourceIcon.className = "text-slate-500";
    sourceIcon.setAttribute("aria-hidden", "true");
    sourceIcon.appendChild(createUiIcon({ name: "external-link", size: 14 }));
    sourceLink.appendChild(sourceIcon);

    sourceRow.appendChild(sourceLink);
  }

  const star = document.createElement("button");
  star.type = "button";
  star.className =
    "acg-post-card-bookmark glass-card rounded-full p-2 text-xs font-medium text-slate-950 clickable sm:rounded-xl sm:px-3 sm:py-2";
  star.dataset.bookmarkId = post.id;
  const bookmarked = bookmarkIds.has(post.id);
  const bookmarkLabel = lang === "ja" ? "ブックマーク" : "收藏";
  star.title = bookmarkLabel;
  star.setAttribute("aria-label", bookmarkLabel);
  const starIcon = document.createElement("span");
  starIcon.setAttribute("data-bookmark-icon", "");
  starIcon.setAttribute("aria-hidden", "true");
  starIcon.appendChild(createUiIcon({ name: "star", size: 18 }));
  star.appendChild(starIcon);
  setBookmarkButtonState(star, bookmarked);
  head.appendChild(star);

  if (displaySnippet) {
    const p = document.createElement("p");
    p.className =
      "acg-post-card-snippet mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600 sm:line-clamp-3";
    p.textContent = displaySnippet;
    body.appendChild(p);
  }

  if (Array.isArray(post.tags) && post.tags.length > 0) {
    const wrap = document.createElement("div");
    wrap.className =
      "acg-hscroll mt-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0";
    for (const tag of post.tags.slice(0, 4)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `acg-post-card-tag shrink-0 whitespace-nowrap rounded-full border border-slate-900/10 bg-white/50 px-2.5 py-1 text-xs hover:bg-white/70 clickable ${theme.ink}`;
      btn.dataset.tag = tag;
      btn.textContent = tag;
      wrap.appendChild(btn);
    }
    body.appendChild(wrap);
  }

  return article;
}

function wireBookmarksPage(bookmarkIds: Set<string>, readIds: Set<string>) {
  const container = document.querySelector<HTMLElement>("#acg-bookmarks");
  if (!container) return;

  const grid = container.querySelector<HTMLElement>("#acg-bookmarks-grid");
  if (!grid) {
    // 兼容旧页面：如果仍然是“预渲染 300 条再隐藏”，沿用旧逻辑。
    const applyLegacy = () => {
      const cards = container.querySelectorAll<HTMLElement>("[data-post-id]");
      let shown = 0;
      for (const card of cards) {
        const id = card.dataset.postId ?? "";
        const ok = bookmarkIds.has(id);
        card.classList.toggle("hidden", !ok);
        if (ok) shown += 1;
      }
      container.hidden = false;
      const count = document.querySelector<HTMLElement>("#acg-bookmarks-count");
      if (count) count.textContent = String(shown);
      const empty = document.querySelector<HTMLElement>("#acg-bookmarks-empty");
      if (empty) empty.classList.toggle("hidden", shown > 0);
    };
    applyLegacy();
    document.addEventListener("acg:bookmarks-changed", applyLegacy);
    return;
  }

  const lang = getBookmarkLang();
  const count = document.querySelector<HTMLElement>("#acg-bookmarks-count");
  const empty = document.querySelector<HTMLElement>("#acg-bookmarks-empty");

  let renderedIds = new Set<string>();
  let applyRunning = false;
  let virtual: VirtualGridController<BookmarkPost> | null = null;

  const apply = async () => {
    if (applyRunning) return;
    applyRunning = true;

    try {
      if (bookmarkIds.size === 0) {
        grid.innerHTML = "";
        renderedIds = new Set();
        container.hidden = true;
        clearBookmarksMessage();
        try {
          virtual?.destroy();
        } catch {
          // ignore
        }
        virtual = null;
        if (count) count.textContent = "0";
        if (empty) empty.classList.remove("hidden");
        return;
      }

      clearBookmarksMessage();
      let usedOptimistic = false;

      // 慢网体验：若用户确实有收藏，但 posts.json 还在路上，先展示骨架/缓存，避免页面长时间“看起来是空的”。
      if (renderedIds.size === 0) {
        try {
          if (count) count.textContent = String(bookmarkIds.size);
          container.hidden = false;
          empty?.classList.add("hidden");

          const metaById = readBookmarkMetaCache();
          const optimistic: BookmarkPost[] = [];
          const optimisticMissing: string[] = [];
          for (const id of bookmarkIds) {
            const post = metaById.get(id);
            if (post) optimistic.push(post);
            else optimisticMissing.push(id);
          }

          if (optimistic.length > 0) {
            optimistic.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
            const frag = document.createDocumentFragment();
            for (const post of optimistic)
              frag.appendChild(buildBookmarkCard({ post, lang, readIds, bookmarkIds }));
            grid.innerHTML = "";
            grid.appendChild(frag);
            renderedIds = new Set(optimistic.map((p) => p.id));
            usedOptimistic = true;

            if (optimisticMissing.length > 0) {
              setBookmarksMessage(
                lang === "ja"
                  ? "ローカルキャッシュを表示中…同期しています。"
                  : "已显示本地缓存…正在同步更新。"
              );
            }
          } else {
            renderBookmarksSkeleton(grid);
          }
        } catch {
          // ignore
        }
      }

      const byId = await getBookmarkPostsById();

      const list: BookmarkPost[] = [];
      const missing: string[] = [];
      for (const id of bookmarkIds) {
        const post = byId.get(id);
        if (post) list.push(post);
        else missing.push(id);
      }
      list.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
      renderedIds = new Set(list.map((p) => p.id));
      writeBookmarkMetaCache(list);

      const useVirtual = list.length >= UI.BOOKMARKS_VIRTUALIZE_THRESHOLD;
      if (useVirtual) {
        if (!virtual) {
          grid.innerHTML = "";
          virtual = createVirtualGrid<BookmarkPost>({
            container: grid,
            items: list,
            overscanRows: 6,
            estimateRowHeight: UI.BOOKMARK_CARD_ESTIMATE_ROW_HEIGHT,
            renderItem: (post) => buildBookmarkCard({ post, lang, readIds, bookmarkIds })
          });
        } else {
          virtual.setItems(list);
        }
      } else {
        if (virtual) {
          try {
            virtual.destroy();
          } catch {
            // ignore
          }
          virtual = null;
        }
        const frag = document.createDocumentFragment();
        for (const post of list) frag.appendChild(buildBookmarkCard({ post, lang, readIds, bookmarkIds }));
        grid.innerHTML = "";
        grid.appendChild(frag);
      }

      if (missing.length > 0) {
        setBookmarksMessage(
          lang === "ja"
            ? `一部のブックマークは期間外のため表示できません（${missing.length}件）。`
            : `部分收藏因超出数据保留期而无法展示（${missing.length} 条）。`
        );
      } else if (!usedOptimistic) {
        clearBookmarksMessage();
      }

      container.hidden = false;
      if (count) count.textContent = String(renderedIds.size);
      if (empty) empty.classList.toggle("hidden", renderedIds.size > 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      container.hidden = true;
      if (count) count.textContent = "0";
      if (empty) empty?.classList.remove("hidden");
      setBookmarksMessage(lang === "ja" ? `読み込み失敗: ${msg}` : `加载失败：${msg}`);
      toast({
        title: lang === "ja" ? "ブックマーク読み込み失敗" : "收藏加载失败",
        desc: msg,
        variant: "error"
      });
    } finally {
      applyRunning = false;
    }
  };

  void apply();
  document.addEventListener("acg:bookmarks-changed", () => void apply());
}

function setBookmarksMessage(text: string) {
  const el = document.querySelector<HTMLElement>("#acg-bookmarks-message");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("hidden");
}

function clearBookmarksMessage() {
  const el = document.querySelector<HTMLElement>("#acg-bookmarks-message");
  if (!el) return;
  el.textContent = "";
  el.classList.add("hidden");
}

function wireBookmarkTools(bookmarkIds: Set<string>) {
  const exportBtn = document.querySelector<HTMLButtonElement>("#acg-bookmarks-export");
  const importBtn = document.querySelector<HTMLButtonElement>("#acg-bookmarks-import");
  const clearBtn = document.querySelector<HTMLButtonElement>("#acg-bookmarks-clear");
  const importFile = document.querySelector<HTMLInputElement>("#acg-bookmarks-import-file");

  if (!exportBtn && !importBtn && !clearBtn) return;

  const downloadJson = (filename: string, data: unknown) => {
    const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  exportBtn?.addEventListener("click", () => {
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, "").replace("T", "-").slice(0, 15);
    const payload = {
      version: 1,
      exportedAt: now.toISOString(),
      ids: [...bookmarkIds]
    };
    downloadJson(`acg-bookmarks-${stamp}.json`, payload);
    setBookmarksMessage(isJapanese() ? "エクスポートしました。" : "已导出收藏。");
  });

  importBtn?.addEventListener("click", () => {
    importFile?.click();
  });

  importFile?.addEventListener("change", async () => {
    const file = importFile.files?.[0];
    importFile.value = "";
    if (!file) return;

    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as unknown;
      const ids = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>).ids
          : null;

      const list = Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
      const before = bookmarkIds.size;
      for (const id of list) bookmarkIds.add(id);
      saveIds(BOOKMARK_KEY, bookmarkIds);
      document.dispatchEvent(new CustomEvent("acg:bookmarks-changed"));

      const added = bookmarkIds.size - before;
      setBookmarksMessage(isJapanese() ? `インポート完了（+${added}）。` : `导入完成（新增 +${added}）。`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setBookmarksMessage(isJapanese() ? `インポート失敗: ${msg}` : `导入失败：${msg}`);
    }
  });

  clearBtn?.addEventListener("click", () => {
    const ok = confirm(isJapanese() ? "ブックマークを全て削除しますか？" : "确定要清空所有收藏吗？");
    if (!ok) return;
    bookmarkIds.clear();
    saveIds(BOOKMARK_KEY, bookmarkIds);
    document.dispatchEvent(new CustomEvent("acg:bookmarks-changed"));
    setBookmarksMessage(isJapanese() ? "クリアしました。" : "已清空收藏。");
  });
}

function setPrefsMessage(text: string) {
  const el = document.querySelector<HTMLElement>("#acg-prefs-message");
  if (!el) return;
  el.classList.remove("hidden");
  el.textContent = text;
}

function renderWordChips(params: {
  container: HTMLElement;
  words: Set<string>;
  color: "violet" | "rose";
  onRemove: (word: string) => void;
}) {
  const { container, words, color, onRemove } = params;
  container.innerHTML = "";
  const list = [...words].filter(Boolean).slice(0, 30);
  for (const word of list) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      color === "violet"
        ? "acg-word-chip inline-flex items-center gap-2 rounded-full border border-slate-900/10 bg-white/50 px-3 py-1 text-xs text-slate-700 hover:bg-white/70 clickable"
        : "acg-word-chip inline-flex items-center gap-2 rounded-full border border-rose-600/20 bg-rose-500/10 px-3 py-1 text-xs text-rose-800 hover:bg-rose-500/15 clickable";

    const text = document.createElement("span");
    text.textContent = word;
    btn.appendChild(text);

    const x = document.createElement("span");
    x.className = "acg-word-chip-x";
    x.setAttribute("aria-hidden", "true");
    x.appendChild(createUiIcon({ name: "x", size: 14 }));
    btn.appendChild(x);
    btn.title = isJapanese() ? "クリックで削除" : "点击删除";
    btn.setAttribute(
      "aria-label",
      isJapanese()
        ? color === "rose"
          ? `除外から削除: ${word}`
          : `フォローから削除: ${word}`
        : color === "rose"
          ? `删除屏蔽关键词：${word}`
          : `删除关注关键词：${word}`
    );
    btn.addEventListener("click", () => onRemove(word));
    container.appendChild(btn);
  }
}

function wirePreferences(params: { follows: Set<string>; blocklist: Set<string>; filters: FilterStore }) {
  const { follows, blocklist, filters } = params;

  const onlyFollowed = document.querySelector<HTMLInputElement>("#acg-only-followed");
  const onlyFollowedSources = document.querySelector<HTMLInputElement>("#acg-only-followed-sources");
  const hideRead = document.querySelector<HTMLInputElement>("#acg-hide-read");
  const onlyStable = document.querySelector<HTMLInputElement>("#acg-only-stable-sources");
  const dedup = document.querySelector<HTMLInputElement>("#acg-dedup-view");
  const lensButtons = [...document.querySelectorAll<HTMLButtonElement>("button[data-time-lens]")];
  const sortButtons = [...document.querySelectorAll<HTMLButtonElement>("button[data-sort-mode]")];
  const followInput = document.querySelector<HTMLInputElement>("#acg-follow-input");
  const followAdd = document.querySelector<HTMLButtonElement>("#acg-follow-add");
  const followList = document.querySelector<HTMLElement>("#acg-follow-list");
  const blockInput = document.querySelector<HTMLInputElement>("#acg-block-input");
  const blockAdd = document.querySelector<HTMLButtonElement>("#acg-block-add");
  const blockList = document.querySelector<HTMLElement>("#acg-block-list");
  const searchInput = document.querySelector<HTMLInputElement>("#acg-search");
  const summaryCount = document.querySelector<HTMLElement>("#acg-filter-summary-count");
  const summaryChips = document.querySelector<HTMLElement>("#acg-filter-summary-chips");
  const summaryEmpty = document.querySelector<HTMLElement>("#acg-filter-summary-empty");
  const resetFiltersBtn = document.querySelector<HTMLButtonElement>("#acg-reset-filters");

  if (
    !onlyFollowed ||
    !onlyFollowedSources ||
    !hideRead ||
    !onlyStable ||
    !dedup ||
    !followInput ||
    !followAdd ||
    !followList ||
    !blockInput ||
    !blockAdd ||
    !blockList
  ) {
    return;
  }

  const summaryText = isJapanese()
    ? {
        scope: "範囲",
        scopePage: "ページ内",
        scopeAll: "全件",
        q: "Q",
        followOnly: "キーワード一致のみ",
        followedSourcesOnly: "フォローソースのみ",
        hideRead: "既読を除外",
        onlyStable: "安定ソースのみ",
        dedup: "重複を統合",
        lens: "時間",
        sort: "並び",
        followWords: "フォロー語",
        blockWords: "除外語",
        resetDone: "検索条件をリセットしました。"
      }
    : {
        scope: "范围",
        scopePage: "本页",
        scopeAll: "全站",
        q: "Q",
        followOnly: "仅关注关键词",
        followedSourcesOnly: "仅关注来源",
        hideRead: "隐藏已读",
        onlyStable: "仅稳定来源",
        dedup: "合并重复",
        lens: "时间窗",
        sort: "排序",
        followWords: "关注词",
        blockWords: "屏蔽词",
        resetDone: "已重置搜索条件。"
      };

  const lensLabel = (lens: TimeLens): string => {
    if (lens === "2h") return isJapanese() ? "2時間" : "2小时";
    if (lens === "6h") return isJapanese() ? "6時間" : "6小时";
    if (lens === "24h") return isJapanese() ? "24時間" : "24小时";
    return isJapanese() ? "すべて" : "全部";
  };

  const sortLabel = (mode: SortMode): string =>
    mode === "pulse" ? (isJapanese() ? "Pulse" : "热度") : isJapanese() ? "最新" : "最新";

  const createSummaryChip = (label: string, strong = false): HTMLElement => {
    const chip = document.createElement("span");
    chip.className = "acg-filter-chip";
    if (strong) chip.dataset.strong = "true";
    chip.textContent = label;
    return chip;
  };

  const renderFilterSummary = () => {
    if (!summaryChips || !summaryEmpty) return;
    const chips: HTMLElement[] = [];
    let activeCount = 0;

    const scope = getSearchScope();
    chips.push(
      createSummaryChip(
        `${summaryText.scope}: ${scope === "all" ? summaryText.scopeAll : summaryText.scopePage}`
      )
    );

    const q = (searchInput?.value ?? "").trim();
    if (q) {
      activeCount += 1;
      const brief = q.length > 20 ? `${q.slice(0, 20)}...` : q;
      chips.push(createSummaryChip(`${summaryText.q}: ${brief}`, true));
    }
    if (filters.onlyFollowed) {
      activeCount += 1;
      chips.push(createSummaryChip(summaryText.followOnly));
    }
    if (filters.onlyFollowedSources) {
      activeCount += 1;
      chips.push(createSummaryChip(summaryText.followedSourcesOnly));
    }
    if (filters.hideRead) {
      activeCount += 1;
      chips.push(createSummaryChip(summaryText.hideRead));
    }
    if (filters.onlyStableSources) {
      activeCount += 1;
      chips.push(createSummaryChip(summaryText.onlyStable));
    }
    if (filters.dedup) {
      activeCount += 1;
      chips.push(createSummaryChip(summaryText.dedup));
    }
    if (filters.timeLens !== "all") {
      activeCount += 1;
      chips.push(createSummaryChip(`${summaryText.lens}: ${lensLabel(filters.timeLens)}`));
    }
    if (filters.sortMode !== "latest") {
      activeCount += 1;
      chips.push(createSummaryChip(`${summaryText.sort}: ${sortLabel(filters.sortMode)}`));
    }
    if (follows.size > 0) {
      activeCount += 1;
      chips.push(createSummaryChip(`${summaryText.followWords}: ${follows.size}`));
    }
    if (blocklist.size > 0) {
      activeCount += 1;
      chips.push(createSummaryChip(`${summaryText.blockWords}: ${blocklist.size}`));
    }

    summaryChips.innerHTML = "";
    for (const chip of chips) summaryChips.appendChild(chip);
    summaryEmpty.classList.toggle("hidden", activeCount > 0);
    if (summaryCount) summaryCount.textContent = String(activeCount);
  };

  onlyFollowed.checked = filters.onlyFollowed;
  onlyFollowedSources.checked = filters.onlyFollowedSources;
  hideRead.checked = filters.hideRead;
  onlyStable.checked = filters.onlyStableSources;
  dedup.checked = filters.dedup;

  const syncSegments = () => {
    for (const btn of lensButtons) {
      const lens = normalizeTimeLens(btn.dataset.timeLens);
      const active = lens === filters.timeLens;
      btn.dataset.active = active ? "true" : "false";
      btn.setAttribute("aria-checked", active ? "true" : "false");
    }
    for (const btn of sortButtons) {
      const mode = normalizeSortMode(btn.dataset.sortMode);
      const active = mode === filters.sortMode;
      btn.dataset.active = active ? "true" : "false";
      btn.setAttribute("aria-checked", active ? "true" : "false");
    }
    syncRadioGroupsFromButtons([...lensButtons, ...sortButtons]);
  };

  const emit = () => {
    syncFilterDataset(filters);
    syncSegments();
    renderFilterSummary();
    document.dispatchEvent(new CustomEvent("acg:filters-changed"));
  };

  const saveAll = () => {
    saveWords(FOLLOWS_KEY, follows);
    saveWords(BLOCKLIST_KEY, blocklist);
    saveFilters(filters);
    emit();
  };

  const render = () => {
    renderWordChips({
      container: followList,
      words: follows,
      color: "violet",
      onRemove: (w) => {
        follows.delete(w);
        saveAll();
        setPrefsMessage(isJapanese() ? "フォローを削除しました。" : "已删除关注关键词。");
        render();
      }
    });
    renderWordChips({
      container: blockList,
      words: blocklist,
      color: "rose",
      onRemove: (w) => {
        blocklist.delete(w);
        saveAll();
        setPrefsMessage(isJapanese() ? "除外キーワードを削除しました。" : "已删除屏蔽关键词。");
        render();
      }
    });
  };

  render();
  syncSegments();
  renderFilterSummary();

  searchInput?.addEventListener("input", renderFilterSummary);
  document.addEventListener("acg:search-scope-changed", renderFilterSummary);

  resetFiltersBtn?.addEventListener("click", () => {
    const hadSearch = Boolean((searchInput?.value ?? "").trim());
    const hadFilter =
      filters.onlyFollowed ||
      filters.onlyFollowedSources ||
      filters.hideRead ||
      filters.onlyStableSources ||
      filters.dedup ||
      filters.timeLens !== "all" ||
      filters.sortMode !== "latest";

    if (searchInput) {
      searchInput.value = "";
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    filters.onlyFollowed = false;
    filters.onlyFollowedSources = false;
    filters.hideRead = false;
    filters.onlyStableSources = false;
    filters.dedup = false;
    filters.timeLens = "all";
    filters.sortMode = "latest";

    onlyFollowed.checked = false;
    onlyFollowedSources.checked = false;
    hideRead.checked = false;
    onlyStable.checked = false;
    dedup.checked = false;

    saveFilters(filters);
    emit();

    if (hadSearch || hadFilter) setPrefsMessage(summaryText.resetDone);
  });

  onlyFollowed.addEventListener("change", () => {
    filters.onlyFollowed = onlyFollowed.checked;
    saveFilters(filters);
    emit();
  });
  onlyFollowedSources.addEventListener("change", () => {
    filters.onlyFollowedSources = onlyFollowedSources.checked;
    saveFilters(filters);
    emit();
  });
  hideRead.addEventListener("change", () => {
    filters.hideRead = hideRead.checked;
    saveFilters(filters);
    emit();
  });
  onlyStable.addEventListener("change", () => {
    filters.onlyStableSources = onlyStable.checked;
    saveFilters(filters);
    emit();
  });
  dedup.addEventListener("change", () => {
    filters.dedup = dedup.checked;
    saveFilters(filters);
    emit();
  });

  for (const btn of lensButtons) {
    btn.addEventListener("click", () => {
      const lens = normalizeTimeLens(btn.dataset.timeLens);
      filters.timeLens = lens;
      saveFilters(filters);
      emit();
    });
  }

  for (const btn of sortButtons) {
    btn.addEventListener("click", () => {
      const mode = normalizeSortMode(btn.dataset.sortMode);
      filters.sortMode = mode;
      saveFilters(filters);
      emit();
    });
  }

  const addFollow = () => {
    const raw = followInput.value;
    followInput.value = "";
    const word = normalizeWord(raw);
    if (!word) return;
    follows.add(word);
    saveAll();
    setPrefsMessage(isJapanese() ? "フォローに追加しました。" : "已添加关注关键词。");
    render();
  };
  followAdd.addEventListener("click", addFollow);
  followInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addFollow();
  });

  const addBlock = () => {
    const raw = blockInput.value;
    blockInput.value = "";
    const word = normalizeWord(raw);
    if (!word) return;
    blocklist.add(word);
    saveAll();
    setPrefsMessage(isJapanese() ? "除外に追加しました。" : "已添加屏蔽关键词。");
    render();
  };
  blockAdd.addEventListener("click", addBlock);
  blockInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addBlock();
  });
}

function wireViewPresets(filters: FilterStore) {
  const list = document.querySelector<HTMLElement>("#acg-view-presets");
  const saveBtn = document.querySelector<HTMLButtonElement>("#acg-view-save");
  const copyBtn = document.querySelector<HTMLButtonElement>("#acg-view-copy-link");
  if (!list || !saveBtn || !copyBtn) return;

  const dialog = document.querySelector<HTMLDialogElement>("#acg-view-save-dialog");
  const nameInput = document.querySelector<HTMLInputElement>("#acg-view-save-name");
  const closeBtn = dialog?.querySelector<HTMLButtonElement>("[data-view-dialog-close]") ?? null;
  const cancelBtn = dialog?.querySelector<HTMLButtonElement>("[data-view-dialog-cancel]") ?? null;
  const confirmBtn = dialog?.querySelector<HTMLButtonElement>("[data-view-dialog-save]") ?? null;

  const isLangJa = isJapanese();
  const txt = {
    empty: isLangJa ? "保存したビューはまだありません。" : "暂无已保存视图。",
    apply: isLangJa ? "適用" : "应用",
    rename: isLangJa ? "名前変更" : "重命名",
    remove: isLangJa ? "削除" : "删除",
    link: isLangJa ? "リンク" : "链接",
    saved: isLangJa ? "ビューを保存しました" : "已保存视图",
    renamed: isLangJa ? "名前を更新しました" : "已更新名称",
    deleted: isLangJa ? "削除しました" : "已删除",
    copied: isLangJa ? "リンクをコピーしました" : "链接已复制",
    copyFailed: isLangJa ? "复制に失敗しました" : "复制失败",
    applied: isLangJa ? "適用しました" : "已应用",
    invalidName: isLangJa ? "名前を入力してください" : "请输入名称",
    tooMany: isLangJa ? "保存数が上限です" : "保存数量已达上限",
    promptRename: isLangJa ? "新しい名前" : "新的名称"
  } as const;

  const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object");

  const makeId = (): string => {
    try {
      const u = crypto.randomUUID?.();
      if (u) return u;
    } catch {
      // ignore
    }
    const rand = Math.random().toString(16).slice(2);
    return `v_${Date.now().toString(16)}_${rand}`;
  };

  const normalizePreset = (raw: unknown): ViewPresetV1 | null => {
    if (!isRecord(raw)) return null;
    if (raw.version !== 1) return null;
    const id = typeof raw.id === "string" ? raw.id : "";
    const name = typeof raw.name === "string" ? raw.name : "";
    const createdAt = typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt) ? raw.createdAt : 0;
    const snapshotRaw = raw.snapshot;
    if (!id || !name || !createdAt || !isRecord(snapshotRaw)) return null;

    const filtersRaw = snapshotRaw.filters;
    if (!isRecord(filtersRaw)) return null;

    const snap: ViewSnapshotV1 = {
      q: typeof snapshotRaw.q === "string" ? snapshotRaw.q : "",
      scope: snapshotRaw.scope === "all" ? "all" : "page",
      filters: {
        onlyFollowed: filtersRaw.onlyFollowed === true,
        onlyFollowedSources: filtersRaw.onlyFollowedSources === true,
        hideRead: filtersRaw.hideRead === true,
        onlyStableSources: filtersRaw.onlyStableSources === true,
        dedup: filtersRaw.dedup === true,
        timeLens: normalizeTimeLens(filtersRaw.timeLens),
        sortMode: normalizeSortMode(filtersRaw.sortMode)
      },
      view: snapshotRaw.view === "list" ? "list" : "grid",
      density: snapshotRaw.density === "compact" ? "compact" : "comfort",
      theme: snapshotRaw.theme === "light" || snapshotRaw.theme === "dark" ? snapshotRaw.theme : "auto",
      accent: normalizeAccentMode(snapshotRaw.accent)
    };

    return { version: 1, id, name, createdAt, snapshot: snap };
  };

  const loadPresets = (): ViewPresetV1[] => {
    try {
      const parsed = loadJson<Record<string, unknown>>(VIEW_PRESETS_KEY);
      if (!parsed || parsed.version !== 1) return [];
      const listRaw = parsed.presets;
      if (!Array.isArray(listRaw)) return [];
      const presets = listRaw.map((x) => normalizePreset(x)).filter((x): x is ViewPresetV1 => Boolean(x));
      return presets.sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [];
    }
  };

  const savePresets = (presets: ViewPresetV1[]) => {
    try {
      const store = { version: 1, presets } satisfies ViewPresetStoreV1;
      saveJson(VIEW_PRESETS_KEY, store);
    } catch {
      // ignore
    }
  };

  const snapshotCurrent = (): ViewSnapshotV1 => {
    const input = document.querySelector<HTMLInputElement>("#acg-search");
    const q = (input?.value ?? "").trim();
    return {
      q,
      scope: getSearchScope(),
      filters: {
        onlyFollowed: Boolean(filters.onlyFollowed),
        onlyFollowedSources: Boolean(filters.onlyFollowedSources),
        hideRead: Boolean(filters.hideRead),
        onlyStableSources: Boolean(filters.onlyStableSources),
        dedup: Boolean(filters.dedup),
        timeLens: filters.timeLens,
        sortMode: filters.sortMode
      },
      view: loadViewMode(),
      density: loadDensityMode(),
      theme: loadThemeMode(),
      accent: loadAccentMode()
    };
  };

  const click = (selector: string): boolean => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return false;
    try {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      return true;
    } catch {
      try {
        (el as HTMLElement).click();
        return true;
      } catch {
        return false;
      }
    }
  };

  const setCheckbox = (id: string, checked: boolean): boolean => {
    const el = document.querySelector<HTMLInputElement>(id);
    if (!el) return false;
    try {
      el.checked = checked;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  };

  const setInputValue = (id: string, value: string): boolean => {
    const el = document.querySelector<HTMLInputElement>(id);
    if (!el) return false;
    try {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  };

  const shareUrlFor = (snap: ViewSnapshotV1): string => {
    const u = new URL(window.location.href);
    const set1 = (k: string, v: string) => u.searchParams.set(k, v);
    const setBool = (k: string, v: boolean) => {
      if (v) set1(k, "1");
      else u.searchParams.delete(k);
    };

    if (snap.q) set1("q", snap.q);
    else u.searchParams.delete("q");

    setBool("only", snap.filters.onlyFollowed);
    setBool("onlySources", snap.filters.onlyFollowedSources);
    setBool("hide", snap.filters.hideRead);
    setBool("stable", snap.filters.onlyStableSources);
    setBool("dedup", snap.filters.dedup);
    if (snap.filters.timeLens !== "all") set1("lens", snap.filters.timeLens);
    else u.searchParams.delete("lens");
    if (snap.filters.sortMode !== "latest") set1("sort", snap.filters.sortMode);
    else u.searchParams.delete("sort");
    if (snap.view !== "grid") set1("view", snap.view);
    else u.searchParams.delete("view");
    if (snap.density !== "comfort") set1("density", snap.density);
    else u.searchParams.delete("density");
    if (snap.theme !== "auto") set1("theme", snap.theme);
    else u.searchParams.delete("theme");
    if (snap.accent !== "neon") set1("accent", snap.accent);
    else u.searchParams.delete("accent");
    if (snap.scope !== "page") set1("scope", snap.scope);
    else u.searchParams.delete("scope");

    return u.toString();
  };

  const applySnapshot = (snap: ViewSnapshotV1) => {
    try {
      setSearchScope(snap.scope);
    } catch {
      // ignore
    }

    setCheckbox("#acg-only-followed", snap.filters.onlyFollowed);
    setCheckbox("#acg-only-followed-sources", snap.filters.onlyFollowedSources);
    setCheckbox("#acg-hide-read", snap.filters.hideRead);
    setCheckbox("#acg-only-stable-sources", snap.filters.onlyStableSources);
    setCheckbox("#acg-dedup-view", snap.filters.dedup);

    if (snap.filters.timeLens) click(`button[data-time-lens="${snap.filters.timeLens}"]`);
    if (snap.filters.sortMode) click(`button[data-sort-mode="${snap.filters.sortMode}"]`);
    if (snap.view) click(`button[data-view-mode="${snap.view}"]`);
    if (snap.density) click(`button[data-density-mode="${snap.density}"]`);
    if (snap.theme) click(`button[data-theme-mode="${snap.theme}"]`);
    if (snap.accent) click(`button[data-accent-mode="${snap.accent}"]`);
    setInputValue("#acg-search", snap.q);

    document.dispatchEvent(new CustomEvent("acg:filters-changed"));
  };

  let presets = loadPresets();
  let editingId: string | null = null;

  const render = () => {
    list.innerHTML = "";
    if (presets.length === 0) {
      const empty = document.createElement("div");
      empty.className = "rounded-xl border border-slate-900/10 bg-white/45 px-3 py-2 text-xs text-slate-600";
      empty.textContent = txt.empty;
      list.appendChild(empty);
      return;
    }

    for (const p of presets) {
      const row = document.createElement("div");
      row.className =
        "flex items-center justify-between gap-2 rounded-xl border border-slate-900/10 bg-white/50 px-3 py-2";
      row.dataset.viewPresetId = p.id;

      const left = document.createElement("div");
      left.className = "min-w-0";
      const title = document.createElement("div");
      title.className = "truncate text-xs font-semibold text-slate-950";
      title.textContent = p.name;
      const meta = document.createElement("div");
      meta.className = "truncate text-[11px] text-slate-600";
      meta.textContent = p.snapshot.q
        ? `${p.snapshot.q}`
        : `${p.snapshot.filters.timeLens} · ${p.snapshot.filters.sortMode}`;
      left.appendChild(title);
      left.appendChild(meta);

      const right = document.createElement("div");
      right.className = "flex shrink-0 items-center gap-1";

      const btn = (label: string, action: string) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className =
          "rounded-lg border border-slate-900/10 bg-white/55 px-2 py-1 text-[11px] font-medium text-slate-800 hover:bg-white/80 clickable";
        b.textContent = label;
        b.dataset.action = action;
        return b;
      };

      right.appendChild(btn(txt.apply, "apply"));
      right.appendChild(btn(txt.link, "copy"));
      right.appendChild(btn(txt.rename, "rename"));
      right.appendChild(btn(txt.remove, "delete"));

      row.appendChild(left);
      row.appendChild(right);
      list.appendChild(row);
    }
  };

  const openDialog = (opts: { mode: "create" } | { mode: "rename"; id: string; currentName: string }) => {
    const fallbackPrompt = () => {
      const current = opts.mode === "rename" ? opts.currentName : "";
      const name = window.prompt(txt.promptRename, current)?.trim() ?? "";
      if (!name) return;
      if (opts.mode === "rename") {
        const next = presets.map((p) => (p.id === opts.id ? { ...p, name } : p));
        presets = next;
        savePresets(presets);
        render();
        toast({ title: txt.renamed, variant: "success", timeoutMs: UI.TOAST_HINT_TIMEOUT_MS });
        return;
      }
      const snap = snapshotCurrent();
      const preset: ViewPresetV1 = { version: 1, id: makeId(), name, createdAt: Date.now(), snapshot: snap };
      presets = [preset, ...presets].slice(0, 24);
      savePresets(presets);
      render();
      toast({ title: txt.saved, variant: "success", timeoutMs: UI.TOAST_HINT_TIMEOUT_MS });
    };

    if (!dialog || !nameInput || !confirmBtn) {
      fallbackPrompt();
      return;
    }

    editingId = opts.mode === "rename" ? opts.id : null;
    nameInput.value = opts.mode === "rename" ? opts.currentName : "";

    try {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else (dialog as unknown as { open: boolean }).open = true;
    } catch {
      fallbackPrompt();
      return;
    }

    window.setTimeout(() => {
      try {
        nameInput.focus();
        nameInput.select();
      } catch {
        // ignore
      }
    }, 20);
  };

  const closeDialog = () => {
    try {
      if (dialog?.open) dialog.close();
    } catch {
      try {
        if (dialog) (dialog as unknown as { open: boolean }).open = false;
      } catch {
        // ignore
      }
    }
    editingId = null;
  };

  const onConfirm = () => {
    const name = (nameInput?.value ?? "").trim();
    if (!name) {
      toast({ title: txt.invalidName, variant: "error", timeoutMs: 1800 });
      return;
    }

    if (editingId) {
      presets = presets.map((p) => (p.id === editingId ? { ...p, name } : p));
      savePresets(presets);
      render();
      closeDialog();
      toast({ title: txt.renamed, variant: "success", timeoutMs: UI.TOAST_HINT_TIMEOUT_MS });
      return;
    }

    if (presets.length >= 24) {
      toast({ title: txt.tooMany, desc: "max=24", variant: "error", timeoutMs: 2200 });
      return;
    }

    const preset: ViewPresetV1 = {
      version: 1,
      id: makeId(),
      name,
      createdAt: Date.now(),
      snapshot: snapshotCurrent()
    };
    presets = [preset, ...presets];
    savePresets(presets);
    render();
    closeDialog();
    toast({ title: txt.saved, variant: "success", timeoutMs: UI.TOAST_HINT_TIMEOUT_MS });
  };

  render();

  saveBtn.addEventListener("click", () => openDialog({ mode: "create" }));

  copyBtn.addEventListener("click", () => {
    void (async () => {
      const url = shareUrlFor(snapshotCurrent());
      const ok = await copyToClipboard(url);
      toast({
        title: ok ? txt.copied : txt.copyFailed,
        variant: ok ? "success" : "error",
        timeoutMs: ok ? UI.TOAST_HINT_TIMEOUT_MS : 2200
      });
      if (ok) track({ type: "view_link_copy", data: {} });
    })();
  });

  closeBtn?.addEventListener("click", () => closeDialog());
  cancelBtn?.addEventListener("click", () => closeDialog());
  confirmBtn?.addEventListener("click", () => onConfirm());

  list.addEventListener("click", (e) => {
    if (e.defaultPrevented) return;
    if (!(e.target instanceof HTMLElement)) return;
    const action = e.target.closest<HTMLElement>("[data-action]")?.dataset.action ?? "";
    if (!action) return;
    const row = e.target.closest<HTMLElement>("[data-view-preset-id]");
    const id = row?.dataset.viewPresetId ?? "";
    if (!id) return;

    const preset = presets.find((p) => p.id === id) ?? null;
    if (!preset) return;

    if (action === "apply") {
      e.preventDefault();
      applySnapshot(preset.snapshot);
      toast({ title: txt.applied, variant: "success", timeoutMs: UI.TOAST_HINT_TIMEOUT_MS });
      track({ type: "view_preset_apply", data: { id } });
      return;
    }
    if (action === "copy") {
      e.preventDefault();
      void (async () => {
        const ok = await copyToClipboard(shareUrlFor(preset.snapshot));
        toast({
          title: ok ? txt.copied : txt.copyFailed,
          variant: ok ? "success" : "error",
          timeoutMs: ok ? UI.TOAST_HINT_TIMEOUT_MS : 2200
        });
        if (ok) track({ type: "view_link_copy", data: { id } });
      })();
      return;
    }
    if (action === "rename") {
      e.preventDefault();
      openDialog({ mode: "rename", id, currentName: preset.name });
      return;
    }
    if (action === "delete") {
      e.preventDefault();
      presets = presets.filter((p) => p.id !== id);
      savePresets(presets);
      render();
      toast({ title: txt.deleted, variant: "success", timeoutMs: UI.TOAST_HINT_TIMEOUT_MS });
      track({ type: "view_preset_delete", data: { id } });
    }
  });

  document.addEventListener("acg:apply-view-preset", (ev) => {
    const ce = ev as CustomEvent<unknown>;
    const detail = ce.detail;
    if (!isRecord(detail)) return;
    const id = typeof detail.id === "string" ? detail.id : "";
    if (!id) return;
    const preset = presets.find((p) => p.id === id) ?? null;
    if (!preset) return;
    applySnapshot(preset.snapshot);
    toast({ title: txt.applied, variant: "success", timeoutMs: UI.TOAST_HINT_TIMEOUT_MS });
    track({ type: "view_preset_apply", data: { id, from: "cmdk" } });
  });
}

function wireSourceToggles(disabledSources: Set<string>) {
  const inputs = [...document.querySelectorAll<HTMLInputElement>("input[data-source-toggle-id]")];
  if (inputs.length === 0) return;

  const enableAll = document.querySelector<HTMLButtonElement>("#acg-sources-enable-all");
  const disableAll = document.querySelector<HTMLButtonElement>("#acg-sources-disable-all");

  const apply = () => {
    for (const input of inputs) {
      const id = input.dataset.sourceToggleId ?? "";
      input.checked = id ? !disabledSources.has(id) : true;
    }
  };

  const persist = () => {
    saveIds(DISABLED_SOURCES_KEY, disabledSources);
    document.dispatchEvent(new CustomEvent("acg:filters-changed"));
  };

  apply();

  for (const input of inputs) {
    input.addEventListener("change", () => {
      const id = input.dataset.sourceToggleId ?? "";
      if (!id) return;
      if (input.checked) disabledSources.delete(id);
      else disabledSources.add(id);
      persist();
      setPrefsMessage(isJapanese() ? "ソース設定を更新しました。" : "来源设置已更新。");
    });
  }

  enableAll?.addEventListener("click", () => {
    disabledSources.clear();
    persist();
    apply();
    setPrefsMessage(isJapanese() ? "すべて有効化しました。" : "已启用全部来源。");
  });

  disableAll?.addEventListener("click", () => {
    for (const input of inputs) {
      const id = input.dataset.sourceToggleId ?? "";
      if (id) disabledSources.add(id);
    }
    persist();
    apply();
    setPrefsMessage(isJapanese() ? "すべて無効化しました。" : "已全部禁用。");
  });
}

function wireSourceFollows(followedSources: Set<string>) {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("button[data-source-follow-id]")];
  if (buttons.length === 0) return;

  const countEl = document.querySelector<HTMLElement>("#acg-sources-followed-count");
  const listEl = document.querySelector<HTMLElement>("#acg-followed-sources-list");
  const emptyEl = document.querySelector<HTMLElement>("#acg-followed-sources-empty");
  const followAll = document.querySelector<HTMLButtonElement>("#acg-sources-follow-all");
  const unfollowAll = document.querySelector<HTMLButtonElement>("#acg-sources-unfollow-all");

  const getName = (id: string): string => {
    const btn = buttons.find((b) => (b.dataset.sourceFollowId ?? "") === id);
    return btn?.dataset.sourceFollowName ?? id;
  };

  const renderList = () => {
    if (!listEl || !emptyEl) return;
    listEl.innerHTML = "";

    const ids = [...followedSources];
    ids.sort((a, b) => getName(a).localeCompare(getName(b)));

    if (ids.length === 0) {
      emptyEl.textContent = isJapanese() ? "まだフォローしていません。" : "你还没有关注任何来源。";
      emptyEl.classList.remove("hidden");
      return;
    }

    emptyEl.classList.add("hidden");

    for (const id of ids) {
      const name = getName(id);
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className =
        "inline-flex items-center gap-2 rounded-full border border-slate-900/10 bg-white/55 px-3 py-1 text-xs text-slate-700 hover:bg-white/75 clickable";
      chip.appendChild(document.createTextNode(name));
      const icon = document.createElement("span");
      icon.className = "text-amber-600";
      icon.setAttribute("aria-hidden", "true");
      icon.appendChild(createUiIcon({ name: "star", size: 16, filled: true }));
      chip.appendChild(icon);
      chip.title = isJapanese() ? "クリックで解除" : "点击取消关注";
      chip.addEventListener("click", () => {
        followedSources.delete(id);
        persist();
        toast({ title: isJapanese() ? `解除: ${name}` : `已取消关注：${name}`, variant: "info" });
      });
      listEl.appendChild(chip);
    }
  };

  const apply = () => {
    for (const btn of buttons) {
      const id = btn.dataset.sourceFollowId ?? "";
      const on = Boolean(id) && followedSources.has(id);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("ring-2", on);
      btn.classList.toggle("ring-amber-400/40", on);
    }
    if (countEl) countEl.textContent = String(followedSources.size);
    renderList();
  };

  const persist = () => {
    saveIds(FOLLOWED_SOURCES_KEY, followedSources);
    document.dispatchEvent(new CustomEvent("acg:filters-changed"));
    apply();
  };

  apply();

  for (const btn of buttons) {
    btn.addEventListener("click", () => {
      const id = btn.dataset.sourceFollowId ?? "";
      const name = btn.dataset.sourceFollowName ?? id;
      if (!id) return;

      if (followedSources.has(id)) {
        followedSources.delete(id);
        persist();
        pop(btn);
        toast({ title: isJapanese() ? `解除: ${name}` : `已取消关注：${name}`, variant: "info" });
        return;
      }

      followedSources.add(id);
      persist();
      pop(btn);
      toast({ title: isJapanese() ? `フォロー: ${name}` : `已关注来源：${name}`, variant: "success" });
    });
  }

  followAll?.addEventListener("click", () => {
    for (const btn of buttons) {
      const id = btn.dataset.sourceFollowId ?? "";
      if (id) followedSources.add(id);
    }
    persist();
    toast({ title: isJapanese() ? "すべてフォローしました。" : "已关注全部来源。", variant: "success" });
  });

  unfollowAll?.addEventListener("click", () => {
    followedSources.clear();
    persist();
    toast({ title: isJapanese() ? "すべて解除しました。" : "已取消全部关注。", variant: "info" });
  });
}

function wireDailyBriefCopy() {
  const btn = document.querySelector<HTMLButtonElement>("#acg-brief-copy");
  const list = document.querySelector<HTMLElement>("#acg-daily-brief");
  const msg = document.querySelector<HTMLElement>("#acg-brief-message");
  if (!btn || !list) return;

  btn.addEventListener("click", async () => {
    const items = [...list.querySelectorAll<HTMLAnchorElement>("a[href]")];
    const lines = items.slice(0, 20).map((a) => {
      const title = a.dataset.briefTitle ?? a.textContent?.trim() ?? "";
      return `- ${title}\n  ${a.href}`;
    });
    const header = isJapanese()
      ? `今日のまとめ (${new Date().toLocaleDateString("ja-JP")})`
      : `今日快报 (${new Date().toLocaleDateString("zh-CN")})`;
    const ok = await copyToClipboard([header, "", ...lines].join("\n"));
    if (!msg) return;
    msg.textContent = ok
      ? isJapanese()
        ? "クリップボードにコピーしました。"
        : "已复制到剪贴板。"
      : isJapanese()
        ? "コピーに失敗しました。"
        : "复制失败。";
    msg.classList.remove("hidden");
    toast({
      title: ok ? (isJapanese() ? "コピーしました" : "已复制") : isJapanese() ? "コピー失敗" : "复制失败",
      variant: ok ? "success" : "error"
    });
  });
}

function wireCopyTextButtons() {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("button[data-copy-text]")];
  if (buttons.length === 0) return;

  for (const btn of buttons) {
    btn.addEventListener("click", async () => {
      const text = btn.dataset.copyText ?? "";
      if (!text) return;

      const ok = await copyToClipboard(text);
      toast({
        title: ok
          ? isJapanese()
            ? "リンクをコピーしました"
            : "已复制链接"
          : isJapanese()
            ? "コピー失敗"
            : "复制失败",
        variant: ok ? "success" : "error"
      });
    });
  }
}

function wireSpotlightCarousel() {
  const roots = document.querySelectorAll<HTMLElement>("[data-spotlight-carousel]");
  if (roots.length === 0) return;

  for (const root of roots) {
    const track = root.querySelector<HTMLElement>("[data-carousel-track]");
    const slides = [...root.querySelectorAll<HTMLElement>("[data-carousel-slide]")];
    const dots = [...root.querySelectorAll<HTMLButtonElement>("[data-carousel-dot]")];
    const prev = root.querySelector<HTMLButtonElement>("[data-carousel-prev]");
    const next = root.querySelector<HTMLButtonElement>("[data-carousel-next]");
    if (!track || slides.length === 0) continue;

    let index = 0;
    const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";

    const applyDotState = (activeIndex: number) => {
      for (let i = 0; i < dots.length; i += 1) {
        const on = i === activeIndex;
        dots[i].classList.toggle("is-active", on);
        dots[i].setAttribute("aria-selected", on ? "true" : "false");
        dots[i].tabIndex = on ? 0 : -1;
      }
    };

    const setActive = (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(slides.length - 1, nextIndex));
      if (index === clamped) return;
      index = clamped;
      applyDotState(index);
    };

    const scrollToIndex = (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(slides.length - 1, nextIndex));
      const target = slides[clamped];
      setActive(clamped);
      try {
        target.scrollIntoView({ behavior, inline: "start", block: "nearest" });
      } catch {
        // ignore
      }
    };

    // a11y: dots are a "tablist"，把语义补齐（不改 HTML 也可工作）
    for (const d of dots) {
      if (!d.hasAttribute("role")) d.setAttribute("role", "tab");
      d.setAttribute("aria-selected", "false");
      d.tabIndex = -1;
    }

    // 初始化激活态
    if (dots[0]) dots[0].tabIndex = 0;
    applyDotState(0);

    prev?.addEventListener("click", () => scrollToIndex(index - 1));
    next?.addEventListener("click", () => scrollToIndex(index + 1));

    for (let i = 0; i < dots.length; i += 1) {
      dots[i]?.addEventListener("click", () => scrollToIndex(i));
    }

    // 键盘：←/→ 切换，Enter 打开当前
    root.addEventListener("keydown", (e) => {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        scrollToIndex(index - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        scrollToIndex(index + 1);
      } else if (e.key === "Enter") {
        const a = slides[index]?.querySelector<HTMLAnchorElement>("a[href]");
        if (a?.href) {
          e.preventDefault();
          window.location.href = a.href;
        }
      }
    });

    // 拖拽（鼠标/触控）：更“顺手”，同时避免误触点击
    let dragging = false;
    let dragged = false;
    let pointerId: number | null = null;
    let pointerType: string = "mouse";
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let downHref: string | null = null;
    let downOpenInNewTab = false;

    const endDrag = (e?: PointerEvent) => {
      if (!dragging) return;
      const canceled = e?.type === "pointercancel";
      const shouldMaybeOpen = !canceled && Boolean(downHref) && downHref;
      if (pointerType === "mouse") {
        // mouse：脚本拖拽会直接改 scrollLeft，用它判断最稳
        if (Math.abs(track.scrollLeft - startScrollLeft) > 6) dragged = true;
      } else {
        // touch/pen：有些浏览器会在“轻点时仍有惯性滚动”导致 scrollLeft 变化，
        // 如果仅用 scrollLeft 差值会把“点封面打开”误判成拖拽，造成“点了没反应”。
        // 因此优先用 pointerup 的位移来判定是否为“横向滑动”。
        const dx = typeof e?.clientX === "number" ? e.clientX - startX : 0;
        const dy = typeof e?.clientY === "number" ? e.clientY - startY : 0;
        const move = Math.hypot(dx, dy);
        const moveThreshold = pointerType === "pen" ? 12 : 16;
        if (Math.abs(dx) >= moveThreshold && Math.abs(dx) >= Math.abs(dy) && move >= moveThreshold)
          dragged = true;
        // 兜底：如果没有可靠坐标，再用更高阈值的 scrollLeft 判断（避免误伤点击）
        else if (!e && Math.abs(track.scrollLeft - startScrollLeft) > 28) dragged = true;
      }
      dragging = false;
      pointerId = null;
      pointerType = "mouse";
      track.classList.remove("is-dragging");

      // pointercancel 通常意味着浏览器接管了滚动/手势：此时绝不应“自动打开链接”，否则会造成“无法滑动”的灾难体验。
      if (canceled) dragged = true;

      // 重要：某些浏览器在滚动容器 + pointer 事件组合下，a[href] 的 click 可能会被吞掉（尤其是桌面端）。
      // 这里在“确定不是拖拽”的情况下，补一个显式跳转，保证“点封面能进详情页”。
      if (shouldMaybeOpen && !dragged) {
        try {
          if (downOpenInNewTab) window.open(String(downHref), "_blank", "noopener");
          else window.location.href = String(downHref);
        } catch {
          // ignore
        }
      }
      downHref = null;
      downOpenInNewTab = false;
      // click 事件会在 pointerup 后触发，留一拍让捕获阶段能拦截
      window.setTimeout(() => {
        dragged = false;
      }, 0);
    };

    track.addEventListener("pointerdown", (e) => {
      if (e.defaultPrevented) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!(e.target instanceof HTMLElement)) return;
      if (e.target.closest("button, input, textarea, select")) return;

      dragging = true;
      dragged = false;
      pointerId = e.pointerId;
      pointerType = e.pointerType || "mouse";
      downHref = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href]")?.href ?? null;
      downOpenInNewTab = Boolean((e as PointerEvent).ctrlKey || (e as PointerEvent).metaKey);
      startX = e.clientX;
      startY = e.clientY;
      startScrollLeft = track.scrollLeft;
      track.classList.add("is-dragging");
    });

    track.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      if (pointerId != null && e.pointerId !== pointerId) return;
      const dx = startX - e.clientX;
      const dy = startY - e.clientY;
      // mouse: 用脚本模拟“抓取拖拽”更顺手
      if (pointerType === "mouse") {
        if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) dragged = true;
        track.scrollLeft = startScrollLeft + dx;
        return;
      }

      // touch/pen：交给原生滚动（性能更好）。
      // 关键：不要用 pointermove 的 dx 阈值来判定 dragged，否则“轻微手指抖动”会把点击误判为拖拽，导致点封面打不开。
      // 是否发生真实拖拽由 endDrag 里的 scrollLeft 差值兜底判断。
    });

    track.addEventListener("pointerup", endDrag);
    track.addEventListener("pointercancel", endDrag);

    track.addEventListener(
      "click",
      (e) => {
        if (!dragged) return;
        e.preventDefault();
        e.stopPropagation();
      },
      true
    );

    // 通过 IntersectionObserver 自动更新“当前”点（6 个元素，开销很小）
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          let bestIndex = index;
          let bestRatio = 0;
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const el = entry.target as HTMLElement;
            const i = slides.indexOf(el);
            if (i < 0) continue;
            if (entry.intersectionRatio > bestRatio) {
              bestRatio = entry.intersectionRatio;
              bestIndex = i;
            }
          }
          if (bestRatio > 0) setActive(bestIndex);
        },
        { root: track, threshold: [0.35, 0.55, 0.75, 0.9] }
      );
      for (const slide of slides) io.observe(slide);
    }
  }
}

function wireReadingProgress() {
  const article = document.querySelector<HTMLElement>("[data-reading-article]");
  const bar = document.querySelector<HTMLElement>("[data-reading-progress-bar]");
  if (!article || !bar) return;

  let ticking = false;

  const update = () => {
    ticking = false;
    const vh = Math.max(1, window.innerHeight || 0);
    const rect = article.getBoundingClientRect();
    const total = Math.max(1, rect.height - vh * 0.45);
    const travelled = Math.min(total, Math.max(0, vh * 0.18 - rect.top));
    const progress = Math.max(0, Math.min(1, travelled / total));
    bar.style.transform = `scaleX(${progress.toFixed(4)})`;
  };

  const schedule = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  };

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  schedule();
}

function markCurrentPostRead(readIds: Set<string>) {
  const current = document.body.dataset.currentPostId ?? "";
  if (!current) return;
  if (readIds.has(current)) return;
  readIds.add(current);
  saveIds(READ_KEY, readIds);
  try {
    document.dispatchEvent(new CustomEvent("acg:read-changed"));
  } catch {
    // ignore
  }
}

function supportsViewTransitions(): boolean {
  try {
    const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    return typeof d.startViewTransition === "function";
  } catch {
    return false;
  }
}

function wirePageTransitions() {
  // 说明：现代浏览器会走 View Transitions（由 CSS 定义动效）；这里仅为不支持的浏览器提供 WAAPI 降级。
  if (prefersReducedMotion()) return;
  if (supportsViewTransitions()) return;

  try {
    document.documentElement.animate(
      [
        { opacity: 0, transform: "translateY(8px) scale(1.01)" },
        { opacity: 1, transform: "translateY(0) scale(1)" }
      ],
      { duration: 260, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "both" }
    );
  } catch {
    // ignore
  }

  const shouldIgnoreClick = (ev: MouseEvent) =>
    ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey;

  const findAnchor = (target: EventTarget | null): HTMLAnchorElement | null => {
    if (!(target instanceof Element)) return null;
    const a = target.closest("a[href]");
    return a instanceof HTMLAnchorElement ? a : null;
  };

  const isSameDocumentHashNav = (next: URL): boolean => {
    try {
      return (
        next.origin === location.origin &&
        next.pathname === location.pathname &&
        next.search === location.search
      );
    } catch {
      return false;
    }
  };

  document.addEventListener(
    "click",
    (ev) => {
      if (shouldIgnoreClick(ev)) return;
      const a = findAnchor(ev.target);
      if (!a) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      if (a.dataset.noTransition === "true") return;

      let next: URL;
      try {
        next = new URL(a.href, location.href);
      } catch {
        return;
      }

      if (next.protocol !== "http:" && next.protocol !== "https:") return;
      if (next.origin !== location.origin) return;
      if (isSameDocumentHashNav(next)) return;

      ev.preventDefault();

      try {
        const anim = document.documentElement.animate(
          [
            { opacity: 1, transform: "translateY(0) scale(1)" },
            { opacity: 0, transform: "translateY(10px) scale(0.985)" }
          ],
          { duration: 220, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "both" }
        );
        void anim.finished
          .catch(() => {
            // ignore
          })
          .finally(() => {
            location.href = next.href;
          });
      } catch {
        location.href = next.href;
      }
    },
    true
  );
}

function bootstrapMonitoring() {
  window.__acgCoverError = handleCoverError;
  window.__acgCoverLoad = handleCoverLoad;

  // 监控优先：确保初始化链后续任何异常都能被记录/感知。
  try {
    wireTelemetry();
  } catch {
    // ignore
  }
  try {
    wireToastBridge();
  } catch {
    // ignore
  }
  try {
    wireGlobalErrorMonitoring();
  } catch {
    // ignore
  }
  try {
    wirePerfMonitoring();
  } catch {
    // ignore
  }
  try {
    wireNetworkStatusToasts();
  } catch {
    // ignore
  }
}

function initApp() {
  const bookmarkIds = loadIds(BOOKMARK_KEY);
  const readIds = loadIds(READ_KEY);
  const follows = loadWords(FOLLOWS_KEY);
  const blocklist = loadWords(BLOCKLIST_KEY);
  const filters = loadFilters();
  syncFilterDataset(filters);
  const disabledSources = loadIds(DISABLED_SOURCES_KEY);
  const followedSources = loadIds(FOLLOWED_SOURCES_KEY);
  wirePageTransitions();
  wireThemeMode();
  wireAccentMode();
  wireViewMode();
  wireDensityMode();
  wireRadioGroupKeyboardNav();
  maybeAutoTunePerfMode();
  wireScrollPerfHints();
  wireCardInViewAnimations();
  markCurrentPostRead(readIds);
  // 性能：首页/分类页卡片较多时，立即遍历全量 DOM 打标会造成“首屏卡一下”。
  // 已读逻辑不影响关键可用性（筛选逻辑直接读 readIds），因此延后到 idle 更稳更顺。
  runWhenIdle(() => applyReadState(readIds), UI.APPLY_READ_IDLE_DELAY_MS);
  wireBackToTop();
  wireMobileQuickActions();
  wireMobileDensityAutoTune();
  wireCoverRetry();
  wireBookmarks(bookmarkIds);
  wireBookmarksPage(bookmarkIds, readIds);
  wireBookmarkTools(bookmarkIds);
  wirePreferences({ follows, blocklist, filters });
  wireViewPresets(filters);
  wireTelemetryPrefs();
  wireSourceToggles(disabledSources);
  wireSourceFollows(followedSources);
  createListFilter({ readIds, follows, blocklist, disabledSources, followedSources, filters });
  wireGlobalSearch({ bookmarkIds, readIds, follows, blocklist, disabledSources, followedSources, filters });
  wireQuickToggles();
  wireKeyboardShortcuts();
  wireCommandPaletteShortcut();
  wireSearchClear();
  wireSearchCounterA11y();
  wireSearchSyntaxGuide();
  wirePrefsDrawer();
  if (document.querySelector("[data-fulltext]")) {
    void import("./features/fulltext").then((m) => m.wireFullTextReader());
  }
  if (document.querySelector("[data-telemetry-viewer]")) {
    void import("./features/telemetry-viewer").then((m) => m.wireTelemetryViewer());
  }
  wireTagChips();
  wirePostCardInteractions();
  wireDailyBriefCopy();
  wireCopyTextButtons();
  wireSpotlightCarousel();
  wireReadingProgress();
  runWhenIdle(() => hydrateCoverStates(), UI.HYDRATE_COVER_IDLE_DELAY_MS);
  wireDeviceDebug();
  maybeStartHealthMonitor();
  window.addEventListener("hashchange", handleHashIntents);
  handleHashIntents();
  applySearchQueryFromUrl();
}

function main() {
  bootstrapMonitoring();

  try {
    initApp();
  } catch (err) {
    try {
      document.documentElement.dataset.acgBoot = "failed";
    } catch {
      // ignore
    }

    try {
      const e = err instanceof Error ? err : new Error(String(err ?? "unknown error"));
      track({
        type: "bootstrap_fatal",
        data: {
          message: sanitizeOneLine(e.message, 220),
          stack: sanitizeStack(e.stack, 900)
        }
      });
    } catch {
      // ignore
    }

    try {
      document.dispatchEvent(
        new CustomEvent("acg:toast", {
          detail: {
            title: isJapanese() ? "初期化に失敗しました" : "初始化失败",
            desc: isJapanese() ? "ページを再読み込みしてください。" : "页面脚本初始化失败，建议刷新重试。",
            variant: "error",
            timeoutMs: 4200
          }
        })
      );
    } catch {
      // ignore
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
