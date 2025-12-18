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

// v3：当“全文预览”的抽取/清洗策略发生结构性变化时，升级缓存版本，避免用户长期被旧的错误正文污染。
// 说明：这里采用“硬失效”策略（不自动迁移旧缓存），确保修复能立刻在所有页面生效，而不需要用户手动点「重新加载」或清空缓存。
const FULLTEXT_CACHE_PREFIX = "acg.fulltext.v5:";

function fullTextCacheKey(postId: string): string {
  return `${FULLTEXT_CACHE_PREFIX}${postId}`;
}

function readFullTextCache(postId: string): FullTextCacheEntry | null {
  const parse = (raw: string | null): FullTextCacheEntry | null => {
    if (!raw) return null;
    try {
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
  };

  return parse(localStorage.getItem(fullTextCacheKey(postId)));
}

function writeFullTextCache(postId: string, entry: FullTextCacheEntry) {
  try {
    // 保护：避免 localStorage 被超大正文撑爆（不同浏览器配额不同）
    // 策略：优先保证“原文”可缓存；若总体过大，则丢弃翻译缓存（翻译可重新生成）。
    const MAX = 160_000;
    const sizeOf = (it: FullTextCacheEntry) => it.original.length + (it.zh?.length ?? 0) + (it.ja?.length ?? 0);

    const base: FullTextCacheEntry = {
      url: entry.url,
      fetchedAt: entry.fetchedAt,
      original: entry.original
    };
    if (sizeOf(base) > MAX) return;

    const toWrite = sizeOf(entry) <= MAX ? entry : base;
    localStorage.setItem(fullTextCacheKey(postId), JSON.stringify(toWrite));
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

function applyBasicEmphasis(escaped: string): string {
  // 注意：这里输入必须是“已 escape”的字符串，保证安全。
  let s = escaped;

  // Bold: **text**
  s = s.replace(/\*\*([^\n*][^*\n]*?)\*\*/g, "<strong>$1</strong>");

  // Italic: _text_（多数抓取/翻译会用下划线包裹作品名）
  s = s.replace(/_([^\n_][^_\n]*?)_/g, "<em>$1</em>");

  // Italic: *text*（尽量保守，避免和列表/符号冲突）
  s = s.replace(/(^|[^*])\*([^\n*][^*\n]*?)\*(?!\*)/g, "$1<em>$2</em>");

  return s;
}

function safeHttpUrl(raw: string, baseUrl: string): string | null {
  let cleaned = raw.trim().replace(/\s+/g, "");
  // 兼容尾部粘连标点/编码标点（尤其是 `）` / `】` / `」` 这类全角符号）
  cleaned = stripEncodedTrailingPunct(trimUrlTrailingPunct(cleaned).url);
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

  // 修复少数来源会把 URL 本体在换行处截断：`https://.../new\ns/...` -> `https://.../news/...`
  // 只在“下一行开头很像 path continuation（短前缀 + /）”时拼接，避免误伤正常段落换行。
  text = text.replace(/(https?:\/\/[^\s)\]]+)\n+([A-Za-z0-9._-]{0,16}\/[^\s)\]]+)/g, "$1$2");

  // 站点脏数据修复：少数来源（例如 ANN 的图片 credit）会输出形如 `[[label](url)]]` 的“多括号”。
  // 这会破坏我们的 Markdown 渲染（并在 UI 中出现 `]]` 等杂质），因此在归一化阶段强行修正。
  text = text.replace(/\[\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)\]\]/g, "[$1]($2)");
  text = text.replace(/\[\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)\]/g, "[$1]($2)");

  // 兜底：如果内部占位符意外泄漏到 Markdown，直接清除（不应出现在用户内容里）
  // 兼容：大小写变化 / 中间被插入空白 / 全角 @ 等异常形态
  text = text.replace(/@@\s*ACG\s*TOKEN\s*\d+\s*@@/gi, "");
  text = text.replace(/＠＠\s*ACG\s*TOKEN\s*\d+\s*＠＠/gi, "");

  // 清理“孤立括号/标点”噪音行（常由链接换行或抽取器残留导致）
  text = text.replace(/^\s*[)\]】」）]\s*$/gm, "");
  text = text.replace(/^\s*[（(\[【「『]\s*$/gm, "");

  // 清理“无意义的纯数字”项目符号（常见于脚注/引用残留，如 `- 1`）
  text = text.replace(/^\s*[-*]\s+\d+\s*$/gm, "");

  // 更激进：移除常见的“站点尾部导航/讨论/档案”残留（尤其是 ANN）
  // 这些内容属于页面壳，而非正文；如果混入全文预览，会显得非常杂乱。
  const annHost = String.raw`(?:www\.)?animenewsnetwork\.com`;
  // 例：`[News homepage](https://www.animenewsnetwork.com/news/) / [archives](https://www.animenewsnetwork.com/news/archive)`
  text = text.replace(
    new RegExp(
      String.raw`^\s*(?:\[[^\]]+\]\(https?:\/\/${annHost}\/news\/\)\s*\/\s*)?\[[^\]]+\]\(https?:\/\/${annHost}\/news\/archive[^)]*\)\s*$`,
      "gmi"
    ),
    ""
  );
  // 例：`[discuss this in the forum](https://www.animenewsnetwork.com/cms/discuss/232153)`
  text = text.replace(new RegExp(String.raw`^\s*\[[^\]]+\]\(https?:\/\/${annHost}\/cms\/discuss\/[^)]*\)\s*$`, "gmi"), "");

  // 更激进：清理“正文尾部的纯链接/孤立分隔符”噪音（常见于阅读模式/抽取器把页脚/推荐/图片页链接带进来）。
  // 注：站点原文入口已经由页面底部「打开原文」提供，这里宁可删多一点，也不要把正文尾巴污染成链接堆。
  const lines = text.split("\n");
  const isTrailingJunkLine = (raw: string): boolean => {
    const s = raw.trim();
    if (!s) return true;
    if (/^[|/\\]+$/.test(s)) return true;
    if (looksLikeUrlText(s)) return true;
    const m = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*$/.exec(s);
    if (m?.[2]) {
      const label = (m[1] ?? "").trim();
      const href = (m[2] ?? "").trim();
      if (!label) return true;
      if (looksLikeUrlText(label)) return true;
      if (isMostlyUrlLabel(label, href)) return true;
      if (label.length <= 2) return true;
    }
    return false;
  };
  let end = lines.length;
  while (end > 0 && isTrailingJunkLine(lines[end - 1] ?? "")) end -= 1;
  text = lines.slice(0, end).join("\n");

  // 合并空行
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function stripInternalPlaceholdersFromHtml(html: string): string {
  if (!html) return html;
  return html
    .replace(/@@\s*ACG\s*TOKEN\s*\d+\s*@@/gi, "")
    .replace(/＠＠\s*ACG\s*TOKEN\s*\d+\s*＠＠/gi, "")
    // 兜底：占位符被强调/杂质打断（例：`@@ACG<em>TOKEN</em>0@@`）
    .replace(/@@ACG(?:<[^>]+>)*TOKEN(?:<[^>]+>)*\s*\d+\s*(?:<[^>]+>)*@@/gi, "")
    .replace(/＠＠ACG(?:<[^>]+>)*TOKEN(?:<[^>]+>)*\s*\d+\s*(?:<[^>]+>)*＠＠/gi, "");
}

type InlineToken =
  | { type: "code"; text: string }
  | { type: "link"; text: string; href: string }
  | { type: "img"; alt: string; src: string; href: string; originalSrc?: string }
  | { type: "autolink"; href: string; host: string; path: string };

function splitUrlForDisplay(href: string): { host: string; path: string } {
  try {
    const u = new URL(href);
    const host = u.hostname.replace(/^www\./, "");
    const rawPath = `${u.pathname || ""}${u.search ? "?…" : ""}${u.hash ? "#…" : ""}`;
    if (!rawPath || rawPath === "/") return { host, path: "" };

    const maxLen = 52;
    const path = rawPath.length > maxLen ? `…${rawPath.slice(Math.max(0, rawPath.length - (maxLen - 1)))}` : rawPath;
    return { host, path };
  } catch {
    return { host: href, path: "" };
  }
}

function trimUrlTrailingPunct(raw: string): { url: string; trailing: string } {
  // 常见情况：句末标点/括号导致 URL “粘连”，需要拆开。
  // 规则：尽量保守，只剥离明显的结束标点；括号要做简单配对判断。
  let url = raw;
  let trailing = "";
  const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

  while (url.length > 0) {
    const ch = url[url.length - 1] ?? "";
    // 同时覆盖英文与常见全角标点（避免 `...html）` 之类的粘连）
    if (!/[)\]）］.,!?:;}"'»」】。，！？：；]/.test(ch)) break;

    if (ch === ")") {
      const open = count(url, /\(/g);
      const close = count(url, /\)/g);
      // 如果 close <= open，说明这个 ')' 可能是 URL 自身的一部分（例如 wikipedia 的括号页）
      if (close <= open) break;
    }
    if (ch === "）") {
      const open = count(url, /（/g);
      const close = count(url, /）/g);
      if (close <= open) break;
    }

    trailing = ch + trailing;
    url = url.slice(0, -1);
  }

  return { url, trailing };
}

function stripEncodedTrailingPunct(input: string): string {
  // 一些来源/翻译会把“句末括号/标点”带进 URL，且可能被百分号编码（例如 `%EF%BC%89`）。
  // 这里做“只剥离尾部明显噪音”的保守处理，尽量不误伤 URL 本体。
  let url = input;

  // 1) 先处理常见全角标点（多为正文标点，不太可能是 URL 必需部分）
  // - ） : %EF%BC%89
  // - 】 : %E3%80%91
  // - 」 : %E3%80%8D
  // - 。 : %E3%80%82
  // - ， : %EF%BC%8C
  // - ： : %EF%BC%9A
  // - ； : %EF%BC%9B
  // - ！ : %EF%BC%81
  // - ？ : %EF%BC%9F
  const fullwidthTail = /(?:%EF%BC%89|%E3%80%91|%E3%80%8D|%E3%80%82|%EF%BC%8C|%EF%BC%9A|%EF%BC%9B|%EF%BC%81|%EF%BC%9F)+$/i;
  url = url.replace(fullwidthTail, "");

  // 2) 再处理 ASCII 的“闭合符号”编码：仅在没有对应 opener 时才剥离，避免误伤 wiki 等合法括号 URL
  const pairs: Array<{ close: RegExp; open: RegExp }> = [
    { close: /%29$/i, open: /%28/i }, // )
    { close: /%5D$/i, open: /%5B/i }, // ]
    { close: /%7D$/i, open: /%7B/i } // }
  ];

  while (true) {
    let changed = false;
    for (const p of pairs) {
      if (p.close.test(url) && !p.open.test(url)) {
        url = url.replace(p.close, "");
        changed = true;
      }
    }
    if (!changed) break;
  }

  return url;
}

function normalizeUrlForCompare(href: string): string {
  // 用于“去重/聚合”的稳定比较键：忽略 query/hash，并剥离常见尾部括号噪音。
  const raw = href.trim();
  if (!raw) return "";

  // 先剥离可能粘连的“可见标点”
  const t = trimUrlTrailingPunct(raw);
  let cleaned = stripEncodedTrailingPunct(t.url);

  // 再剥离常见的“被百分号编码的标点”（例如文本里把 `）` 编成 `%EF%BC%89`）
  // 只在 URL 末尾出现时处理，避免误伤正文路径。
  const encodedTailRe = /(?:%29|%5D|%7D|%2C|%2E|%3A|%3B|%22|%27|%EF%BC%89|%E3%80%91|%E3%80%8D)+$/i;
  cleaned = cleaned.replace(encodedTailRe, "");

  try {
    const u = new URL(cleaned);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const pathname = (u.pathname || "/").replace(/\/+$/g, "/");
    return `${host}${pathname}`;
  } catch {
    return cleaned;
  }
}

function tryDeriveImageUrlFromLink(href: string): string | null {
  try {
    const u = new URL(href);
    const path = (u.pathname ?? "").toLowerCase();

    // direct image link
    if (/\.(png|jpe?g|webp|gif|avif)$/.test(path)) return u.toString();

    // inside-games “图片页”：/article/img/YYYY/MM/DD/<articleId>/<imageId>.html
    if (u.hostname.endsWith("inside-games.jp")) {
      const m = /\/article\/img\/\d{4}\/\d{2}\/\d{2}\/\d+\/(\d+)\.html$/i.exec(u.pathname ?? "");
      if (m?.[1]) return `https://www.inside-games.jp/imgs/ogp_f/${m[1]}.jpg`;
    }

    return null;
  } catch {
    return null;
  }
}

function looksLikeUrlText(text: string): boolean {
  const s = text.trim();
  if (!s) return false;
  if (/^https?:\/\//i.test(s)) return true;
  if (/^www\./i.test(s)) return true;
  if (s.includes("://")) return true;
  return false;
}

function isMostlyUrlLabel(label: string, href: string): boolean {
  const a = label.trim();
  const b = href.trim();
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.replace(/^https?:\/\//i, "") === b.replace(/^https?:\/\//i, "")) return true;
  return false;
}

function renderInlineMarkdown(input: string, baseUrl: string): string {
  const tokens: InlineToken[] = [];
  const push = (t: InlineToken) => {
    const id = tokens.length;
    tokens.push(t);
    // 注意：占位符里不要包含 "_" 或 "*"，否则会被 `applyBasicEmphasis()` 误判为 Markdown 强调语法，
    // 导致替换失败并把占位符直接渲染到页面上（例如 `@@ACGTOKEN0@@`）。
    return `@@ACGTOKEN${id}@@`;
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
    const labelText = String(label ?? "").trim();

    // 更激进：对特定站点（尤其 ANN）的“百科/人物/公司/作品词条”链接，默认只保留文本，避免正文里一屏全是蓝链。
    // 这类链接属于站点内部增强信息，不是正文必要内容。
    try {
      const baseHost = new URL(baseUrl).hostname.toLowerCase();
      const u = new URL(abs);
      if (baseHost.endsWith("animenewsnetwork.com") && u.hostname.toLowerCase().endsWith("animenewsnetwork.com")) {
        const p = (u.pathname || "/").toLowerCase();
        if (p.startsWith("/encyclopedia/")) return labelText || abs;
      }
    } catch {
      // ignore
    }

    // 如果链接本质上是“图片/图片页”，就直接图文化（避免全文里出现一堆 [1](...) / [https://...](...)）
    const derivedImage = tryDeriveImageUrlFromLink(abs);
    if (derivedImage) {
      const numeric = /^\d+$/.test(labelText);
      const urlLike = looksLikeUrlText(labelText) || isMostlyUrlLabel(labelText, abs);
      const shortLabel = labelText.length <= 14;
      if (numeric || urlLike || shortLabel) {
        const src = bestInitialCoverSrc(derivedImage, 1200);
        return push({ type: "img", alt: "", src, href: abs, originalSrc: derivedImage });
      }
    }

    // 形如 [https://...](https://...)：渲染为链接卡片，而不是裸 URL 文本
    if (looksLikeUrlText(labelText) || isMostlyUrlLabel(labelText, abs)) {
      const parts = splitUrlForDisplay(abs);
      return push({ type: "autolink", href: abs, host: parts.host, path: parts.path });
    }

    return push({ type: "link", text: labelText, href: abs });
  });

  // auto-linkify：把纯 URL 变成可点击的“链接卡片”（不联网预取元信息，避免拖慢）
  text = text.replace(/https?:\/\/[^\s<>"']+/g, (m) => {
    const { url, trailing } = trimUrlTrailingPunct(String(m));
    const abs = safeHttpUrl(url, baseUrl);
    if (!abs) return String(m);

    // 图片增强：对“直链图片/图片页”直接渲染为图片（更有视觉信息）
    const derivedImage = tryDeriveImageUrlFromLink(abs);
    if (derivedImage) {
      const src = bestInitialCoverSrc(derivedImage, 1200);
      return `${push({ type: "img", alt: "", src, href: abs, originalSrc: derivedImage })}${trailing}`;
    }

    const parts = splitUrlForDisplay(abs);
    return `${push({ type: "autolink", href: abs, host: parts.host, path: parts.path })}${trailing}`;
  });

  // 先整体 escape，再把 token 注入为 HTML
  text = escapeHtml(text);
  text = applyBasicEmphasis(text);

  text = text.replace(/@@ACGTOKEN(\d+)@@/g, (_m, n) => {
    const idx = Number(n);
    const t = tokens[idx];
    if (!t) return "";

    if (t.type === "code") return `<code>${escapeHtml(t.text)}</code>`;

    if (t.type === "link") {
      const href = escapeHtml(t.href);
      const label = escapeHtml(t.text);
      return `<a href="${href}" target="_blank" rel="noreferrer noopener" title="${href}">${label}</a>`;
    }

    if (t.type === "img") {
      const href = escapeHtml(t.href);
      const original = escapeHtml(t.originalSrc ?? t.href);
      const src = escapeHtml(t.src);
      const alt = escapeHtml(t.alt);
      return `<a class="acg-prose-img-link" href="${href}" target="_blank" rel="noreferrer noopener"><img src="${src}" alt="${alt}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-acg-cover data-acg-cover-original-src="${original}" onload="window.__acgCoverLoad?.(this)" onerror="window.__acgCoverError?.(this)" /></a>`;
    }

    if (t.type === "autolink") {
      const href = escapeHtml(t.href);
      const host = escapeHtml(t.host);
      const path = escapeHtml(t.path);
      const pathHtml = path ? `<span class="acg-prose-autolink-path">${path}</span>` : "";
      return `<a class="acg-prose-autolink" href="${href}" target="_blank" rel="noreferrer noopener" title="${href}"><span class="acg-prose-autolink-text"><span class="acg-prose-autolink-host">${host}</span>${pathHtml}</span></a>`;
    }

    return "";
  });

  // 兜底：如果占位符因强调/杂质被打断，避免把内部实现细节渲染给用户
  // 例：`@@ACG<em>TOKEN</em>0@@`、`＠＠ACGTOKEN0＠＠` 等
  text = text.replace(/@@ACG(?:<[^>]+>)*TOKEN(?:<[^>]+>)*\d+(?:<[^>]+>)*@@/gi, "");
  text = text.replace(/＠＠ACG(?:<[^>]+>)*TOKEN(?:<[^>]+>)*\d+(?:<[^>]+>)*＠＠/gi, "");

  return text;
}

function renderMarkdownToHtml(md: string, baseUrl: string): string {
  const text = normalizeFullTextMarkdown(md);
  if (!text) return "";

  const baseKey = normalizeUrlForCompare(baseUrl);
  const isSelfLinkLine = (raw: string): boolean => {
    const s = raw.trim();
    if (!s || !baseKey) return false;

    // 纯 URL
    if (looksLikeUrlText(s)) {
      const abs = safeHttpUrl(s, baseUrl);
      if (!abs) return false;
      return normalizeUrlForCompare(abs) === baseKey;
    }

    // 单条 Markdown 链接（整行只有一个 link）：[text](url)
    const m = /^\[([^\]]+)\]\(([^)]+)\)\s*$/.exec(s);
    if (m?.[2]) {
      const abs = safeHttpUrl(m[2], baseUrl);
      if (!abs) return false;
      return normalizeUrlForCompare(abs) === baseKey;
    }

    return false;
  };

  const lines = text.split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: "ul" | "ol" | null = null;
  let olCounter = 0;
  let inCode = false;
  let codeLines: string[] = [];

  const flushPara = () => {
    if (para.length === 0) return;
    // Markdown 语义：段落内的单个换行通常应视为“空格”，否则会出现大量硬换行导致阅读灾难。
    // （抓取/翻译的结果经常会把一段拆成多行；这里做“软换行合并”。）
    const joined = para.join(" ").replace(/\s+/g, " ").trim();
    para = [];
    if (!joined) return;
    // 去掉“正文里重复出现的文章自身 URL”（常由阅读模式/抽取器残留造成，属于纯噪音）
    if (isSelfLinkLine(joined)) return;
    const html = renderInlineMarkdown(joined, baseUrl);
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
    if (kind === "ol") olCounter = 0;
    out.push(`<${kind}>`);
    list = kind;
  };

  const normalizeDateLabel = (raw: string) => raw.replace(/\s+/g, "").replace(/日$/, "日");

  const renderListItem = (raw: string, params: { orderedIndex?: number } = {}) => {
    const orderedIndex = params.orderedIndex;
    const value = raw.trim();

    if (typeof orderedIndex === "number") {
      return `<span class="acg-prose-li-prefix acg-prose-ol">${escapeHtml(String(orderedIndex))}</span><span class="acg-prose-li-content">${renderInlineMarkdown(
        value,
        baseUrl
      )}</span>`;
    }

    const timeMatch = /^(\d{1,2}:\d{2})\s*(.*)$/.exec(value);
    if (timeMatch) {
      const t = timeMatch[1] ?? "";
      const rest = (timeMatch[2] ?? "").trim();
      return `<span class="acg-prose-li-prefix acg-prose-time">${escapeHtml(t)}</span><span class="acg-prose-li-content">${renderInlineMarkdown(
        rest || value,
        baseUrl
      )}</span>`;
    }

    const dateMatch = /^(\d{1,2}\s*月\s*\d{1,2}\s*日)\s*(.*)$/.exec(value);
    if (dateMatch) {
      const d = normalizeDateLabel(dateMatch[1] ?? "");
      const rest = (dateMatch[2] ?? "").trim();
      return `<span class="acg-prose-li-prefix acg-prose-date">${escapeHtml(d)}</span><span class="acg-prose-li-content">${renderInlineMarkdown(
        rest || value,
        baseUrl
      )}</span>`;
    }

    return `<span class="acg-prose-li-prefix acg-prose-dot" aria-hidden="true"></span><span class="acg-prose-li-content">${renderInlineMarkdown(
      value,
      baseUrl
    )}</span>`;
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
      const value = (ul[1] ?? "").trim();
      if (isSelfLinkLine(value)) continue;
      const liHtml = renderListItem(value);
      if (liHtml.trim()) {
        openList("ul");
        out.push(`<li class="acg-prose-li">${liHtml}</li>`);
      }
      continue;
    }

    const ol = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (ol) {
      flushPara();
      const value = (ol[1] ?? "").trim();
      if (isSelfLinkLine(value)) continue;
      openList("ol");
      const nextIndex = olCounter + 1;
      const liHtml = renderListItem(value, { orderedIndex: nextIndex });
      if (liHtml.trim()) {
        olCounter = nextIndex;
        out.push(`<li class="acg-prose-li">${liHtml}</li>`);
      }
      continue;
    }

    // list continuation（下一行缩进）：把它并到上一条 li 里，避免“标题被换行断开”。
    // 仅在存在缩进时触发，避免误伤正常段落。
    if (list && /^\s{2,}\S/.test(rawLine)) {
      const last = out[out.length - 1];
      if (last && last.endsWith("</li>")) {
        const extra = renderInlineMarkdown(trimmed, baseUrl);
        out[out.length - 1] = last.replace(/<\/li>$/, `<br />${extra}</li>`);
        continue;
      }
    }

    // normal paragraph
    para.push(trimmed);
  }

  if (inCode) flushCode();
  flushPara();
  closeList();
  return out.join("\n");
}

