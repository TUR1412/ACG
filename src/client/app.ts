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

function wireSearch() {
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

  const run = () => {
    const q = normalizeText(input.value);
    let shown = 0;
    for (let i = 0; i < cards.length; i += 1) {
      const ok = q.length === 0 ? true : haystacks[i].includes(q);
      cards[i].classList.toggle("hidden", !ok);
      if (ok) shown += 1;
    }
    if (count) count.textContent = `${shown}/${cards.length}`;
  };

  input.addEventListener("input", run);
  run();
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
  markCurrentPostRead(readIds);
  applyReadState(readIds);
  wireBookmarks(bookmarkIds);
  wireBookmarksPage(bookmarkIds);
  wireBookmarkTools(bookmarkIds);
  wireSearch();
  wireTagChips();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
