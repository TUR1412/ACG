import { toWeservImageUrl } from "../lib/cover";

type BookmarkStore = {
  version: 1;
  ids: string[];
};

type ReadStore = {
  version: 1;
  ids: string[];
};

const BOOKMARK_KEY = "acg.bookmarks.v1";
const READ_KEY = "acg.read.v1";
const FOLLOWS_KEY = "acg.follows.v1";
const BLOCKLIST_KEY = "acg.blocklist.v1";
const FILTERS_KEY = "acg.filters.v1";
const DISABLED_SOURCES_KEY = "acg.sourcesDisabled.v1";
const FOLLOWED_SOURCES_KEY = "acg.sourcesFollowed.v1";

type WordStore = {
  version: 1;
  words: string[];
};

type FilterStore = {
  version: 2;
  onlyFollowed: boolean;
  onlyFollowedSources: boolean;
  hideRead: boolean;
};

declare global {
  interface Window {
    __acgCoverError?: (img: HTMLImageElement) => void;
    __acgCoverLoad?: (img: HTMLImageElement) => void;
  }
}

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function loadIds(key: string): Set<string> {
  try {
    const parsed = safeJsonParse<{ version?: number; ids?: unknown }>(localStorage.getItem(key));
    const ids = Array.isArray(parsed?.ids) ? parsed?.ids.filter((x) => typeof x === "string") : [];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

function saveIds(key: string, ids: Set<string>) {
  try {
    const value = { version: 1, ids: [...ids] } satisfies BookmarkStore | ReadStore;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/\s+/g, " ").trim();
}

function loadWords(key: string): Set<string> {
  try {
    const parsed = safeJsonParse<{ version?: number; words?: unknown }>(localStorage.getItem(key));
    const words = Array.isArray(parsed?.words)
      ? parsed?.words.filter((x) => typeof x === "string").map((x) => normalizeWord(x))
      : [];
    return new Set(words.filter(Boolean));
  } catch {
    return new Set();
  }
}

function saveWords(key: string, words: Set<string>) {
  try {
    const value = { version: 1, words: [...words] } satisfies WordStore;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function loadFilters(): FilterStore {
  try {
    const parsed = safeJsonParse<Partial<FilterStore>>(localStorage.getItem(FILTERS_KEY));
    return {
      version: 2,
      onlyFollowed: Boolean(parsed?.onlyFollowed),
      onlyFollowedSources: Boolean((parsed as any)?.onlyFollowedSources),
      hideRead: Boolean(parsed?.hideRead)
    };
  } catch {
    return { version: 2, onlyFollowed: false, onlyFollowedSources: false, hideRead: false };
  }
}

function saveFilters(filters: FilterStore) {
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
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
    window.setTimeout(() => {
      el.remove();
      if (root.childElementCount === 0) root.remove();
    }, timeoutMs);
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
    toast({
      title: on ? (isJapanese() ? "ブックマークしました" : "已收藏") : isJapanese() ? "已取消ブックマーク" : "已取消收藏",
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

function bestInitialCoverSrc(original: string, width = 1200): string {
  // GitHub Pages 项目站点：需要 base path 前缀（/ACG/...）
  if (original.startsWith("/")) {
    return hrefInBase(original);
  }
  // https 页面里加载 http 图片会被浏览器直接拦截；这里直接用 https 包装，减少“看起来像缺图”的时间。
  if (window.location.protocol === "https:" && original.startsWith("http://")) {
    return toWeservImageUrl({ url: original, width });
  }
  return original;
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
    toast({ title: isJapanese() ? "画像を再試行中…" : "正在重试封面…", variant: "info", timeoutMs: 900 });
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
        button.hidden = window.scrollY < 700;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  } catch {
    // ignore
  }
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
      toast({ title: isJapanese() ? "検索へフォーカス" : "已聚焦搜索", variant: "info", timeoutMs: 900 });
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
    toast({ title: isJapanese() ? "検索をクリアしました" : "已清空搜索", variant: "info", timeoutMs: 900 });
  });

  input.addEventListener("input", apply);
  apply();
}

function wirePrefsDrawer() {
  const drawer = document.querySelector<HTMLElement>("[data-prefs-drawer]");
  if (!drawer) return;

  const openers = [...document.querySelectorAll<HTMLElement>("[data-open-prefs]")];
  const closers = [...drawer.querySelectorAll<HTMLElement>("[data-close-prefs]")];

  const mq = (() => {
    try {
      return window.matchMedia("(max-width: 767px)");
    } catch {
      return null;
    }
  })();

  const isPhoneDevice = () => document.documentElement?.dataset?.acgDevice === "phone";

  const isOverlayMode = () => {
    if (isPhoneDevice()) return true;
    if (mq) return mq.matches;
    return window.innerWidth < 768;
  };

  const syncA11y = () => {
    if (isOverlayMode()) {
      if (!drawer.classList.contains("is-open")) {
        drawer.setAttribute("aria-hidden", "true");
        drawer.setAttribute("inert", "");
      }
    } else {
      drawer.classList.remove("is-open");
      document.body.classList.remove("acg-no-scroll");
      drawer.removeAttribute("aria-hidden");
      drawer.removeAttribute("inert");
    }
  };

  const open = () => {
    if (!isOverlayMode()) {
      const behavior = prefersReducedMotion() ? "auto" : "smooth";
      drawer.scrollIntoView({ behavior, block: "start" });
      drawer.classList.add("pop");
      window.setTimeout(() => drawer.classList.remove("pop"), 360);
      return;
    }

    drawer.classList.add("is-open");
    drawer.removeAttribute("inert");
    drawer.removeAttribute("aria-hidden");
    document.body.classList.add("acg-no-scroll");

    window.setTimeout(() => {
      const focusTarget = drawer.querySelector<HTMLInputElement>("#acg-follow-input")
        ?? drawer.querySelector<HTMLInputElement>("#acg-block-input")
        ?? drawer.querySelector<HTMLInputElement>("#acg-only-followed");
      try {
        focusTarget?.focus();
      } catch {
        // ignore
      }
    }, 0);
  };

  const close = () => {
    if (!isOverlayMode()) return;
    drawer.classList.remove("is-open");
    document.body.classList.remove("acg-no-scroll");
    drawer.setAttribute("aria-hidden", "true");
    drawer.setAttribute("inert", "");
  };

  for (const el of openers) {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      open();
    });
  }

  for (const el of closers) {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      close();
    });
  }

  drawer.addEventListener("click", (e) => {
    if (!isOverlayMode()) return;
    if (e.target === drawer) close();
  });

  document.addEventListener("keydown", (e) => {
    if (!drawer.classList.contains("is-open")) return;
    if (e.key === "Escape") close();
  });

  syncA11y();
  if (mq) {
    try {
      mq.addEventListener("change", syncA11y);
    } catch {
      // Safari（legacy API）
      mq.addListener(syncA11y);
    }
  }
}

