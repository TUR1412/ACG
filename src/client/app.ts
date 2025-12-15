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
    card.classList.toggle("opacity-70", isRead);
  }
}

function wireBookmarks(bookmarkIds: Set<string>) {
  const buttons = document.querySelectorAll<HTMLButtonElement>("button[data-bookmark-id]");
  const apply = () => {
    for (const btn of buttons) {
      const id = btn.dataset.bookmarkId ?? "";
      setBookmarkButtonState(btn, bookmarkIds.has(id));
    }
  };

  apply();

  for (const btn of buttons) {
    const id = btn.dataset.bookmarkId ?? "";
    btn.addEventListener("click", () => {
      if (!id) return;
      if (bookmarkIds.has(id)) bookmarkIds.delete(id);
      else bookmarkIds.add(id);
      saveIds(BOOKMARK_KEY, bookmarkIds);
      setBookmarkButtonState(btn, bookmarkIds.has(id));
      document.dispatchEvent(new CustomEvent("acg:bookmarks-changed"));
    });
  }

  document.addEventListener("acg:bookmarks-changed", apply);
}

function wireTagChips() {
  const input = document.querySelector<HTMLInputElement>("#acg-search");
  if (!input) return;
  const chips = document.querySelectorAll<HTMLButtonElement>("button[data-tag]");
  for (const chip of chips) {
    chip.addEventListener("click", () => {
      const tag = chip.dataset.tag ?? "";
      if (!tag) return;
      input.value = tag;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    });
  }
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function createListFilter(params: {
  readIds: Set<string>;
  follows: Set<string>;
  blocklist: Set<string>;
  filters: FilterStore;
}) {
  const { readIds, follows, blocklist, filters } = params;
  const input = document.querySelector<HTMLInputElement>("#acg-search");
  const count = document.querySelector<HTMLElement>("#acg-search-count");
  if (!input) return;

  const cards = [...document.querySelectorAll<HTMLElement>("[data-post-id]")];
  const haystacks = cards.map((card) => {
    const title = card.querySelector("a")?.textContent ?? "";
    const summary = card.querySelector("p")?.textContent ?? "";
    const tags = [...card.querySelectorAll("button[data-tag]")].map((b) => b.textContent ?? "").join(" ");
    return normalizeText(`${title} ${summary} ${tags}`);
  });

  const apply = () => {
    const q = normalizeText(input.value);
    const followOnlyEnabled = filters.onlyFollowed;
    const hideReadEnabled = filters.hideRead;
    const followWords = [...follows];
    const blockWords = [...blocklist];

    let shown = 0;
    for (let i = 0; i < cards.length; i += 1) {
      const id = cards[i].dataset.postId ?? "";
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

      const ok = matchSearch && matchFollow && !blocked && !hideByRead;
      cards[i].classList.toggle("hidden", !ok);
      if (ok) shown += 1;
    }
    if (count) count.textContent = `${shown}/${cards.length}`;
  };

  input.addEventListener("input", apply);
  document.addEventListener("acg:filters-changed", apply);
  apply();
}

function wireBookmarksPage(bookmarkIds: Set<string>) {
  const container = document.querySelector<HTMLElement>("#acg-bookmarks");
  if (!container) return;

  const apply = () => {
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

  apply();
  document.addEventListener("acg:bookmarks-changed", apply);
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
  markCurrentPostRead(readIds);
  applyReadState(readIds);
  wireBookmarks(bookmarkIds);
  wireBookmarksPage(bookmarkIds);
  wireBookmarkTools(bookmarkIds);
  wirePreferences({ follows, blocklist, filters });
  createListFilter({ readIds, follows, blocklist, filters });
  wireTagChips();
  wireDailyBriefCopy();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