type ProseKind = "article" | "index";

function detectProseKind(root: HTMLElement): ProseKind {
  try {
    const li = root.querySelectorAll("li").length;
    const pNodes = [...root.querySelectorAll("p")];
    const p = pNodes.length;
    const h = root.querySelectorAll("h2, h3, h4").length;
    const textLen = (root.textContent ?? "").trim().length;

    // 文章信号：存在多段“较长段落”，优先判定为文章（避免 Inside 等文章页因“相关链接列表”而被误判为目录页）
    const longP = pNodes.filter((el) => ((el.textContent ?? "").replace(/\s+/g, " ").trim().length >= 90)).length;
    if (longP >= 3 || (longP >= 2 && p >= 6)) return "article";

    // “目录/新闻列表”特征：大量 list item，段落较少；或标题+列表组合；或整体很长但结构偏列表。
    if (li >= 36) return "index";
    if (li >= 24 && p <= 6) return "index";
    if (li >= 16 && li >= Math.max(6, p * 2) && p <= 8) return "index";
    if (h >= 4 && li >= 10 && p <= 8) return "index";
    if (textLen >= 8000 && li >= 12 && p <= 12 && longP <= 1) return "index";
    return "article";
  } catch {
    return "article";
  }
}

function enhanceProseIndex(root: HTMLElement) {
  // 只对“新闻目录/列表页”做折叠分区：让一大坨列表变得可浏览、可定位。
  if (root.dataset.acgProseKind !== "index") return;

  // 重复渲染（原文/翻译切换）会重建 innerHTML，因此这里不需要全局单例锁；
  // 但同一次渲染里避免二次执行。
  if (root.dataset.acgProseEnhanced === "1") return;
  root.dataset.acgProseEnhanced = "1";

  let sectionIndex = 0;
  let el: Element | null = root.firstElementChild;

  const shouldOpenByDefault = (title: string, idx: number) => {
    if (idx <= 2) return true;
    if (/news|ニュース|新闻动态|新闻|公告|press|feature/i.test(title)) return true;
    return false;
  };

  while (el) {
    if (el.tagName === "H4") {
      sectionIndex += 1;
      const h = el as HTMLElement;
      const titleText = (h.textContent ?? "").trim();

      const details = document.createElement("details");
      details.className = "acg-prose-section";
      if (shouldOpenByDefault(titleText, sectionIndex)) details.open = true;

      const summary = document.createElement("summary");
      summary.className = "acg-prose-section-summary";
      summary.innerHTML = h.innerHTML;

      const body = document.createElement("div");
      body.className = "acg-prose-section-body";

      details.appendChild(summary);
      details.appendChild(body);

      // 把 heading 之后的内容移入 section，直到下一个 H4
      let sib = h.nextElementSibling;
      while (sib && sib.tagName !== "H4") {
        const next = sib.nextElementSibling;
        body.appendChild(sib);
        sib = next;
      }

      const itemCount = body.querySelectorAll("li").length;
      if (itemCount > 0) {
        const badge = document.createElement("span");
        badge.className = "acg-prose-section-count";
        badge.textContent = String(itemCount);
        summary.appendChild(badge);
      }

      h.replaceWith(details);
      el = sib;
      continue;
    }

    el = el.nextElementSibling;
  }
}