type FullTextLang = "zh" | "ja";

type FullTextCacheEntry = {
  url: string;
  fetchedAt: string;
  original: string;
  zh?: string;
  ja?: string;
};

const FULLTEXT_CACHE_PREFIX = "acg.fulltext.v1:";

function fullTextCacheKey(postId: string): string {
  return `${FULLTEXT_CACHE_PREFIX}${postId}`;
}

function readFullTextCache(postId: string): FullTextCacheEntry | null {
  try {
    const raw = localStorage.getItem(fullTextCacheKey(postId));
    if (!raw) return null;
    const json = JSON.parse(raw) as unknown;
    if (!json || typeof json !== "object") return null;
    const it = json as any;
    if (typeof it.original !== "string" || typeof it.url !== "string") return null;
    return {
      url: it.url,
      fetchedAt: typeof it.fetchedAt === "string" ? it.fetchedAt : "",
      original: it.original,
      zh: typeof it.zh === "string" ? it.zh : undefined,
      ja: typeof it.ja === "string" ? it.ja : undefined
    } satisfies FullTextCacheEntry;
  } catch {
    return null;
  }
}

function writeFullTextCache(postId: string, entry: FullTextCacheEntry) {
  try {
    // 保护：避免 localStorage 被超大正文撑爆（不同浏览器配额不同）
    const approx = entry.original.length + (entry.zh?.length ?? 0) + (entry.ja?.length ?? 0);
    if (approx > 160_000) return;
    localStorage.setItem(fullTextCacheKey(postId), JSON.stringify(entry));
  } catch {
    // ignore
  }
}

function parseJinaMarkdown(raw: string): string {
  const marker = "Markdown Content:";
  const i = raw.indexOf(marker);
  const md = i >= 0 ? raw.slice(i + marker.length) : raw;
  return md.replace(/\r\n/g, "\n").trim();
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHttpUrl(raw: string, baseUrl: string): string | null {
  const cleaned = raw.trim().replace(/\s+/g, "");
  try {
    const u = new URL(cleaned, baseUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function normalizeFullTextMarkdown(md: string): string {
  let text = md.replace(/\r\n/g, "\n").trim();
  // 兼容一些来源的“项目符号 + 标题”写法：`* #### ...` -> `#### ...`
  text = text.replace(/^\s*[*-]\s+(#{1,6}\s+)/gm, "$1");
  // 兼容中文书名号样式链接：`【标题】(url)` -> `[标题](url)`
  text = text.replace(/【([^\n\r]+?)】\((https?:\/\/[^)\s]+)\)/g, "[$1]($2)");
  // 修复“链接 URL 被换行/空白打断”的情况：把 `](` 到 `)` 之间的空白去掉
  text = text.replace(/\]\(([^)]+)\)/g, (_m, url) => `](${String(url).replace(/\s+/g, "")})`);
  return text.trim();
}

type InlineToken =
  | { type: "code"; text: string }
  | { type: "link"; text: string; href: string }
  | { type: "img"; alt: string; src: string; href: string };

function renderInlineMarkdown(input: string, baseUrl: string): string {
  const tokens: InlineToken[] = [];
  const push = (t: InlineToken) => {
    const id = tokens.length;
    tokens.push(t);
    return `@@ACG_TOKEN_${id}@@`;
  };

  let text = input;

  // code spans（先处理，避免把 code 里的 `[]()` 误当成链接）
  text = text.replace(/`([^`]+)`/g, (_m, code) => push({ type: "code", text: String(code) }));

  // images
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
    const abs = safeHttpUrl(String(url), baseUrl);
    if (!abs) return String(alt ?? "");
    const src = bestInitialCoverSrc(abs, 1200);
    return push({ type: "img", alt: String(alt ?? ""), src, href: abs });
  });

  // links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    const abs = safeHttpUrl(String(url), baseUrl);
    if (!abs) return String(label ?? "");
    return push({ type: "link", text: String(label ?? ""), href: abs });
  });

  // 先整体 escape，再把 token 注入为 HTML
  text = escapeHtml(text);

  text = text.replace(/@@ACG_TOKEN_(\d+)@@/g, (_m, n) => {
    const idx = Number(n);
    const t = tokens[idx];
    if (!t) return "";

    if (t.type === "code") return `<code>${escapeHtml(t.text)}</code>`;

    if (t.type === "link") {
      const href = escapeHtml(t.href);
      const label = escapeHtml(t.text);
      return `<a href="${href}" target="_blank" rel="noreferrer noopener">${label}</a>`;
    }

    if (t.type === "img") {
      const href = escapeHtml(t.href);
      const src = escapeHtml(t.src);
      const alt = escapeHtml(t.alt);
      return `<a class="acg-prose-img-link" href="${href}" target="_blank" rel="noreferrer noopener"><img src="${src}" alt="${alt}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-acg-cover data-acg-cover-original-src="${href}" onload="window.__acgCoverLoad?.(this)" onerror="window.__acgCoverError?.(this)" /></a>`;
    }

    return "";
  });

  return text;
}

