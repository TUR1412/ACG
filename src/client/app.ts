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

type WordStore = {
  version: 1;
  words: string[];
};

type FilterStore = {
  version: 1;
  onlyFollowed: boolean;
  hideRead: boolean;
};

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
    const parsed = safeJsonParse<FilterStore>(localStorage.getItem(FILTERS_KEY));
    return {
      version: 1,
      onlyFollowed: Boolean(parsed?.onlyFollowed),
      hideRead: Boolean(parsed?.hideRead)
    };
  } catch {
    return { version: 1, onlyFollowed: false, hideRead: false };
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
  const label = button.querySelector<HTMLElement>("[data-bookmark-label]");
  if (label) label.textContent = on ? "★" : "☆";
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
    icon.textContent = "↑";

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

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function createListFilter(params: {
  readIds: Set<string>;
  follows: Set<string>;
  blocklist: Set<string>;
  disabledSources: Set<string>;
  filters: FilterStore;
}) {
  const { readIds, follows, blocklist, disabledSources, filters } = params;
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
      const blocked = blockWords.some((w) => w && hay.includes(w));
      const read = id ? readIds.has(id) : false;
      const hideByRead = hideReadEnabled && read;
      const sourceEnabled = !sourceId || !disabledSources.has(sourceId);

      const ok = matchSearch && matchFollow && !blocked && !hideByRead && sourceEnabled;
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
  summary?: string;
  url: string;
  publishedAt: string;
  cover?: string;
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
        summary: typeof it.summary === "string" ? it.summary : undefined,
        url: typeof it.url === "string" ? it.url : "",
        publishedAt: typeof it.publishedAt === "string" ? it.publishedAt : "",
        cover: typeof it.cover === "string" ? it.cover : undefined,
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
  const detailHref = hrefInBase(`/${lang}/p/${post.id}/`);
  const when = whenLabel(lang, post.publishedAt);

  const article = document.createElement("article");
  article.className = "glass-card acg-card clickable shine group relative overflow-hidden rounded-2xl";
  article.dataset.postId = post.id;
  article.dataset.category = post.category;
  article.dataset.sourceId = post.sourceId;
  if (readIds.has(post.id)) article.setAttribute("data-read", "true");

  const topLink = document.createElement("a");
  topLink.href = detailHref;
  topLink.className = "relative block aspect-[16/9]";
  article.appendChild(topLink);

  const coverGrad = document.createElement("div");
  coverGrad.className = `absolute inset-0 bg-gradient-to-br ${theme.cover}`;
  topLink.appendChild(coverGrad);

  if (post.cover) {
    const img = document.createElement("img");
    img.src = post.cover;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.className =
      "absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]";
    img.addEventListener("error", () => {
      img.style.opacity = "0";
      img.style.pointerEvents = "none";
    });
    topLink.appendChild(img);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "absolute inset-0 grid place-items-center";
    const tag = document.createElement("div");
    tag.className = "glass-card rounded-2xl px-3 py-2 text-xs font-semibold text-slate-950/80";
    tag.textContent = "ACG Radar";
    placeholder.appendChild(tag);
    topLink.appendChild(placeholder);
  }

  const overlay = document.createElement("div");
  overlay.className = "absolute inset-0 bg-gradient-to-t from-slate-950/45 via-slate-950/10 to-transparent";
  topLink.appendChild(overlay);

  const badgeWrap = document.createElement("div");
  badgeWrap.className = "absolute left-3 top-3";
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
  titleLink.textContent = post.title || (lang === "ja" ? "（無題）" : "（无标题）");
  left.appendChild(titleLink);

  const meta = document.createElement("div");
  meta.className = "mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs";
  left.appendChild(meta);

  if (post.sourceUrl && post.sourceName) {
    const sourceLink = document.createElement("a");
    sourceLink.className = "text-slate-700 hover:underline";
    sourceLink.href = post.sourceUrl;
    sourceLink.target = "_blank";
    sourceLink.rel = "noreferrer";
    sourceLink.textContent = post.sourceName;
    meta.appendChild(sourceLink);
  }

  const star = document.createElement("button");
  star.type = "button";
  star.className = "glass-card rounded-xl px-3 py-2 text-xs font-medium text-slate-950 clickable";
  star.dataset.bookmarkId = post.id;
  star.setAttribute("aria-pressed", "true");
  star.title = "Bookmark";
  const starLabel = document.createElement("span");
  starLabel.setAttribute("data-bookmark-label", "");
  star.appendChild(starLabel);
  setBookmarkButtonState(star, true);
  head.appendChild(star);

  if (post.summary) {
    const p = document.createElement("p");
    p.className = "mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600";
    p.textContent = post.summary;
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
        ? "rounded-full border border-slate-900/10 bg-white/50 px-3 py-1 text-xs text-slate-700 hover:bg-white/70 clickable"
        : "rounded-full border border-rose-600/20 bg-rose-500/10 px-3 py-1 text-xs text-rose-800 hover:bg-rose-500/15 clickable";
    btn.textContent = `${word} ×`;
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
  const hideRead = document.querySelector<HTMLInputElement>("#acg-hide-read");
  const followInput = document.querySelector<HTMLInputElement>("#acg-follow-input");
  const followAdd = document.querySelector<HTMLButtonElement>("#acg-follow-add");
  const followList = document.querySelector<HTMLElement>("#acg-follow-list");
  const blockInput = document.querySelector<HTMLInputElement>("#acg-block-input");
  const blockAdd = document.querySelector<HTMLButtonElement>("#acg-block-add");
  const blockList = document.querySelector<HTMLElement>("#acg-block-list");

  if (!onlyFollowed || !hideRead || !followInput || !followAdd || !followList || !blockInput || !blockAdd || !blockList) {
    return;
  }

  onlyFollowed.checked = filters.onlyFollowed;
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
    const lines = items.slice(0, 20).map((a) => `- ${a.textContent?.trim() ?? ""}\n  ${a.href}`);
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

function markCurrentPostRead(readIds: Set<string>) {
  const current = document.body.dataset.currentPostId ?? "";
  if (!current) return;
  if (readIds.has(current)) return;
  readIds.add(current);
  saveIds(READ_KEY, readIds);
}

function main() {
  const bookmarkIds = loadIds(BOOKMARK_KEY);
  const readIds = loadIds(READ_KEY);
  const follows = loadWords(FOLLOWS_KEY);
  const blocklist = loadWords(BLOCKLIST_KEY);
  const filters = loadFilters();
  const disabledSources = loadIds(DISABLED_SOURCES_KEY);
  markCurrentPostRead(readIds);
  applyReadState(readIds);
  wireBackToTop();
  wireBookmarks(bookmarkIds);
  wireBookmarksPage(bookmarkIds, readIds);
  wireBookmarkTools(bookmarkIds);
  wirePreferences({ follows, blocklist, filters });
  wireSourceToggles(disabledSources);
  createListFilter({ readIds, follows, blocklist, disabledSources, filters });
  wireKeyboardShortcuts();
  wireTagChips();
  wireDailyBriefCopy();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