function cleanLinkRowTitle(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  // 去掉“URL 被抽走”后常见残留：行尾的 "(" / "（" / "【" 等开括号
  s = s.replace(/[（(\[【「『]\s*$/g, "").trim();
  // 去掉行尾孤立的冒号
  s = s.replace(/[：:]\s*$/g, "").trim();
  return s;
}

function enhanceLinkListItems(root: HTMLElement) {
  // 文章页：链接卡片化会让“杂质链接”更显眼。这里只服务于“目录/列表页”。
  if (root.dataset.acgProseKind === "article") return;

  // 把“标题 + inside-games.jp URL 卡片”这类内容，压缩成单条可点击嵌入：
  // - 覆盖 list item 内部（.acg-prose-li-content）
  // - 覆盖部分来源会输出为段落的“标题 + URL”
  const containers = [
    ...root.querySelectorAll<HTMLElement>(".acg-prose-li-content"),
    ...root.querySelectorAll<HTMLElement>("p")
  ];
  if (containers.length === 0) return;

  for (const content of containers) {
    // 已处理过的不再处理
    if (content.querySelector(".acg-prose-linkrow")) continue;
    // 不处理含图片/代码块的段落（避免误伤正常文章内容）
    if (content.querySelector("img, pre, code")) continue;

    const allLinks = [...content.querySelectorAll<HTMLAnchorElement>("a")].filter((a) => Boolean(a.getAttribute("href")));
    if (allLinks.length === 0) continue;

    const autolinks = allLinks.filter((a) => a.classList.contains("acg-prose-autolink"));
    if (autolinks.length === 0) continue;

    const nonAutolinkLinks = allLinks.filter((a) => !a.classList.contains("acg-prose-autolink"));

    // 只在“所有链接基本指向同一个目的地”时聚合，避免误伤正常段落里的多链接内容
    const unique = new Map<string, string>(); // key -> href
    for (const a of allLinks) {
      const href = a.getAttribute("href") ?? "";
      const key = normalizeUrlForCompare(href);
      if (!key) continue;
      if (!unique.has(key)) unique.set(key, href);
    }

    if (unique.size !== 1) continue;
    const onlyKey = [...unique.keys()][0] ?? "";
    if (!onlyKey) continue;

    // 选择最终 href：优先用“标题链接”的 href（通常更干净），否则退回第一个出现的 href
    let href = [...unique.values()][0] ?? "";
    const bestTitleAnchor = nonAutolinkLinks
      .map((a) => ({
        href: a.getAttribute("href") ?? "",
        text: cleanLinkRowTitle((a.textContent ?? "").trim())
      }))
      .filter((it) => it.href && normalizeUrlForCompare(it.href) === onlyKey && it.text.length >= 6 && !looksLikeUrlText(it.text))
      .sort((a, b) => b.text.length - a.text.length)[0];
    if (bestTitleAnchor?.href) href = bestTitleAnchor.href;
    if (!href) continue;

    // 取标题：优先用“移除链接后剩余文本”
    const clone = content.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("a").forEach((a) => {
      a.remove();
    });
    let titleText = cleanLinkRowTitle((clone.textContent ?? "").trim());

    // 兜底：如果正文只剩很短的碎片，但存在“标题链接文本”，则用它
    if (!titleText || titleText.length < 6) {
      const cand = bestTitleAnchor?.text;
      if (cand) titleText = cand;
    }

    if (!titleText || titleText.length < 6) continue;

    const { host, path } = splitUrlForDisplay(href);

    const a = document.createElement("a");
    a.className = "acg-prose-linkrow";
    a.href = href;
    a.target = "_blank";
    a.rel = "noreferrer noopener";
    a.title = href;

    const titleEl = document.createElement("div");
    titleEl.className = "acg-prose-linkrow-title";
    titleEl.textContent = titleText;

    const metaEl = document.createElement("div");
    metaEl.className = "acg-prose-linkrow-meta";
    metaEl.textContent = path ? `${host} ${path}` : host;

    a.appendChild(titleEl);
    a.appendChild(metaEl);

    content.innerHTML = "";
    content.appendChild(a);
  }
}

function pruneProseArticleJunk(root: HTMLElement) {
  // 目标：更激进地剥离“非正文内容”（相关推荐/社媒/导航/纯链接/免责声明等），避免全文预览变成“链接堆 + 大图墙”。
  // 原则：宁可删多一点，也不要把页面壳/推荐区污染到正文里。
  if (root.dataset.acgProseKind !== "article") return;

  // 0) 兜底：内部占位符绝不允许泄漏到最终 UI
  root.innerHTML = stripInternalPlaceholdersFromHtml(root.innerHTML);

  const normalizeText = (s: string) => s.replace(/\s+/g, " ").trim();
  const isTrivialText = (s: string) => {
    const t = normalizeText(s);
    if (!t) return true;
    const compact = t.replace(/\s+/g, "");
    if (!compact) return true;
    if (/^[)\]】」）(（\[\[【「『"”'’《》<>.,，。:：;；!?！？·•、\-—–|]+$/.test(compact)) return true;
    return false;
  };

  const isJunkLabel = (s: string) => {
    const t = normalizeText(s).toLowerCase();
    if (!t) return false;
    // 常见“来源/引用/跳转提示”残留：只提供链接，不提供正文信息
    if (/^(?:source|via|reference|references|read more|open|original|link|links)[:：]?$/.test(t)) return true;
    if (/^(?:来源|來源|原文|引用元|参照|参考|參考|更多|查看原文|打开原文|查看|打开)[:：]?$/.test(t)) return true;
    if (/^(?:続きを読む|リンク|リンク先|参照元)[:：]?$/.test(t)) return true;
    return false;
  };

  const isSourceLikeText = (raw: string) => {
    const t = normalizeText(raw);
    if (!t) return false;
    const lower = t.toLowerCase();

    // “来源/原文/跳转”类提示（通常带链接，信息量低）
    if (/^(?:source|via|original|read more|open|link|links|credit|credits)[:：\s]/i.test(t)) return true;
    if (/^(?:image|photo)(?:\s+via|\s*:)/i.test(t)) return true;
    if (/^(?:来源|來源|原文|查看原文|打开原文|引用元|参照|参考|參考|出典)[:：\s]/.test(t)) return true;
    if (/^(?:出典|参照元|続きを読む|リンク)[:：\s]/.test(t)) return true;

    // 版权/署名类（短行）：更像页面壳残留
    if (/^©/.test(t) || lower.includes("copyright") || lower.includes("all rights reserved")) return true;
    return false;
  };

  const removeIfSourceLike = (container: HTMLElement) => {
    if (container.querySelector("img, pre, code")) return;
    const links = [...container.querySelectorAll<HTMLAnchorElement>("a[href]")];
    if (links.length === 0) return;
    const full = normalizeText(container.textContent ?? "");
    if (!full) return;
    // 太长的“引用/脚注”可能是正文的一部分，不动
    if (full.length > 280) return;
    if (isSourceLikeText(full)) container.remove();
  };

  const removeIfLinkOnly = (container: HTMLElement) => {
    if (container.querySelector("img, pre, code")) return;
    const links = [...container.querySelectorAll<HTMLAnchorElement>("a[href]")];
    if (links.length === 0) return;

    // 媒体白名单：正文里的“预告片/视频”链接即使是纯链接，也属于内容，不应当作噪音删除。
    const hasMediaLink = links.some((a) => {
      const href = (a.getAttribute("href") ?? "").trim();
      if (!href) return false;
      try {
        const u = new URL(href);
        const host = u.hostname.replace(/^www\./, "").toLowerCase();
        return (
          host.endsWith("youtube.com") ||
          host === "youtu.be" ||
          host.endsWith("vimeo.com") ||
          host === "player.vimeo.com" ||
          host.endsWith("nicovideo.jp") ||
          host.endsWith("nico.ms") ||
          host.endsWith("bilibili.com") ||
          host.endsWith("b23.tv") ||
          host.endsWith("twitch.tv")
        );
      } catch {
        return false;
      }
    });
    if (hasMediaLink) return;

    const clone = container.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("a").forEach((a) => a.remove());
    const rest = normalizeText(clone.textContent ?? "");

    if (isTrivialText(rest) || isJunkLabel(rest)) {
      container.remove();
      return;
    }

    const full = normalizeText(container.textContent ?? "");
    const aTextLen = links.reduce((sum, a) => sum + normalizeText(a.textContent ?? "").length, 0);
    const linkDensity = aTextLen / Math.max(1, full.length);

    // “几乎全是链接”的短段落：更像推荐/导航残留
    if (full.length <= 280 && links.length >= 1 && linkDensity >= 0.78) {
      container.remove();
      return;
    }

    // 只有自动 URL 卡片，且正文残留很短：直接删
    const nonAuto = links.filter((a) => !a.classList.contains("acg-prose-autolink") && !a.classList.contains("acg-prose-linkrow"));
    if (nonAuto.length === 0 && rest.length <= 18) {
      container.remove();
      return;
    }
  };

  // 1) 段落级：删除“纯链接/提示型”段落
  for (const p of [...root.querySelectorAll<HTMLElement>("p")]) {
    removeIfLinkOnly(p);
    removeIfSourceLike(p);
  }

  // 2) list item 级：删除“纯链接/提示型”条目（并清理空列表）
  for (const li of [...root.querySelectorAll<HTMLElement>("li")]) {
    const content = li.querySelector<HTMLElement>(":scope > .acg-prose-li-content") ?? li;
    removeIfLinkOnly(content);
    removeIfSourceLike(content);
    // 如果 content 被 remove 了，li 可能变空：一并处理
    if ((li.textContent ?? "").trim().length === 0 && li.querySelectorAll("img").length === 0) li.remove();
  }
  for (const list of [...root.querySelectorAll<HTMLElement>("ul, ol")]) {
    if (list.querySelectorAll(":scope > li").length === 0) list.remove();
  }

  // 2.5) 引用块：图片来源/版权/原文入口这类“短引用”直接剥离（避免把正文变成 credit 墙）
  for (const q of [...root.querySelectorAll<HTMLElement>("blockquote")]) {
    const text = normalizeText(q.textContent ?? "");
    if (!text) {
      q.remove();
      continue;
    }
    const links = q.querySelectorAll("a[href]").length;
    if (text.length <= 260 && (links >= 1 || /^©/.test(text)) && isSourceLikeText(text)) {
      q.remove();
    }
  }

  // 3) 块级：更激进剥离“相关推荐/分享/标签/排行”等链接密度块（即使它夹在正文中间）
  const noisyKeywords = [
    "related",
    "recommended",
    "recommend",
    "popular",
    "ranking",
    "archive",
    "archives",
    "subscribe",
    "newsletter",
    "follow",
    "share",
    "tag",
    "tags",
    "category",
    "categories",
    "sponsored",
    "advertisement",
    "read more",
    "関連記事",
    "関連",
    "おすすめ",
    "人気",
    "ランキング",
    "タグ",
    "カテゴリ",
    "シェア",
    "フォロー",
    "スポンサー",
    "広告",
    "続きを読む"
  ];

  const linkMetrics = (el: HTMLElement) => {
    const text = normalizeText(el.textContent ?? "");
    const textLen = text.length;
    const links = [...el.querySelectorAll<HTMLAnchorElement>("a[href]")];
    const aCount = links.length;
    const aTextLen = links.reduce((sum, a) => sum + normalizeText(a.textContent ?? "").length, 0);
    const pNodes = [...el.querySelectorAll<HTMLElement>("p")];
    const longP = pNodes.filter((p) => normalizeText(p.textContent ?? "").length >= 120).length;
    const liCount = el.querySelectorAll("li").length;
    const imgCount = el.querySelectorAll("img").length;
    const linkDensity = aTextLen / Math.max(1, textLen);
    const lower = text.toLowerCase();
    const keywordHit = noisyKeywords.some((k) => lower.includes(k.toLowerCase()));
    return { textLen, aCount, longP, liCount, imgCount, linkDensity, keywordHit };
  };

  const candidates = [...root.querySelectorAll<HTMLElement>("section, div, ul, ol, table, details")].reverse();
  for (const el of candidates) {
    if (el === root) continue;
    const m = linkMetrics(el);

    // 明显正文块：有多段长段落 => 不动
    if (m.longP >= 2) continue;

    const tag = el.tagName.toUpperCase();

    // 目录型/推荐型列表：li 多 + 链接密度高 + 无长段落
    if ((tag === "UL" || tag === "OL") && m.liCount >= 6 && m.linkDensity >= 0.6 && m.longP === 0) {
      el.remove();
      continue;
    }

    // 关键词命中 + 链接为主：剥离
    if (m.keywordHit && m.aCount >= 4 && m.linkDensity >= 0.35 && m.longP === 0 && m.textLen <= 2400) {
      el.remove();
      continue;
    }

    // 极端链接块：几乎全是链接，且没有图片/正文段落
    if (m.linkDensity >= 0.88 && m.aCount >= 4 && m.longP === 0 && m.imgCount === 0 && m.textLen <= 2200) {
      el.remove();
      continue;
    }
  }
}

function enhanceProseImageGalleries(root: HTMLElement) {
  // 目标：全文预览中常见“多张图片链接/引用堆在一起”，会导致页面被大图淹没、排版极乱。
  // 策略：把连续的“纯图片段落”或“纯图片列表”收敛成一个网格画廊（缩略图），点击仍可打开原图/原页。

  const isIgnorableJunkText = (s: string) => {
    const t = s.replace(/\s+/g, "").trim();
    if (!t) return true;
    // 常见残留：括号/引号/全角标点
    if (/^[)\]】」）"”'’]+$/.test(t)) return true;
    if (/^[（(\[【「『]+$/.test(t)) return true;
    if (/^[,，.。:：;；!?！？]+$/.test(t)) return true;
    // 常见“图片提示/放大提示/来源提示”（短句且信息量低）：允许忽略，便于把图片序列收敛成画廊
    if (t.length <= 24) {
      if (/^(?:画像|写真|圖像|图片|圖片|image|photo)(?:[:：].*)?$/i.test(t)) return true;
      if (/(クリック|タップ).*(拡大|拡大表示)/.test(t)) return true;
      if (/画像.*(クリック|タップ).*(拡大|拡大表示)/.test(t)) return true;
      if (/点击.*(查看|打开|放大).*(原图|原圖|大图|大圖|图片|圖片)/.test(t)) return true;
      if (/點擊.*(查看|打開|放大).*(原圖|大圖|圖片)/.test(t)) return true;
      if (/^source[:：]/i.test(t)) return true;
      if (/^via[:：]/i.test(t)) return true;
    }
    return false;
  };

  const isIgnorableParagraph = (p: HTMLElement) => {
    // 仅当段落不含可见结构（链接/图片/代码），且文本为“噪音/提示/空白”时，才移除
    if (p.querySelector("img, a, pre, code")) return false;
    const t = (p.textContent ?? "").trim();
    if (!t) return true;
    return isIgnorableJunkText(t);
  };

  const extractImageOnlyLink = (container: HTMLElement): HTMLAnchorElement | null => {
    const a = container.querySelector<HTMLAnchorElement>(":scope > a.acg-prose-img-link");
    if (!a) return null;

    for (const node of [...container.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent ?? "";
        if (t.trim() === "") continue;
        if (isIgnorableJunkText(t)) {
          node.remove();
          continue;
        }
        return null;
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node === a) continue;
        return null;
      }
    }

    return a;
  };

  const mountGallery = (anchors: HTMLAnchorElement[], beforeEl: Element) => {
    if (anchors.length < 2) return false;
    const gallery = document.createElement("div");
    gallery.className = "acg-prose-gallery";
    for (const a of anchors) {
      a.classList.add("acg-prose-gallery-item");
      gallery.appendChild(a);
    }
    beforeEl.before(gallery);
    return true;
  };

  // 1) 连续的“纯图片段落” -> 画廊
  const paras = [...root.querySelectorAll<HTMLElement>("p")];
  let run: { p: HTMLElement; a: HTMLAnchorElement }[] = [];
  const flushRun = () => {
    if (run.length < 2) {
      run = [];
      return;
    }
    const anchors = run.map((x) => x.a);
    const first = run[0]?.p;
    if (!first) {
      run = [];
      return;
    }
    const ok = mountGallery(anchors, first);
    if (ok) {
      for (const item of run) item.p.remove();
    }
    run = [];
  };

  for (const p of paras) {
    if (isIgnorableParagraph(p)) {
      // 这种段落常见于“点击放大/图片来源/空白占位”，删除后可让图片序列连续，从而被画廊收敛。
      p.remove();
      continue;
    }

    const a = extractImageOnlyLink(p);
    if (a) {
      run.push({ p, a });
      continue;
    }
    flushRun();
  }
  flushRun();

  // 2) 纯图片列表（常见于“图片页 URL 列表”）-> 画廊
  const lists = [...root.querySelectorAll<HTMLElement>("ul, ol")];
  for (const list of lists) {
    const li = [...list.querySelectorAll<HTMLElement>(":scope > li")];
    if (li.length < 2) continue;

    const anchors: HTMLAnchorElement[] = [];
    let ok = true;
    for (const item of li) {
      const content = item.querySelector<HTMLElement>(":scope > .acg-prose-li-content") ?? item;
      const a = extractImageOnlyLink(content);
      if (!a) {
        ok = false;
        break;
      }
      anchors.push(a);
    }
    if (!ok || anchors.length < 2) continue;

    const before = list;
    const mounted = mountGallery(anchors, before);
    if (!mounted) continue;
    list.remove();
  }
}

type FullTextSource = "jina" | "allorigins" | "codetabs";
type FullTextLoadResult = {
  md: string;
  source: FullTextSource;
  status?: number;
};

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers: { accept: "text/plain,*/*" } });
  } finally {
    window.clearTimeout(timer);
  }
}

function toAbsoluteUrlMaybe(raw: string, baseUrl: string): string | null {
  try {
    const u = new URL(raw, baseUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function inlineHtmlToMarkdown(node: Node, baseUrl: string): string {
  const t = (node.textContent ?? "").replace(/\s+/g, " ");

  if (node.nodeType === Node.TEXT_NODE) return t;
  if (node.nodeType !== Node.ELEMENT_NODE) return t;

  const el = node as HTMLElement;
  const tag = el.tagName.toUpperCase();

  if (tag === "BR") return "\n";

  if (tag === "A") {
    const label = (el.textContent ?? "").trim().replace(/\s+/g, " ");
    const hrefRaw = el.getAttribute("href") ?? "";
    const hrefAbs = toAbsoluteUrlMaybe(hrefRaw, baseUrl);
    if (!hrefAbs) return label || hrefRaw;
    if (!label) return hrefAbs;
    return `[${label}](${hrefAbs})`;
  }

  if (tag === "IMG") {
    const alt = (el.getAttribute("alt") ?? "").trim();
    const pickSrc = (): string => {
      const keys = ["src", "data-src", "data-original", "data-lazy-src", "data-srcset", "srcset"];
      const isPlaceholder = (raw: string) => {
        const v = raw.trim();
        if (!v) return true;
        const lower = v.toLowerCase();
        if (lower.startsWith("data:image/gif")) return true;
        if (lower === "about:blank") return true;
        // 常见懒加载占位：spacer/blank/transparent 之类的小 gif
        if (/(?:^|\/)(?:spacer|blank|pixel|transparent)\.gif(?:$|[?#])/.test(lower)) return true;
        return false;
      };

      let fallback = "";
      for (const k of keys) {
        const v = (el.getAttribute(k) ?? "").trim();
        if (!v) continue;
        if (k === "src" && isPlaceholder(v)) {
          // 记录一下，若完全找不到真实资源，才退回占位（避免“空白大图”污染排版）
          fallback = v;
          continue;
        }
        // srcset: 取最后一个（通常是最大尺寸），然后截掉 `640w/2x` 这类描述符
        if (k.endsWith("srcset") && v.includes(",")) {
          const parts = v
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
          const last = parts[parts.length - 1] ?? "";
          const url = last.split(/\s+/)[0] ?? "";
          if (url) return url;
        }
        if (k.endsWith("srcset")) {
          const url = v.split(/\s+/)[0] ?? "";
          if (url) return url;
        }
        return v;
      }
      return fallback;
    };

    const srcRaw = pickSrc();
    const srcAbs = toAbsoluteUrlMaybe(srcRaw, baseUrl);
    if (!srcAbs) return alt ? `![${alt}]` : "";
    return `![${alt}](${srcAbs})`;
  }

  if (tag === "CODE") {
    const code = (el.textContent ?? "").trim();
    if (!code) return "";
    return `\`${code.replace(/`/g, "")}\``;
  }

  if (tag === "EM" || tag === "I") {
    const inner = [...el.childNodes].map((c) => inlineHtmlToMarkdown(c, baseUrl)).join("");
    const s = inner.trim();
    return s ? `_${s}_` : "";
  }

  if (tag === "STRONG" || tag === "B") {
    const inner = [...el.childNodes].map((c) => inlineHtmlToMarkdown(c, baseUrl)).join("");
    const s = inner.trim();
    return s ? `**${s}**` : "";
  }

  return [...el.childNodes].map((c) => inlineHtmlToMarkdown(c, baseUrl)).join("");
}

function htmlElementToMarkdown(root: Element, baseUrl: string): string {
  const blocks: string[] = [];
  let host = "";
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    // ignore
  }

  const isLowValueCaption = (raw: string): boolean => {
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t) return true;
    const lower = t.toLowerCase();

    // 典型“版权/来源/社媒 credit”类：信息价值低，且极易把正文污染成链接堆
    if (/^(?:image|photo)(?:\s+via|\s*:)/i.test(t)) return true;
    if (/^(?:source|via|credit|credits)[:：\s]/i.test(t)) return true;
    if (/^(?:来源|來源|原文|引用元|参照|参考|參考|出典)[:：\s]/.test(t)) return true;
    if (/^(?:画像|写真|出典|参照元|リンク)[:：\s]/.test(t)) return true;
    if (t.startsWith("©") || lower.includes("copyright") || lower.includes("all rights reserved")) return true;

    // 纯链接/几乎是链接：直接丢弃（正文已提供“打开原文”入口）
    if (/^https?:\/\//i.test(t)) return true;
    if (/^\[[^\]]+\]\(https?:\/\/[^)]+\)$/.test(t)) return true;

    // 太短：通常是无意义标注
    if (t.length <= 8) return true;
    return false;
  };

  const push = (block: string) => {
    const b = block.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (b) blocks.push(b);
  };

  const walk = (node: Element) => {
    const children = [...node.children] as HTMLElement[];
    for (const child of children) {
      const tag = child.tagName.toUpperCase();

      // block images：有些站点（例如 natalie）会把正文图放在 div/a 里而不是 figure/p，
      // 如果不显式处理 IMG，会导致全文预览“看起来缺图”。
      if (tag === "IMG") {
        const md = inlineHtmlToMarkdown(child, baseUrl).trim();
        if (md) push(md);
        continue;
      }

      if (/^H[1-6]$/.test(tag)) {
        const level = Math.min(6, Math.max(1, Number(tag.slice(1))));
        const text = [...child.childNodes].map((c) => inlineHtmlToMarkdown(c, baseUrl)).join("").trim();
        if (text) push(`${"#".repeat(level)} ${text}`);
        continue;
      }

      if (tag === "FIGURE") {
        const parts: string[] = [];
        const imgs = [...child.querySelectorAll("img")];
        for (const img of imgs) {
          const md = inlineHtmlToMarkdown(img, baseUrl).trim();
          if (md) parts.push(md);
        }

        // figcaption 往往是“图片来源/版权声明/站点壳 credit”，对阅读价值不大，且常产生 `]]`/纯链接/杂质。
        // 更激进：对 ANN 直接忽略；其他站点只保留“看起来像正文描述”的 caption，并用轻量 italic 呈现。
        if (!host.endsWith("animenewsnetwork.com")) {
          const captionEls = [...child.querySelectorAll("figcaption")];
          const captions = captionEls
            .map((cap) => [...cap.childNodes].map((c) => inlineHtmlToMarkdown(c, baseUrl)).join("").replace(/\s+/g, " ").trim())
            .map((s) => s.trim())
            .filter(Boolean)
            .filter((s) => !isLowValueCaption(s))
            .slice(0, 2);
          const caption = captions.join(" / ").trim();
          if (caption) parts.push(`_${caption}_`);
        }

        if (parts.length > 0) push(parts.join("\n\n"));
        continue;
      }

      if (tag === "P") {
        const text = [...child.childNodes].map((c) => inlineHtmlToMarkdown(c, baseUrl)).join("");
        push(text);
        continue;
      }

      if (tag === "BLOCKQUOTE") {
        const text = (child.textContent ?? "").replace(/\r\n/g, "\n").trim();
        if (text) {
          const quoted = text
            .split("\n")
            .map((l) => `> ${l.trim()}`)
            .join("\n");
          push(quoted);
        }
        continue;
      }

      if (tag === "PRE") {
        const text = (child.textContent ?? "").replace(/\r\n/g, "\n").trim();
        if (text) push(`\`\`\`\n${text}\n\`\`\``);
        continue;
      }

      if (tag === "UL") {
        const items = [...child.querySelectorAll(":scope > li")];
        const lines = items
          .map((li) => {
            const text = [...li.childNodes].map((c) => inlineHtmlToMarkdown(c, baseUrl)).join("").replace(/\s+/g, " ").trim();
            return text ? `- ${text}` : "";
          })
          .filter(Boolean);
        push(lines.join("\n"));
        continue;
      }

      if (tag === "OL") {
        const items = [...child.querySelectorAll(":scope > li")];
        let idx = 0;
        const lines = items
          .map((li) => {
            idx += 1;
            const text = [...li.childNodes].map((c) => inlineHtmlToMarkdown(c, baseUrl)).join("").replace(/\s+/g, " ").trim();
            return text ? `${idx}. ${text}` : "";
          })
          .filter(Boolean);
        push(lines.join("\n"));
        continue;
      }

      // 默认：继续深入（略过无意义容器）
      walk(child);
    }
  };

  walk(root);
  return blocks.join("\n\n").trim();
}

function pickMainElement(doc: Document, baseUrl: string): HTMLElement {
  let host = "";
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    // ignore
  }

  const fallbackBody = doc.body;

  // 站点特化：ナタリー（natalie.mu）正文结构稳定：`.NA_article_body` 是最干净的正文容器。
  // 如果误选整个 article，会把“标签/相关人物/推荐”一并吞进来，导致全文预览再次变成“目录 + 图墙 + 链接堆”。
  if (host.endsWith("natalie.mu")) {
    const preferredSelectors = ["article.NA_article .NA_article_body", ".NA_article_body", "article.NA_article"];
    for (const sel of preferredSelectors) {
      const el = doc.querySelector(sel);
      if (!el || !(el instanceof HTMLElement)) continue;
      const textLen = (el.textContent ?? "").replace(/\s+/g, " ").trim().length;
      const pCount = el.querySelectorAll("p").length;
      if (sel.includes("_body")) {
        if (textLen >= 120 || pCount >= 1) return el;
        continue;
      }
      if (textLen >= 420 || pCount >= 2) return el;
    }
  }

  // 站点特化：ANN（AnimeNewsNetwork）有很稳定的主容器命名
  // 说明：我们不能让“全页 body”参与评分，否则极易把导航/侧栏/页脚一起吞进正文（导致全文预览变成一坨目录/链接）。
  if (host.endsWith("animenewsnetwork.com")) {
    const preferredSelectors = [
      "#content-zone .meat",
      "#content-zone .KonaBody",
      "#content-zone",
      ".KonaBody",
      ".meat",
      "#maincontent .KonaBody",
      "#maincontent"
    ];
    for (const sel of preferredSelectors) {
      const el = doc.querySelector(sel);
      if (!el || !(el instanceof HTMLElement)) continue;
      const textLen = (el.textContent ?? "").replace(/\s+/g, " ").trim().length;
      const pCount = el.querySelectorAll("p").length;
      const isMeat = sel.includes(".meat");
      if (isMeat) {
        if (textLen >= 120 || pCount >= 1) return el;
        continue;
      }
      if (textLen >= 420 || pCount >= 2) return el;
    }
  }

  // 站点特化：Inside / アニメ！アニメ！（IID 系）正文容器命名稳定
  if (host.endsWith("inside-games.jp") || host.endsWith("animeanime.jp")) {
    const preferredSelectors = ["article.arti-body", ".arti-body"];
    for (const sel of preferredSelectors) {
      const el = doc.querySelector(sel);
      if (!el || !(el instanceof HTMLElement)) continue;
      const textLen = (el.textContent ?? "").replace(/\s+/g, " ").trim().length;
      const pCount = el.querySelectorAll("p").length;
      if (textLen >= 260 || pCount >= 2) return el;
    }
  }

  const candidates: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  const push = (el: Element | null) => {
    if (!el || !(el instanceof HTMLElement)) return;
    if (seen.has(el)) return;
    seen.add(el);
    candidates.push(el);
  };

  // 通用：常见文章容器
  push(doc.querySelector("article"));
  push(doc.querySelector("[itemprop='articleBody']"));
  push(doc.querySelector(".article-body"));
  push(doc.querySelector(".article__body"));
  push(doc.querySelector(".entry-content"));
  push(doc.querySelector(".post-content"));
  push(doc.querySelector(".post-body"));
  push(doc.querySelector(".content__body"));
  push(doc.querySelector(".c-article__body"));

  // 通用：常见页面容器
  push(doc.querySelector("main"));
  push(doc.querySelector("#content"));
  push(doc.querySelector("#main"));
  push(doc.querySelector(".content"));

  // 关键：不要让 body 参与评分（几乎总是“更长”），只作为最后兜底。
  let best: HTMLElement | null = null;
  let bestScore = -Infinity;

  for (const el of candidates) {
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    const textLen = text.length;

    const anchors = [...el.querySelectorAll("a")];
    const aCount = anchors.length;
    const aTextLen = anchors.reduce((sum, a) => sum + ((a.textContent ?? "").trim().length || 0), 0);
    const pCount = el.querySelectorAll("p").length;
    const liCount = el.querySelectorAll("li").length;
    const hCount = el.querySelectorAll("h1,h2,h3,h4").length;
    const imgCount = el.querySelectorAll("img").length;

    // 过滤“太短/太空”的容器，避免误选导航残片
    if (textLen < 120 && pCount < 2 && liCount < 6 && imgCount < 1) continue;

    const linkDensity = aTextLen / Math.max(1, textLen);

    // 评分：偏向“更像正文”的元素（段落/标题/少量图片），强力惩罚“链接密度过高”的导航页结构
    let score = 0;
    score += textLen;
    score += pCount * 180;
    score += Math.min(48, liCount) * 18;
    score += Math.min(12, hCount) * 80;
    score += Math.min(10, imgCount) * 55;
    score -= aTextLen * 0.55;
    score -= aCount * 10;
    if (linkDensity > 0.55) score -= (linkDensity - 0.55) * textLen * 1.6;
    if (textLen < 260) score -= 260 - textLen;

    if (score > bestScore) {
      best = el;
      bestScore = score;
    }
  }

  // 如果评分体系没有命中，按候选优先级返回（仍避免直接回退到 body）
  return best ?? candidates[0] ?? fallbackBody;
}

function cleanupHtmlDocument(doc: Document, baseUrl: string) {
  // 说明：全文抽取的目标不是“复刻网页”，而是拿到“可读正文”。
  // 但某些站点会把“正文关键媒体（如 YouTube 预告片）”放在 iframe 里；
  // 如果我们直接删除 iframe，会导致正文信息缺失。
  // 处理：把可信媒体 iframe 转成“普通链接”后再统一清壳。

  const pickIframeSrc = (iframe: HTMLIFrameElement): string => {
    const keys = ["src", "data-src", "data-lazy-src", "data-original"];
    for (const k of keys) {
      const v = (iframe.getAttribute(k) ?? "").trim();
      if (v) return v;
    }
    return "";
  };

  const normalizeMediaHref = (hrefAbs: string): { href: string; label: string } | null => {
    try {
      const u = new URL(hrefAbs);
      const host = u.hostname.replace(/^www\./, "").toLowerCase();
      const path = u.pathname || "/";

      // YouTube: embed -> watch
      if (host.endsWith("youtube.com") || host === "youtu.be") {
        let id = "";
        if (host === "youtu.be") {
          id = (path || "/").replace(/^\/+/, "").split("/")[0] ?? "";
        } else if (path.startsWith("/embed/")) {
          id = path.slice("/embed/".length).split("/")[0] ?? "";
        } else {
          id = u.searchParams.get("v") ?? "";
        }
        if (!id) return { href: u.toString(), label: "Watch video (YouTube)" };
        return { href: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`, label: "Watch video (YouTube)" };
      }

      // Vimeo: player -> canonical
      if (host === "player.vimeo.com" && path.startsWith("/video/")) {
        const id = path.slice("/video/".length).split("/")[0] ?? "";
        if (id) return { href: `https://vimeo.com/${encodeURIComponent(id)}`, label: "Watch video (Vimeo)" };
        return { href: u.toString(), label: "Watch video (Vimeo)" };
      }
      if (host.endsWith("vimeo.com")) return { href: u.toString(), label: "Watch video (Vimeo)" };

      // Nico / Bilibili / Twitch 等（常见 ACG 来源）
      if (host.endsWith("nicovideo.jp") || host.endsWith("nico.ms")) return { href: u.toString(), label: "Watch video (Niconico)" };
      if (host.endsWith("bilibili.com") || host.endsWith("b23.tv")) return { href: u.toString(), label: "Watch video (Bilibili)" };
      if (host.endsWith("twitch.tv")) return { href: u.toString(), label: "Watch video (Twitch)" };

      return null;
    } catch {
      return null;
    }
  };

  // 先把可信媒体 iframe 变成链接（保留信息，但避免 iframe 本身）
  const iframes = [...doc.querySelectorAll<HTMLIFrameElement>("iframe")];
  for (const iframe of iframes) {
    const srcRaw = pickIframeSrc(iframe);
    const abs = srcRaw ? toAbsoluteUrlMaybe(srcRaw, baseUrl) : null;
    if (!abs) continue;
    const media = normalizeMediaHref(abs);
    if (!media) continue;

    const a = doc.createElement("a");
    a.setAttribute("href", media.href);
    a.textContent = media.label;
    // 避免把 <p> 嵌进 <p>（某些站点会把 iframe 放在段落内，嵌套会导致抽取/排版变形）
    const parentTag = (iframe.parentElement?.tagName ?? "").toUpperCase();
    if (parentTag === "P") {
      iframe.replaceWith(a);
    } else {
      const p = doc.createElement("p");
      p.appendChild(a);
      iframe.replaceWith(p);
    }
  }

  // 删除明显的“壳/导航/脚本”，减少噪音与 XSS 面
  const selectors = [
    "script",
    "style",
    "noscript",
    "iframe",
    "svg",
    "canvas",
    "nav",
    "header",
    "footer",
    "aside",
    "form",
    "[role='navigation']",
    "[role='banner']",
    "[role='contentinfo']",
    "[aria-hidden='true']",
    // 常见“分享/评论/相关推荐/广告”等噪音块（尽量用“精确类名”，避免误删正文容器）
    ".share",
    ".shares",
    ".social",
    ".sns",
    ".comment",
    ".comments",
    ".related",
    ".recommend",
    ".recommended",
    ".newsletter",
    ".subscribe",
    ".breadcrumb",
    ".breadcrumbs",
    ".pagination",
    ".pager",
    ".adsbygoogle",
    ".advertisement",
    ".ad",
    ".ads",
    // ANN 常见噪音盒子（其脚本会尝试删除；我们在去掉 script 后手动清掉）
    ".box[data-topics]"
  ];
  doc.querySelectorAll(selectors.join(",")).forEach((el) => el.remove());
}

function pruneMainElement(main: HTMLElement, baseUrl: string) {
  let host = "";
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    // ignore
  }

  const hardCutAt = (sentinel: Element | null) => {
    if (!sentinel) return;
    const parent = sentinel.parentElement;
    if (!parent) {
      sentinel.remove();
      return;
    }
    let cur: Element | null = sentinel;
    while (cur) {
      const next: Element | null = cur.nextElementSibling;
      cur.remove();
      cur = next;
    }
    // 如果 sentinel 父节点被删空，也顺带移除（避免残留空壳影响抽取）
    if (parent !== main && parent.children.length === 0 && (parent.textContent ?? "").trim().length === 0) {
      parent.remove();
    }
  };

  // 0) 站点特化（先截断再删除）：某些站点会把“文章结束后的讨论/导航/页脚”塞在主容器内部。
  // 如果不先截断，后续的通用去噪/链接密度剪枝仍可能遗漏，导致正文尾部出现大量杂质。
  if (host.endsWith("animenewsnetwork.com")) {
    // ANN：文章正文结束点通常在 “discuss this in the forum / social-bookmarks / footer” 附近
    hardCutAt(main.querySelector("#social-bookmarks"));
    hardCutAt(main.querySelector("#footer"));

    // 讨论入口：直接把其所在的小容器移除（避免遗留 `|` 或孤立链接）
    const discussAnchors = [...main.querySelectorAll<HTMLAnchorElement>("a[href^='/cms/discuss/'], a[href*='/cms/discuss/']")];
    for (const a of discussAnchors) {
      const container = (a.closest("div, p, li, section") as HTMLElement | null) ?? a;
      if (container && container !== main) container.remove();
      else a.remove();
    }
  }

  if (host.endsWith("inside-games.jp") || host.endsWith("animeanime.jp")) {
    // 这两站的页脚/侧栏常作为普通 div/section 插在主容器里（不是 <footer>），必须硬截断。
    hardCutAt(main.querySelector(".footer-common-link"));
    hardCutAt(main.querySelector(".thm-footer"));
    hardCutAt(main.querySelector(".footer-nav"));
    hardCutAt(main.querySelector(".footer-sitemap"));
  }

  if (host.endsWith("natalie.mu")) {
    // ナタリー：正文后会拼接“タグ / 関連人物 / 推荐卡片”等大块内容（含大量缩略图与链接）
    // 如果主容器不是 `.NA_article_body`，这里必须硬截断，避免全文预览变成“图墙”。
    hardCutAt(main.querySelector(".NA_article_tag"));
    // 正文中部/尾部的“関連記事”也属于壳内容
    const embeds = [...main.querySelectorAll<HTMLElement>(".NA_article_embed_article")];
    for (const el of embeds) el.remove();
  }

  // 1) 站点特化：优先移除“已知非正文”的块（比纯 heuristics 更稳）
  const siteSelectors: string[] = [];
  if (host.endsWith("animenewsnetwork.com")) {
    siteSelectors.push(
      "instaread-player",
      "[data-user-preferences-action-open]",
      "#content-preferences",
      "#social-bookmarks",
      "#footer",
      ".box[data-topics]"
    );
  }
  if (host.endsWith("inside-games.jp") || host.endsWith("animeanime.jp")) {
    // 这两站常见“购物导流/社媒嵌入”会把正文污染成广告+链接堆
    siteSelectors.push(
      // 顶部“推荐/导流”列表（正文无关）
      ".pickup-text-list",
      ".main-pickup",
      ".main-ranking",
      "#_popIn_recommend",
      ".af_box",
      ".af_list",
      "[class^='af_']",
      "[class*=' af_']",
      "figure.ctms-editor-twitter",
      ".ctms-editor-twitter",
      "blockquote.twitter-tweet",
      ".twitter-tweet",
      "figure.ctms-editor-instagram",
      ".instagram-media",
      // 列表/侧栏/推荐/分享：属于页面壳内容
      ".recommended-list",
      ".recommended-ttl",
      ".share-block",
      ".sidebox",
      "article.pickup-content",
      "article.feature-content",
      "article.ranking-content",
      "article.side-content"
    );
  }
  if (host.endsWith("natalie.mu")) {
    siteSelectors.push(
      ".NA_article_embed_article",
      ".NA_article_tag",
      ".NA_article_img_link",
      ".NA_article_data",
      ".NA_article_score",
      ".NA_article_score-comment"
    );
  }

  // 2) 通用去噪：正文内部依然可能夹带“相关推荐/分享/面包屑/订阅”等块
  const genericSelectors = [
    "nav",
    "header",
    "footer",
    "aside",
    ".share",
    ".shares",
    ".social",
    ".sns",
    ".comment",
    ".comments",
    ".related",
    ".recommend",
    ".recommended",
    ".newsletter",
    ".subscribe",
    ".breadcrumb",
    ".breadcrumbs",
    ".pagination",
    ".pager",
    ".ad",
    ".ads",
    ".adsbygoogle",
    ".advertisement",
    // 更激进：一些站点用 af_* 做导购模块，不一定叫 ad/ads
    ".af_box",
    ".af_list"
  ];

  const mergedSelectors = [...siteSelectors, ...genericSelectors];
  if (mergedSelectors.length > 0) {
    main.querySelectorAll(mergedSelectors.join(",")).forEach((el) => el.remove());
  }

  // 3) 链接密度剪枝：把“几乎全是链接”的导航块/站点目录从正文里剥离
  // 目标：减少“杂七杂八全进来”的情况；策略尽量保守，避免误删正文段落。
  const noisyKeywords = [
    "related",
    "recommended",
    "recommend",
    "popular",
    "ranking",
    "archive",
    "archives",
    "newsletter",
    "subscribe",
    "follow",
    "share",
    "tag",
    "tags",
    "category",
    "categories",
    "関連記事",
    "関連",
    "おすすめ",
    "人気",
    "ランキング",
    "タグ",
    "カテゴリ",
    "シェア"
  ];

  const normalizeText = (s: string) => s.replace(/\s+/g, " ").trim();
  const linkMetrics = (el: HTMLElement) => {
    const text = normalizeText(el.textContent ?? "");
    const textLen = text.length;
    const links = [...el.querySelectorAll<HTMLAnchorElement>("a")];
    const aCount = links.length;
    const aTextLen = links.reduce((sum, a) => sum + normalizeText(a.textContent ?? "").length, 0);
    const pCount = el.querySelectorAll("p").length;
    const liCount = el.querySelectorAll("li").length;
    const imgCount = el.querySelectorAll("img").length;
    const linkDensity = aTextLen / Math.max(1, textLen);
    const lower = text.toLowerCase();
    const keywordHit = noisyKeywords.some((k) => lower.includes(k.toLowerCase()));
    return { text, textLen, aCount, aTextLen, pCount, liCount, imgCount, linkDensity, keywordHit };
  };

  const candidates = [...main.querySelectorAll<HTMLElement>("section, nav, aside, div, ul, ol, table, details")].reverse();
  for (const el of candidates) {
    if (el === main) continue;

    const tag = el.tagName.toUpperCase();
    if (tag === "P") continue;
    if (tag === "H1" || tag === "H2" || tag === "H3" || tag === "H4" || tag === "H5" || tag === "H6") continue;

    const m = linkMetrics(el);

    // 极端链接块：短文本 + 高链接密度 + 几乎没有段落/图片 => 直接移除
    if (m.textLen <= 260 && m.linkDensity >= 0.72 && m.pCount <= 0 && m.imgCount <= 0 && m.aCount >= 6) {
      el.remove();
      continue;
    }

    // 更激进：标签/目录/推荐常是“少量文本 + 一堆链接”，li 不一定很多
    if ((tag === "UL" || tag === "OL") && m.liCount >= 4 && m.linkDensity >= 0.74 && m.pCount <= 0 && m.imgCount <= 0 && m.textLen <= 420) {
      el.remove();
      continue;
    }

    // 更激进：如果一个块几乎全是链接，并且没有明显正文段落，就当作“导航/推荐”剥离
    if (m.linkDensity >= 0.82 && m.aCount >= 4 && m.pCount <= 1 && m.imgCount <= 0 && m.textLen <= 1800) {
      el.remove();
      continue;
    }

    // 目录型列表：li 多 + 链接多 + 正文段落少 => 移除
    if ((tag === "UL" || tag === "OL") && m.liCount >= 10 && m.linkDensity >= 0.62 && m.pCount <= 1 && m.imgCount <= 0) {
      el.remove();
      continue;
    }

    // 关键词命中：像“相关推荐/排行/标签/分享”等，又是链接为主的块 => 移除
    if (m.keywordHit && m.aCount >= 6 && m.linkDensity >= 0.42 && m.pCount <= 2 && m.textLen <= 2200) {
      el.remove();
      continue;
    }
  }
}

async function loadFullTextViaJina(params: { url: string; timeoutMs: number }): Promise<FullTextLoadResult> {
  const { url, timeoutMs } = params;
  const readerUrl = `https://r.jina.ai/${url}`;
  const res = await fetchWithTimeout(readerUrl, timeoutMs);
  if (!res.ok) return { md: "", source: "jina", status: res.status };
  const text = await res.text();
  const md = parseJinaMarkdown(text);
  return { md, source: "jina", status: res.status };
}

async function loadFullTextViaAllOrigins(params: { url: string; timeoutMs: number }): Promise<FullTextLoadResult> {
  const { url, timeoutMs } = params;
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  const res = await fetchWithTimeout(proxyUrl, timeoutMs);
  if (!res.ok) return { md: "", source: "allorigins", status: res.status };
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  cleanupHtmlDocument(doc, url);
  const main = pickMainElement(doc, url);
  pruneMainElement(main, url);
  const md = htmlElementToMarkdown(main, url);
  return { md, source: "allorigins", status: res.status };
}

async function loadFullTextViaCodeTabs(params: { url: string; timeoutMs: number }): Promise<FullTextLoadResult> {
  const { url, timeoutMs } = params;
  const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
  const res = await fetchWithTimeout(proxyUrl, timeoutMs);
  if (!res.ok) return { md: "", source: "codetabs", status: res.status };
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  cleanupHtmlDocument(doc, url);
  const main = pickMainElement(doc, url);
  pruneMainElement(main, url);
  const md = htmlElementToMarkdown(main, url);
  return { md, source: "codetabs", status: res.status };
}

function isProbablyIndexUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = (u.pathname || "/").toLowerCase();
    if (path === "/" || path === "") return true;
    if (path.endsWith("/archive") || path.includes("/archive/")) return true;
    if (/^\/(news|interest|feature|review|convention|column|press-release|newsfeed)\/?$/.test(path)) return true;
    return false;
  } catch {
    return false;
  }
}