function renderMarkdownToHtml(md: string, baseUrl: string): string {
  const text = normalizeFullTextMarkdown(md);
  if (!text) return "";

  const lines = text.split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: "ul" | "ol" | null = null;
  let inCode = false;
  let codeLines: string[] = [];

  const flushPara = () => {
    if (para.length === 0) return;
    const joined = para.join("\n").trim();
    para = [];
    if (!joined) return;
    const html = renderInlineMarkdown(joined, baseUrl).replace(/\n+/g, "<br />");
    out.push(`<p>${html}</p>`);
  };

  const closeList = () => {
    if (!list) return;
    out.push(`</${list}>`);
    list = null;
  };

  const openList = (kind: "ul" | "ol") => {
    if (list === kind) return;
    closeList();
    out.push(`<${kind}>`);
    list = kind;
  };

  const flushCode = () => {
    if (!inCode) return;
    const code = escapeHtml(codeLines.join("\n"));
    out.push(`<pre><code>${code}</code></pre>`);
    inCode = false;
    codeLines = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i] ?? "";
    const line = rawLine.replace(/\s+$/g, "");
    const trimmed = line.trim();

    // code fence
    if (trimmed.startsWith("```")) {
      flushPara();
      closeList();
      if (inCode) flushCode();
      else {
        inCode = true;
        codeLines = [];
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!trimmed) {
      flushPara();
      closeList();
      continue;
    }

    // headings
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      flushPara();
      closeList();
      const level = h[1]?.length ?? 2;
      const content = h[2] ?? "";
      out.push(`<h${level}>${renderInlineMarkdown(content, baseUrl)}</h${level}>`);
      continue;
    }

    // hr
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(trimmed)) {
      flushPara();
      closeList();
      out.push("<hr />");
      continue;
    }

    // blockquote
    if (/^>\s?/.test(trimmed)) {
      flushPara();
      closeList();
      const q: string[] = [];
      let j = i;
      while (j < lines.length) {
        const t = (lines[j] ?? "").trim();
        if (!/^>\s?/.test(t)) break;
        q.push(t.replace(/^>\s?/, ""));
        j += 1;
      }
      i = j - 1;
      const html = q.map((x) => renderInlineMarkdown(x, baseUrl)).join("<br />");
      out.push(`<blockquote>${html}</blockquote>`);
      continue;
    }

    // lists
    const ul = /^[-*]\s+(.*)$/.exec(trimmed);
    if (ul) {
      flushPara();
      openList("ul");
      out.push(`<li>${renderInlineMarkdown(ul[1] ?? "", baseUrl)}</li>`);
      continue;
    }

    const ol = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (ol) {
      flushPara();
      openList("ol");
      out.push(`<li>${renderInlineMarkdown(ol[1] ?? "", baseUrl)}</li>`);
      continue;
    }

    // normal paragraph
    para.push(trimmed);
  }

  if (inCode) flushCode();
  flushPara();
  closeList();
  return out.join("\n");
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers: { accept: "text/plain,*/*" } });
  } finally {
    window.clearTimeout(timer);
  }
}

async function loadFullTextMarkdown(params: { url: string; timeoutMs: number }): Promise<string> {
  const { url, timeoutMs } = params;
  const readerUrl = `https://r.jina.ai/${url}`;
  const res = await fetchWithTimeout(readerUrl, timeoutMs);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const md = parseJinaMarkdown(text);
  if (!md) throw new Error("empty");
  return md;
}

