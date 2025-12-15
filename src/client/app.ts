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
  for (const btn of buttons) {
    const id = btn.dataset.bookmarkId ?? "";
    setBookmarkButtonState(btn, bookmarkIds.has(id));
    btn.addEventListener("click", () => {
      if (!id) return;
      if (bookmarkIds.has(id)) bookmarkIds.delete(id);
      else bookmarkIds.add(id);
      saveIds(BOOKMARK_KEY, bookmarkIds);
      setBookmarkButtonState(btn, bookmarkIds.has(id));
      document.dispatchEvent(new CustomEvent("acg:bookmarks-changed"));
    });
  }
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
  wireSearch();
  wireTagChips();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