function looksLikeIndexMarkdown(md: string): boolean {
  const text = md.replace(/\r\n/g, "\n").trim();
  if (!text) return false;

  const lower = text.toLowerCase();
  const strongSignals = [
    "chronological archives",
    "alphabetical archives",
    "time archives",
    "按字母顺序排列的档案",
    "时间档案"
  ];
  if (strongSignals.some((s) => lower.includes(s.toLowerCase()))) return true;

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 18) return false;

  // 列表行：有些站点会输出 `*04:00...`（无空格），因此这里允许 `\s*`
  const listLine = (l: string) => /^(\*|-)\s*\S+/.test(l) || /^\d+\.\s*\S+/.test(l);
  const headingLine = (l: string) => /^#{2,6}\s+/.test(l);
  const timeLine = (l: string) => /^(\*|-)?\s*\d{1,2}:\d{2}\b/.test(l);
  const dateLine = (l: string) =>
    /^(\*|-)?\s*\d{1,2}\s*月\s*\d{1,2}\s*日\b/.test(l) ||
    /^(\*|-)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(l);

  let listCount = 0;
  let timeCount = 0;
  let dateCount = 0;
  let paragraphCount = 0;

  for (const l of lines) {
    if (timeLine(l)) timeCount += 1;
    if (dateLine(l)) dateCount += 1;
    if (listLine(l)) {
      listCount += 1;
      continue;
    }
    if (headingLine(l)) continue;
    if (l.length >= 80) paragraphCount += 1;
  }

  const ratio = listCount / Math.max(1, lines.length);
  if (ratio > 0.62 && (timeCount >= 8 || dateCount >= 8) && paragraphCount <= 4) return true;
  if (ratio > 0.75 && paragraphCount <= 8) return true;
  return false;
}