function chunkForTranslate(text: string, maxLen: number): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxLen) return [normalized];

  const paras = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    const c = current.trim();
    if (c) chunks.push(c);
    current = "";
  };

  for (const p of paras) {
    const next = current ? `${current}\n\n${p}` : p;
    if (next.length <= maxLen) {
      current = next;
      continue;
    }

    flush();

    // 单段过长：硬切（尽量保留换行）
    if (p.length > maxLen) {
      for (let i = 0; i < p.length; i += maxLen) {
        chunks.push(p.slice(i, i + maxLen));
      }
      continue;
    }

    current = p;
  }

  flush();
  return chunks.length > 0 ? chunks : [normalized.slice(0, maxLen)];
}

function parseGoogleGtx(json: unknown): string | null {
  if (!Array.isArray(json)) return null;
  const top0 = json[0];
  if (!Array.isArray(top0)) return null;
  const parts: string[] = [];
  for (const seg of top0) {
    if (!Array.isArray(seg)) continue;
    const out = seg[0];
    if (typeof out === "string" && out) parts.push(out);
  }
  const joined = parts.join("");
  return joined.trim() ? joined : null;
}

async function translateViaGtx(params: { text: string; target: FullTextLang; timeoutMs: number; onProgress?: (done: number, total: number) => void }): Promise<string> {
  const { text, target, timeoutMs, onProgress } = params;
  const tl = target === "zh" ? "zh-CN" : "ja";

  // URL 长度与服务稳定性：保守切块
  const chunks = chunkForTranslate(text, 1200);
  const outParts: string[] = [];

  for (let i = 0; i < chunks.length; i += 1) {
    onProgress?.(i, chunks.length);
    const q = chunks[i] ?? "";
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
      tl
    )}&dt=t&q=${encodeURIComponent(q)}`;
    const res = await fetchWithTimeout(url, timeoutMs);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as unknown;
    const translated = parseGoogleGtx(json);
    outParts.push(translated ?? q);
  }
  onProgress?.(chunks.length, chunks.length);
  return outParts.join("\n\n").trim();
}

function wireFullTextReader() {
  const blocks = [...document.querySelectorAll<HTMLElement>("[data-fulltext]")];
  if (blocks.length === 0) return;

  for (const block of blocks) {
    const lang = (block.dataset.fulltextLang as FullTextLang | undefined) ?? (isJapanese() ? "ja" : "zh");
    const postId = block.dataset.fulltextPostId ?? "";
    const url = block.dataset.fulltextUrl ?? "";
    const autoload = block.dataset.fulltextAutoload === "true";

    const statusEl = block.querySelector<HTMLElement>("[data-fulltext-status]");
    const contentEl = block.querySelector<HTMLElement>("[data-fulltext-content]");
    const btnReload = block.querySelector<HTMLButtonElement>("[data-fulltext-action=\"reload\"]");
    const btnShowOriginal = block.querySelector<HTMLButtonElement>("[data-fulltext-action=\"show-original\"]");
    const btnShowTranslated = block.querySelector<HTMLButtonElement>("[data-fulltext-action=\"show-translated\"]");

    if (!postId || !url || !contentEl) continue;

    let running = false;
    // 说明：全文可能很长，localStorage 写入会被配额/上限拦截（或被我们主动跳过）。
    // 但用户在“本次会话”里依然应该能用「查看原文/查看翻译」切换，所以保留内存态兜底。
    let memoryCache: FullTextCacheEntry | null = null;

    const setStatus = (text: string) => {
      if (!statusEl) return;
      statusEl.textContent = text;
      statusEl.classList.toggle("hidden", text.trim().length === 0);
    };

    const render = (text: string) => {
      contentEl.innerHTML = renderMarkdownToHtml(text, url);
    };

    const showOriginal = (cache: FullTextCacheEntry) => {
      memoryCache = cache;
      render(cache.original);
      if (btnShowOriginal) btnShowOriginal.hidden = true;
      if (btnShowTranslated) btnShowTranslated.hidden = false;
    };

    const showTranslated = (cache: FullTextCacheEntry) => {
      memoryCache = cache;
      const t = lang === "zh" ? cache.zh : cache.ja;
      if (!t) {
        // 翻译未就绪：保持原文视图（避免按钮状态来回跳，造成“点了没反应”的错觉）
        setStatus(lang === "ja" ? "翻訳がまだありません。" : "翻译还未完成。");
        if (btnShowOriginal) btnShowOriginal.hidden = true;
        if (btnShowTranslated) btnShowTranslated.hidden = false;
        return;
      }

      render(t);
      if (btnShowOriginal) btnShowOriginal.hidden = false;
      if (btnShowTranslated) btnShowTranslated.hidden = true;
    };

    const ensureLoaded = async (force: boolean) => {
      if (running) return;
      running = true;
      try {
        setStatus(lang === "ja" ? "全文を読み込み中…" : "正在加载全文…");

        let cache = force ? null : readFullTextCache(postId);
        if (!cache || cache.url !== url || !cache.original) {
          const md = await loadFullTextMarkdown({ url, timeoutMs: 22_000 });
          cache = { url, fetchedAt: new Date().toISOString(), original: normalizeFullTextMarkdown(md) };
          writeFullTextCache(postId, cache);
        }
        memoryCache = cache;

        // 先展示原文（马上有内容），再异步翻译
        showOriginal(cache);

        setStatus(lang === "ja" ? "翻訳中…" : "正在翻译…");
        const translated = await translateViaGtx({
          text: cache.original,
          target: lang,
          timeoutMs: 22_000,
          onProgress: (done, total) => {
            if (total <= 1) return;
            const label = lang === "ja" ? `翻訳中… (${Math.min(done + 1, total)}/${total})` : `正在翻译… (${Math.min(done + 1, total)}/${total})`;
            setStatus(label);
          }
        });

        if (lang === "zh") cache.zh = translated;
        else cache.ja = translated;
        memoryCache = cache;
        writeFullTextCache(postId, cache);

        // 默认切到翻译（满足“选中文/日文就看懂”）
        showTranslated(cache);
        setStatus("");
      } catch {
        setStatus(lang === "ja" ? "読み込みに失敗しました。元記事を開いてください。" : "加载失败：建议点击「打开原文」。");
      } finally {
        running = false;
      }
    };

    btnReload?.addEventListener("click", (e) => {
      e.preventDefault();
      ensureLoaded(true);
    });

    btnShowOriginal?.addEventListener("click", (e) => {
      e.preventDefault();
      const cache = memoryCache ?? readFullTextCache(postId);
      if (cache && cache.url === url) showOriginal(cache);
    });

    btnShowTranslated?.addEventListener("click", (e) => {
      e.preventDefault();
      const cache = memoryCache ?? readFullTextCache(postId);
      if (cache && cache.url === url) showTranslated(cache);
    });

    // 初始：如果已有缓存并包含翻译，直接展示翻译；否则按配置自动加载
    const cached = readFullTextCache(postId);
    if (cached && cached.url === url) {
      memoryCache = cached;
      const hasTranslated = lang === "zh" ? Boolean(cached.zh) : Boolean(cached.ja);
      if (hasTranslated) {
        showTranslated(cached);
        setStatus("");
      } else if (autoload) {
        ensureLoaded(false);
      } else {
        showOriginal(cached);
        setStatus("");
      }
    } else if (autoload) {
      ensureLoaded(false);
    }
  }
}

function wireQuickToggles() {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("button[data-quick-toggle]")];
  if (buttons.length === 0) return;

  const onlyFollowed = document.querySelector<HTMLInputElement>("#acg-only-followed");
  const onlyFollowedSources = document.querySelector<HTMLInputElement>("#acg-only-followed-sources");
  const hideRead = document.querySelector<HTMLInputElement>("#acg-hide-read");

  const apply = () => {
    const only = Boolean(onlyFollowed?.checked);
    const onlySources = Boolean(onlyFollowedSources?.checked);
    const hide = Boolean(hideRead?.checked);
    for (const btn of buttons) {
      const kind = btn.dataset.quickToggle ?? "";
      const active =
        kind === "only-followed"
          ? only
          : kind === "only-followed-sources"
            ? onlySources
            : kind === "hide-read"
              ? hide
              : false;
      btn.dataset.active = active ? "true" : "false";
    }
  };

  const toggle = (kind: "only-followed" | "only-followed-sources" | "hide-read") => {
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
  };

  document.addEventListener("click", (e) => {
    if (e.defaultPrevented) return;
    if (!(e.target instanceof HTMLElement)) return;
    const el = e.target.closest("button[data-quick-toggle]");
    if (!(el instanceof HTMLButtonElement)) return;

    const kind = el.dataset.quickToggle;
    if (kind !== "only-followed" && kind !== "only-followed-sources" && kind !== "hide-read") return;
    toggle(kind);
    apply();
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
    // 清理 hash，避免返回/刷新时重复聚焦
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  } catch {
    // ignore
  }
}

function wireDeviceDebug() {
  const details = document.querySelector<HTMLDetailsElement>("#acg-device-debug-details");
  const pre = document.querySelector<HTMLElement>("#acg-device-debug");
  if (!details || !pre) return;

  let enabled = false;
  try {
    const params = new URLSearchParams(window.location.search);
    enabled = params.get("debug") === "1" || localStorage.getItem("acg.debug") === "1";
  } catch {
    enabled = false;
  }

  if (!enabled) return;
  details.hidden = false;

  const lines: string[] = [];
  const el = document.documentElement;
  const vw = window.visualViewport ? `${Math.round(window.visualViewport.width)}x${Math.round(window.visualViewport.height)}` : "-";
  const inner = `${window.innerWidth}x${window.innerHeight}`;
  const screen = window.screen ? `${window.screen.width}x${window.screen.height}` : "-";
  const device = el.dataset.acgDevice ?? "-";

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
  lines.push(`maxTouchPoints: ${navigator.maxTouchPoints || 0}`);
  lines.push(`pointer: coarse=${mq("(pointer: coarse)")} fine=${mq("(pointer: fine)")}`);
  lines.push(`hover: none=${mq("(hover: none)")} hover=${mq("(hover: hover)")}`);

  pre.textContent = lines.join("\n");
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
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
  const count = document.querySelector<HTMLElement>("#acg-search-count");
  const unreadCount = document.querySelector<HTMLElement>("#acg-unread-count");
  const empty = document.querySelector<HTMLElement>("#acg-list-empty");
  const clear = document.querySelector<HTMLButtonElement>("#acg-clear-search");
  if (!input) return;

  const cards = [...document.querySelectorAll<HTMLElement>("[data-post-id]")];
  const haystacks = cards.map((card) => {
    const title = card.querySelector("a")?.textContent ?? "";
    const summary = card.querySelector("p")?.textContent ?? "";
    const tags = [...card.querySelectorAll("button[data-tag]")].map((b) => b.textContent ?? "").join(" ");
    return normalizeText(`${title} ${summary} ${tags}`);
  });
  const hiddenState = cards.map((c) => c.classList.contains("hidden"));

  clear?.addEventListener("click", () => {
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
    toast({ title: isJapanese() ? "検索をクリアしました" : "已清空搜索", variant: "info" });
  });

  const applyNow = () => {
    const q = normalizeText(input.value);
    const followOnlyEnabled = filters.onlyFollowed;
    const followSourcesOnlyEnabled = filters.onlyFollowedSources;
    const hideReadEnabled = filters.hideRead;
    const followWords = followOnlyEnabled ? [...follows] : [];
    const blockWords = blocklist.size > 0 ? [...blocklist] : [];

    let shown = 0;
    let unreadShown = 0;
    for (let i = 0; i < cards.length; i += 1) {
      const id = cards[i].dataset.postId ?? "";
      const sourceId = cards[i].dataset.sourceId ?? "";
      const hay = haystacks[i];

      const matchSearch = q.length === 0 ? true : hay.includes(q);
      const matchFollow = !followOnlyEnabled
        ? true
        : followWords.length === 0
          ? false
          : followWords.some((w) => w && hay.includes(w));
      const matchFollowSources = !followSourcesOnlyEnabled ? true : sourceId ? followedSources.has(sourceId) : false;
      const blocked = blockWords.some((w) => w && hay.includes(w));
      const read = id ? readIds.has(id) : false;
      const hideByRead = hideReadEnabled && read;
      const sourceEnabled = !sourceId || !disabledSources.has(sourceId);

      const ok = matchSearch && matchFollow && matchFollowSources && !blocked && !hideByRead && sourceEnabled;
      const hidden = !ok;
      if (hiddenState[i] !== hidden) {
        cards[i].classList.toggle("hidden", hidden);
        hiddenState[i] = hidden;
      }
      if (ok) {
        shown += 1;
        if (!read) unreadShown += 1;
      }
    }
    if (count) {
      const next = `${shown}/${cards.length}`;
      if (count.textContent !== next) count.textContent = next;
    }
    if (unreadCount) {
      const next = String(unreadShown);
      if (unreadCount.textContent !== next) unreadCount.textContent = next;
    }
    if (empty) empty.classList.toggle("hidden", shown > 0);
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

  input.addEventListener("input", schedule);
  document.addEventListener("acg:filters-changed", schedule);
  applyNow();
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

type UiIconName = "arrow-up" | "external-link" | "refresh" | "star" | "x";

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

function hrefInBase(pathname: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const trimmed = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  return `${base}${trimmed}`;
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
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
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
    const url = hrefInBase("/data/posts.json");
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as unknown;
    if (!Array.isArray(json)) throw new Error("posts.json 格式错误");
    const map = new Map<string, BookmarkPost>();
    for (const item of json) {
      if (!item || typeof item !== "object") continue;
      const it = item as any;
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

function buildBookmarkCard(params: {
  post: BookmarkPost;
  lang: BookmarkLang;
  readIds: Set<string>;
}): HTMLElement {
  const { post, lang, readIds } = params;
  const theme = BOOKMARK_CATEGORY_THEME[post.category];
  const label = BOOKMARK_CATEGORY_LABELS[lang][post.category];
  const retryCoverLabel = lang === "ja" ? "画像を再試行" : "重试封面";
  const detailHref = hrefInBase(`/${lang}/p/${post.id}/`);
  const when = whenLabel(lang, post.publishedAt);
  const publishedAtMs = new Date(post.publishedAt).getTime();
  const isFresh =
    Number.isFinite(publishedAtMs) && Date.now() - publishedAtMs >= 0 && Date.now() - publishedAtMs < 6 * 60 * 60 * 1000;
  const freshLabel = lang === "ja" ? "新着" : "NEW";

  const displayTitle = lang === "zh" ? post.titleZh ?? post.title : post.titleJa ?? post.title;
  const displaySnippet =
    lang === "zh"
      ? post.summaryZh ?? post.previewZh ?? post.summary ?? post.preview
      : post.summaryJa ?? post.previewJa ?? post.summary ?? post.preview;

  const article = document.createElement("article");
  article.className = "glass-card acg-card clickable shine group relative overflow-hidden rounded-2xl";
  article.dataset.postId = post.id;
  article.dataset.category = post.category;
  article.dataset.sourceId = post.sourceId;
  article.dataset.hasCover = post.cover ? "true" : "false";
  if (readIds.has(post.id)) article.setAttribute("data-read", "true");

  const topLink = document.createElement("a");
  topLink.href = detailHref;
  topLink.className = "relative block aspect-[16/9]";
  article.appendChild(topLink);

  const retryBtn = document.createElement("button");
  retryBtn.type = "button";
  retryBtn.className = "acg-cover-retry glass-card clickable";
  retryBtn.dataset.coverRetry = "true";
  retryBtn.setAttribute("aria-label", retryCoverLabel);
  retryBtn.title = retryCoverLabel;
  retryBtn.appendChild(createUiIcon({ name: "refresh", size: 18 }));
  article.appendChild(retryBtn);

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

  if (post.cover) {
    const img = document.createElement("img");
    img.src = bestInitialCoverSrc(post.cover, 960);
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.dataset.acgCover = "true";
    img.dataset.acgCoverOriginalSrc = post.coverOriginal ?? post.cover;
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
  badgeWrap.className = "absolute left-3 top-3 flex flex-wrap items-center gap-2";
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
  whenWrap.className = "absolute bottom-3 left-3";
  const whenChip = document.createElement("span");
  whenChip.className =
    "inline-flex max-w-[22ch] truncate rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/90";
  whenChip.textContent = when;
  whenWrap.appendChild(whenChip);
  topLink.appendChild(whenWrap);

  const body = document.createElement("div");
  body.className = "p-4 sm:p-5";
  article.appendChild(body);

  const head = document.createElement("div");
  head.className = "flex items-start justify-between gap-3";
  body.appendChild(head);

  const left = document.createElement("div");
  left.className = "min-w-0";
  head.appendChild(left);

  const titleLink = document.createElement("a");
  titleLink.href = detailHref;
  titleLink.className =
    "block text-[15px] font-semibold leading-snug text-slate-950 hover:underline line-clamp-2 sm:text-base";
  titleLink.textContent = displayTitle || (lang === "ja" ? "（無題）" : "（无标题）");
  left.appendChild(titleLink);

  const meta = document.createElement("div");
  meta.className = "mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs";
  left.appendChild(meta);

  if (post.sourceUrl && post.sourceName) {
    const sourceLink = document.createElement("a");
    sourceLink.className =
      "inline-flex items-center gap-2 rounded-full border border-slate-900/10 bg-white/55 px-2.5 py-1 text-[11px] text-slate-700 hover:bg-white/75 clickable";
    sourceLink.href = post.sourceUrl;
    sourceLink.target = "_blank";
    sourceLink.rel = "noreferrer";

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

    meta.appendChild(sourceLink);
  }

  const star = document.createElement("button");
  star.type = "button";
  star.className = "glass-card rounded-xl px-3 py-2 text-xs font-medium text-slate-950 clickable";
  star.dataset.bookmarkId = post.id;
  star.setAttribute("aria-pressed", "true");
  star.title = "Bookmark";
  const starIcon = document.createElement("span");
  starIcon.setAttribute("data-bookmark-icon", "");
  starIcon.setAttribute("aria-hidden", "true");
  starIcon.appendChild(createUiIcon({ name: "star", size: 18 }));
  star.appendChild(starIcon);
  setBookmarkButtonState(star, true);
  head.appendChild(star);

  if (displaySnippet) {
    const p = document.createElement("p");
    p.className = "mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600";
    p.textContent = displaySnippet;
    body.appendChild(p);
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

  const apply = async () => {
    if (applyRunning) return;
    applyRunning = true;

    try {
      if (bookmarkIds.size === 0) {
        grid.innerHTML = "";
        renderedIds = new Set();
        container.hidden = true;
        if (count) count.textContent = "0";
        if (empty) empty.classList.remove("hidden");
        return;
      }

      const byId = await getBookmarkPostsById();

      // 只处理“删除”场景，避免每次点击都全量重排；新增（导入/其它页新增）则全量重绘一次。
      const hasAdd = bookmarkIds.size > renderedIds.size;
      if (!hasAdd) {
        let removed = 0;
        for (const id of [...renderedIds]) {
          if (bookmarkIds.has(id)) continue;
          grid.querySelector(`[data-post-id="${id}"]`)?.remove();
          renderedIds.delete(id);
          removed += 1;
        }
        if (removed > 0) applyReadState(readIds);
      } else {
        const list: BookmarkPost[] = [];
        const missing: string[] = [];
        for (const id of bookmarkIds) {
          const post = byId.get(id);
          if (post) list.push(post);
          else missing.push(id);
        }
        list.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

        const frag = document.createDocumentFragment();
        for (const post of list) {
          frag.appendChild(buildBookmarkCard({ post, lang, readIds }));
        }
        grid.innerHTML = "";
        grid.appendChild(frag);
        renderedIds = new Set(list.map((p) => p.id));

        if (missing.length > 0) {
          setBookmarksMessage(
            lang === "ja"
              ? `一部のブックマークは期間外のため表示できません（${missing.length}件）。`
              : `部分收藏因超出数据保留期而无法展示（${missing.length} 条）。`
          );
        }
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
      toast({ title: lang === "ja" ? "ブックマーク読み込み失敗" : "收藏加载失败", desc: msg, variant: "error" });
    } finally {
      applyRunning = false;
    }
  };

  void apply();
  document.addEventListener("acg:bookmarks-changed", () => void apply());
}

function isJapanese(): boolean {
  const lang = document.documentElement.lang || "";
  return lang.toLowerCase().startsWith("ja");
}

function setBookmarksMessage(text: string) {
  const el = document.querySelector<HTMLElement>("#acg-bookmarks-message");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("hidden");
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
    const stamp = now
      .toISOString()
      .replace(/[:.]/g, "")
      .replace("T", "-")
      .slice(0, 15);
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
          ? (parsed as any).ids
          : null;

      const list = Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
      const before = bookmarkIds.size;
      for (const id of list) bookmarkIds.add(id);
      saveIds(BOOKMARK_KEY, bookmarkIds);
      document.dispatchEvent(new CustomEvent("acg:bookmarks-changed"));

      const added = bookmarkIds.size - before;
      setBookmarksMessage(
        isJapanese()
          ? `インポート完了（+${added}）。`
          : `导入完成（新增 +${added}）。`
      );
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
  el.textContent = text;
  el.classList.remove("hidden");
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
    btn.addEventListener("click", () => onRemove(word));
    container.appendChild(btn);
  }
}

function wirePreferences(params: {
  follows: Set<string>;
  blocklist: Set<string>;
  filters: FilterStore;
}) {
  const { follows, blocklist, filters } = params;

  const onlyFollowed = document.querySelector<HTMLInputElement>("#acg-only-followed");
  const onlyFollowedSources = document.querySelector<HTMLInputElement>("#acg-only-followed-sources");
  const hideRead = document.querySelector<HTMLInputElement>("#acg-hide-read");
  const followInput = document.querySelector<HTMLInputElement>("#acg-follow-input");
  const followAdd = document.querySelector<HTMLButtonElement>("#acg-follow-add");
  const followList = document.querySelector<HTMLElement>("#acg-follow-list");
  const blockInput = document.querySelector<HTMLInputElement>("#acg-block-input");
  const blockAdd = document.querySelector<HTMLButtonElement>("#acg-block-add");
  const blockList = document.querySelector<HTMLElement>("#acg-block-list");

  if (
    !onlyFollowed ||
    !onlyFollowedSources ||
    !hideRead ||
    !followInput ||
    !followAdd ||
    !followList ||
    !blockInput ||
    !blockAdd ||
    !blockList
  ) {
    return;
  }

  onlyFollowed.checked = filters.onlyFollowed;
  onlyFollowedSources.checked = filters.onlyFollowedSources;
  hideRead.checked = filters.hideRead;

  const emit = () => document.dispatchEvent(new CustomEvent("acg:filters-changed"));

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

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // ignore
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
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
    msg.textContent = ok ? (isJapanese() ? "クリップボードにコピーしました。" : "已复制到剪贴板。") : (isJapanese() ? "コピーに失敗しました。" : "复制失败。");
    msg.classList.remove("hidden");
    toast({
      title: ok ? (isJapanese() ? "コピーしました" : "已复制") : isJapanese() ? "コピー失敗" : "复制失败",
      variant: ok ? "success" : "error"
    });
  });
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
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;

    const endDrag = () => {
      if (!dragging) return;
      // 触控端可能直接触发原生滚动，pointermove 不一定可靠：用 scrollLeft 兜底判断是否发生拖拽
      if (Math.abs(track.scrollLeft - startScrollLeft) > 6) dragged = true;
      dragging = false;
      pointerId = null;
      track.classList.remove("is-dragging");
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
      startX = e.clientX;
      startY = e.clientY;
      startScrollLeft = track.scrollLeft;
      track.classList.add("is-dragging");
      try {
        if (e.pointerType === "mouse") track.setPointerCapture(pointerId);
      } catch {
        // ignore
      }
    });

    track.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      if (pointerId != null && e.pointerId !== pointerId) return;
      const dx = startX - e.clientX;
      const dy = startY - e.clientY;
      if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) dragged = true;

      // mouse: 用脚本模拟“抓取拖拽”更顺手；touch: 交给原生滚动（性能更好）
      if (e.pointerType === "mouse") {
        track.scrollLeft = startScrollLeft + dx;
      }
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

function markCurrentPostRead(readIds: Set<string>) {
  const current = document.body.dataset.currentPostId ?? "";
  if (!current) return;
  if (readIds.has(current)) return;
  readIds.add(current);
  saveIds(READ_KEY, readIds);
}

function main() {
  window.__acgCoverError = handleCoverError;
  window.__acgCoverLoad = handleCoverLoad;

  const bookmarkIds = loadIds(BOOKMARK_KEY);
  const readIds = loadIds(READ_KEY);
  const follows = loadWords(FOLLOWS_KEY);
  const blocklist = loadWords(BLOCKLIST_KEY);
  const filters = loadFilters();
  const disabledSources = loadIds(DISABLED_SOURCES_KEY);
  const followedSources = loadIds(FOLLOWED_SOURCES_KEY);
  markCurrentPostRead(readIds);
  applyReadState(readIds);
  wireBackToTop();
  wireCoverRetry();
  wireBookmarks(bookmarkIds);
  wireBookmarksPage(bookmarkIds, readIds);
  wireBookmarkTools(bookmarkIds);
  wirePreferences({ follows, blocklist, filters });
  wireSourceToggles(disabledSources);
  wireSourceFollows(followedSources);
  createListFilter({ readIds, follows, blocklist, disabledSources, followedSources, filters });
  wireQuickToggles();
  wireKeyboardShortcuts();
  wireSearchClear();
  wirePrefsDrawer();
  wireFullTextReader();
  wireTagChips();
  wireDailyBriefCopy();
  wireSpotlightCarousel();
  hydrateCoverStates();
  wireDeviceDebug();
  focusSearchFromHash();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