function shouldRejectFullTextMarkdown(md: string, url: string): boolean {
  const normalized = normalizeFullTextMarkdown(md);
  if (!normalized) return true;

  // 兜底：内部占位符不应暴露给用户，出现即视为异常
  if (/@@ACG/i.test(normalized) || /＠＠ACG/i.test(normalized)) return true;

  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    // ignore
  }

  const lower = normalized.toLowerCase();
  const blockedSignals = [
    "attention required",
    "cloudflare",
    "enable javascript",
    "enable cookies",
    "captcha",
    "access denied",
    "temporarily unavailable",
    "service unavailable",
    "are you a human",
    "robot check"
  ];
  if (blockedSignals.some((s) => lower.includes(s))) return true;

  // ANN 常见“懒加载占位图”污染：会导致全文预览出现空白大图（/img/spacer.gif）。
  // 这类内容属于抽取质量问题，直接判失败以触发重新提取（或换源）。
  if (host.endsWith("animenewsnetwork.com")) {
    if (lower.includes("/img/spacer.gif") && /!\[[^\]]*\]\([^)]*spacer\.gif[^)]*\)/i.test(normalized)) return true;
  }

  // 目录/导航 dump：对“文章页”直接拒绝
  if (!isProbablyIndexUrl(url) && looksLikeIndexMarkdown(normalized)) return true;

  return false;
}

async function loadFullTextMarkdown(params: { url: string; timeoutMs: number }): Promise<FullTextLoadResult> {
  const { url, timeoutMs } = params;

  // 1) 首选：Jina Reader（质量高，输出 Markdown）
  let primary: FullTextLoadResult | null = null;
  try {
    primary = await loadFullTextViaJina({ url, timeoutMs });
    if (primary.md) {
      // 兜底：Jina 偶发会返回“站点目录/导航 dump”或“拦截页文本”，这种内容必须判失败走后备抽取。
      if (shouldRejectFullTextMarkdown(primary.md, url)) primary.md = "";
      else return primary;
    }
  } catch {
    // ignore（走后备）
  }

  // 2) 后备：AllOrigins（CORS proxy）+ 本地 HTML 抽取
  // 注：此方案不一定能达到 Reader 的结构化质量，但能显著减少 451/403 导致的“完全不可用”。
  let fallback: FullTextLoadResult | null = null;
  try {
    fallback = await loadFullTextViaAllOrigins({ url, timeoutMs });
    if (fallback.md) {
      if (!shouldRejectFullTextMarkdown(fallback.md, url)) return fallback;
      fallback.md = "";
    }
  } catch {
    // ignore（统一抛错）
  }

  // 3) 再后备：CodeTabs proxy + 本地 HTML 抽取（补 AllOrigins 偶发 5xx / 限流）
  let fallback2: FullTextLoadResult | null = null;
  try {
    fallback2 = await loadFullTextViaCodeTabs({ url, timeoutMs });
    if (fallback2.md) {
      if (!shouldRejectFullTextMarkdown(fallback2.md, url)) return fallback2;
      fallback2.md = "";
    }
  } catch {
    // ignore（统一抛错）
  }

  // 都失败：抛出更可诊断的错误（用于 UI 提示）
  const status = primary?.status ?? fallback?.status ?? fallback2?.status;
  const err = new Error(status ? `HTTP ${status}` : "load_failed") as Error & { status?: number };
  err.status = status;
  throw err;
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

    let viewMode: "auto" | "original" | "translated" = "auto";
    let loadPromise: Promise<void> | null = null;
    let translatePromise: Promise<void> | null = null;
    // 说明：全文可能很长，localStorage 写入会被配额/上限拦截（或被我们主动跳过）。
    // 但用户在“本次会话”里依然应该能用「查看原文/查看翻译」切换，所以保留内存态兜底。
    let memoryCache: FullTextCacheEntry | null = null;

    const setStatus = (text: string) => {
      if (!statusEl) return;
      statusEl.textContent = text;
      statusEl.classList.toggle("hidden", text.trim().length === 0);
    };

    const flashStatus = (text: string, ms: number) => {
      if (!text.trim()) return;
      setStatus(text);
      window.setTimeout(() => {
        if ((statusEl?.textContent ?? "") === text) setStatus("");
      }, ms);
    };

    const render = (text: string) => {
      delete contentEl.dataset.acgProseEnhanced;
      contentEl.innerHTML = stripInternalPlaceholdersFromHtml(renderMarkdownToHtml(text, url));
      let kind: ProseKind = "article";
      try {
        kind = detectProseKind(contentEl);
        contentEl.dataset.acgProseKind = kind;
      } catch {
        // ignore
      }

      if (kind === "article") {
        try {
          pruneProseArticleJunk(contentEl);
        } catch {
          // ignore
        }
      }

      if (kind === "index") {
        try {
          enhanceProseIndex(contentEl);
        } catch {
          // ignore
        }
      }

      try {
        enhanceProseImageGalleries(contentEl);
      } catch {
        // ignore
      }

      try {
        enhanceLinkListItems(contentEl);
      } catch {
        // ignore
      }
    };

    const hasTranslated = (cache: FullTextCacheEntry) => (lang === "zh" ? Boolean(cache.zh) : Boolean(cache.ja));
    const applyTranslated = (cache: FullTextCacheEntry, translated: string) => {
      if (lang === "zh") cache.zh = translated;
      else cache.ja = translated;
    };

    const getCache = (): FullTextCacheEntry | null => {
      const cache = memoryCache ?? readFullTextCache(postId);
      if (!cache || cache.url !== url) return null;
      if (!cache.original || cache.original.trim().length === 0) return null;
      if (shouldRejectFullTextMarkdown(cache.original, url)) return null;
      return cache;
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

    const ensureLoaded = (force: boolean): Promise<void> => {
      if (loadPromise) return loadPromise;
      loadPromise = (async () => {
        try {
          setStatus(lang === "ja" ? "全文を読み込み中…" : "正在加载全文…");

          let cache: FullTextCacheEntry | null = force ? null : memoryCache ?? readFullTextCache(postId);
          let loadResult: FullTextLoadResult | null = null;
          if (cache && cache.url !== url) cache = null;
          if (cache && shouldRejectFullTextMarkdown(cache.original, url)) cache = null;

          if (!cache || !cache.original) {
            loadResult = await loadFullTextMarkdown({ url, timeoutMs: 22_000 });
            cache = {
              url,
              fetchedAt: new Date().toISOString(),
              original: normalizeFullTextMarkdown(loadResult.md)
            };
            writeFullTextCache(postId, cache);
          }
          memoryCache = cache;
          showOriginal(cache);
          setStatus("");

          if (loadResult && loadResult.source !== "jina") {
            flashStatus(lang === "ja" ? "代替解析で抽出済み。" : "已使用备用解析提取全文。", 1600);
          }
        } catch (err) {
          const status = typeof (err as any)?.status === "number" ? ((err as any).status as number) : undefined;
          if (status === 451) {
            setStatus(
              lang === "ja"
                ? "読み込みに失敗しました (HTTP 451)。このサイトは外部リーダーを拒否している可能性があります。元記事を開いてください。"
                : "加载失败 (HTTP 451)：该来源可能拒绝第三方阅读模式。建议点击「打开原文」。"
            );
          } else if (status) {
            setStatus(
              lang === "ja"
                ? `読み込みに失敗しました (HTTP ${status})。元記事を開いてください。`
                : `加载失败 (HTTP ${status})：建议点击「打开原文」。`
            );
          } else {
            setStatus(lang === "ja" ? "読み込みに失敗しました。元記事を開いてください。" : "加载失败：建议点击「打开原文」。");
          }
        }
      })().finally(() => {
        loadPromise = null;
      });
      return loadPromise;
    };

    const ensureTranslated = (): Promise<void> => {
      if (translatePromise) return translatePromise;
      translatePromise = (async () => {
        await ensureLoaded(false);
        const cache = getCache();
        if (!cache) return;
        if (hasTranslated(cache)) {
          if (viewMode !== "original") showTranslated(cache);
          return;
        }

        const snapshotUrl = cache.url;
        const snapshotOriginal = cache.original;

        if (btnReload) btnReload.disabled = true;
        if (btnShowTranslated) btnShowTranslated.disabled = true;

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

        // 若用户中途点了「重新加载」，原文可能已变化：此时不要把旧翻译写回（避免错配）
        const current = memoryCache ?? readFullTextCache(postId);
        if (!current || current.url !== snapshotUrl || current.original !== snapshotOriginal) return;

        applyTranslated(current, translated);
        memoryCache = current;
        writeFullTextCache(postId, current);

        // 默认切到翻译（满足“选中文/日文就看懂”）；若用户明确选择了原文，则只提示“翻译已就绪”
        if (viewMode !== "original") showTranslated(current);
        else flashStatus(lang === "ja" ? "翻訳が完了しました。必要なら「翻訳を見る」を押してください。" : "翻译已就绪，如需查看请点击「查看翻译」。", 2000);
        setStatus("");
      })()
        .catch((err) => {
          const msg = String((err as any)?.message ?? "");
          const m = /HTTP\s+(\d+)/i.exec(msg);
          if (m?.[1]) {
            setStatus(lang === "ja" ? `翻訳に失敗しました (HTTP ${m[1]})。` : `翻译失败 (HTTP ${m[1]})。`);
          } else {
            setStatus(lang === "ja" ? "翻訳に失敗しました。" : "翻译失败。");
          }
        })
        .finally(() => {
          if (btnReload) btnReload.disabled = false;
          if (btnShowTranslated) btnShowTranslated.disabled = false;
          translatePromise = null;
        });
      return translatePromise;
    };

    btnReload?.addEventListener("click", (e) => {
      e.preventDefault();
      void ensureLoaded(true).then(() => {
        if (viewMode !== "original") void ensureTranslated();
      });
    });

    btnShowOriginal?.addEventListener("click", (e) => {
      e.preventDefault();
      viewMode = "original";
      const cache = getCache();
      if (cache) showOriginal(cache);
      setStatus("");
    });

    btnShowTranslated?.addEventListener("click", (e) => {
      e.preventDefault();
      viewMode = "translated";
      void ensureTranslated();
    });

    // 初始：命中缓存就立即展示（纯本地，不影响性能）；翻译按“进入视口再启动”
    const cached = readFullTextCache(postId);
    if (cached && cached.url === url && cached.original && !shouldRejectFullTextMarkdown(cached.original, url)) {
      memoryCache = cached;
      if (hasTranslated(cached)) {
        viewMode = "translated";
        showTranslated(cached);
      } else {
        viewMode = "auto";
        showOriginal(cached);
      }
      setStatus("");
    }

    // 自动加载/翻译：进入视口再触发（显著降低“页面刚打开就卡卡的”）
    if (autoload) {
      const startTranslateIfWanted = () => {
        if (viewMode === "original") return;
        void ensureTranslated();
      };

      if (!("IntersectionObserver" in window)) {
        // 无 IO：退化为立即加载（但仍不强制翻译；翻译仅在用户点击或视图需要时触发）
        void ensureLoaded(false).then(startTranslateIfWanted);
      } else {
        // 1) 预取原文：接近视口时开始加载（降低“滚动到这里才开始转圈”的等待）
        if (!getCache()) {
          const ioLoad = new IntersectionObserver(
            (entries) => {
              if (!entries.some((e) => e.isIntersecting)) return;
              ioLoad.disconnect();
              void ensureLoaded(false);
            },
            { rootMargin: "0px 0px 900px 0px", threshold: 0 }
          );
          ioLoad.observe(block);
        }

        // 2) 启动翻译：真正进入视口后再翻译（避免在用户阅读上半部分时后台重活导致卡顿）
        const ioTranslate = new IntersectionObserver(
          (entries) => {
            const hit = entries.some((e) => e.isIntersecting && (e.intersectionRatio ?? 0) > 0);
            if (!hit) return;
            ioTranslate.disconnect();
            startTranslateIfWanted();
          },
          { threshold: 0.12 }
        );
        ioTranslate.observe(block);
      }
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
    let pointerType: string = "mouse";
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let downHref: string | null = null;
    let downOpenInNewTab = false;

    const endDrag = (e?: PointerEvent) => {
      if (!dragging) return;
      const shouldMaybeOpen = pointerType === "mouse" && Boolean(downHref) && downHref;
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
        if (Math.abs(dx) >= moveThreshold && Math.abs(dx) >= Math.abs(dy) && move >= moveThreshold) dragged = true;
        // 兜底：如果没有可靠坐标，再用更高阈值的 scrollLeft 判断（避免误伤点击）
        else if (!e && Math.abs(track.scrollLeft - startScrollLeft) > 28) dragged = true;
      }
      dragging = false;
      pointerId = null;
      pointerType = "mouse";
      track.classList.remove("is-dragging");

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
