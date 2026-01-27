import { isJapanese } from "../../utils/lang";
import { track } from "../../utils/telemetry";
import { buildCommands } from "./commands";
import { filterCommandViews, pickHighlightToken } from "./query";
import type { CmdkUi, CommandGroup, CommandView } from "./types";

let ui: CmdkUi | null = null;
let activeIndex = 0;
let lastFocus: HTMLElement | null = null;
let allCommands: CommandView[] = [];
let filtered: CommandView[] = [];

function isMacLike(): boolean {
  try {
    const ua = navigator.userAgent ?? "";
    return /Macintosh|Mac OS X|iPhone|iPad|iPod/i.test(ua);
  } catch {
    return false;
  }
}

function close() {
  if (!ui) return;
  try {
    ui.root.classList.remove("is-open");
    ui.root.setAttribute("aria-hidden", "true");
    ui.root.setAttribute("inert", "");
    document.body.classList.remove("acg-no-scroll");
  } catch {
    // ignore
  }

  try {
    lastFocus?.focus();
  } catch {
    // ignore
  }
  lastFocus = null;
}

function scrollIntoViewIfNeeded(el: HTMLElement) {
  try {
    const parent = el.parentElement;
    if (!parent) return;
    const r = el.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    if (r.top < pr.top) parent.scrollTop -= pr.top - r.top + 8;
    else if (r.bottom > pr.bottom) parent.scrollTop += r.bottom - pr.bottom + 8;
  } catch {
    // ignore
  }
}

function groupLabel(group: CommandGroup): string {
  const ja = isJapanese();
  switch (group) {
    case "nav":
      return ja ? "ナビゲーション" : "导航";
    case "search":
      return ja ? "検索" : "搜索";
    case "filters":
      return ja ? "フィルター" : "过滤";
    case "views":
      return ja ? "ビュー" : "视图";
    case "system":
      return ja ? "システム" : "系统";
    case "share":
      return ja ? "共有" : "分享";
    default:
      return ja ? "その他" : "其他";
  }
}

function appendHighlightedText(parent: HTMLElement, text: string, highlightRaw: string) {
  const highlight = highlightRaw.trim();
  if (!highlight) {
    parent.textContent = text;
    return;
  }

  const hay = text.toLowerCase();
  const needle = highlight.toLowerCase();
  const idx = hay.indexOf(needle);
  if (idx < 0) {
    parent.textContent = text;
    return;
  }

  const before = text.slice(0, idx);
  const mid = text.slice(idx, idx + highlight.length);
  const after = text.slice(idx + highlight.length);

  parent.append(document.createTextNode(before));
  const mark = document.createElement("mark");
  mark.className = "acg-cmdk-mark";
  mark.textContent = mid;
  parent.append(mark);
  parent.append(document.createTextNode(after));
}

function render() {
  if (!ui) return;
  ui.list.innerHTML = "";
  const highlight = pickHighlightToken(ui.input.value);

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "acg-cmdk-empty";
    empty.textContent = isJapanese() ? "該当するコマンドがありません。" : "没有匹配的命令。";
    ui.list.appendChild(empty);
    return;
  }

  const showSections = new Set(filtered.map((x) => x.group)).size > 1;
  let lastGroup: CommandGroup | null = null;
  for (let i = 0; i < filtered.length; i += 1) {
    const cmd = filtered[i];

    if (showSections && cmd.group !== lastGroup) {
      lastGroup = cmd.group;
      const sec = document.createElement("div");
      sec.className = "acg-cmdk-section";
      sec.setAttribute("role", "presentation");
      const label = document.createElement("div");
      label.className = "acg-cmdk-section-title";
      label.textContent = groupLabel(cmd.group);
      sec.appendChild(label);
      ui.list.appendChild(sec);
    }

    const item = document.createElement("button");
    item.type = "button";
    item.className = "acg-cmdk-item";
    item.dataset.index = String(i);
    item.dataset.group = cmd.group;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", i === activeIndex ? "true" : "false");
    if (i === activeIndex) item.classList.add("is-active");

    const title = document.createElement("div");
    title.className = "acg-cmdk-item-title";
    appendHighlightedText(title, cmd.title, highlight);
    item.appendChild(title);

    if (cmd.desc) {
      const desc = document.createElement("div");
      desc.className = "acg-cmdk-item-desc";
      appendHighlightedText(desc, cmd.desc, highlight);
      item.appendChild(desc);
    }

    item.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        track({ type: "cmdk_run", data: { id: cmd.id } });
      } catch {
        // ignore
      }
      await cmd.run();
    });

    ui.list.appendChild(item);
  }

  const active = ui.list.querySelector<HTMLElement>(`.acg-cmdk-item[data-index="${activeIndex}"]`);
  if (active) scrollIntoViewIfNeeded(active);
}

function applyFilter() {
  if (!ui) return;
  filtered = filterCommandViews(allCommands, ui.input.value);
  activeIndex = 0;
  render();
}

function execActive() {
  const cmd = filtered[activeIndex];
  if (!cmd) return;
  void Promise.resolve(cmd.run());
}

function ensureUi(): CmdkUi {
  if (ui) return ui;

  const root = document.createElement("div");
  root.id = "acg-cmdk";
  root.className = "acg-cmdk-root";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", isJapanese() ? "コマンド" : "命令面板");
  root.setAttribute("aria-hidden", "true");
  root.setAttribute("inert", "");

  const backdrop = document.createElement("div");
  backdrop.className = "acg-cmdk-backdrop";
  backdrop.addEventListener("click", () => close());
  root.appendChild(backdrop);

  const panel = document.createElement("div");
  panel.className = "acg-cmdk-panel";
  panel.addEventListener("click", (e) => e.stopPropagation());
  root.appendChild(panel);

  const head = document.createElement("div");
  head.className = "acg-cmdk-head";
  panel.appendChild(head);

  const title = document.createElement("div");
  title.className = "acg-cmdk-title";
  title.textContent = isJapanese() ? "コマンド" : "命令面板";
  head.appendChild(title);

  const hint = document.createElement("div");
  hint.className = "acg-cmdk-hint";
  hint.textContent = isMacLike() ? "⌘K" : "Ctrl+K";
  head.appendChild(hint);

  const input = document.createElement("input");
  input.className = "acg-cmdk-input";
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = isJapanese() ? "検索：nav / filter / theme / ..." : "搜索：nav / filter / theme / ...";
  panel.appendChild(input);

  const list = document.createElement("div");
  list.className = "acg-cmdk-list";
  list.setAttribute("role", "listbox");
  panel.appendChild(list);

  const foot = document.createElement("div");
  foot.className = "acg-cmdk-foot";
  foot.textContent = isJapanese() ? "↑↓ 選択 / Enter 実行 / Esc 閉じる" : "↑↓ 选择 / Enter 执行 / Esc 关闭";
  panel.appendChild(foot);

  input.addEventListener("input", applyFilter);
  input.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;

    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(filtered.length - 1, activeIndex + 1);
      render();
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(0, activeIndex - 1);
      render();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      execActive();
    }
  });

  root.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });

  document.body.appendChild(root);

  ui = { root, panel, input, list };
  return ui;
}

export function openCommandPalette() {
  const u = ensureUi();

  try {
    lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  } catch {
    lastFocus = null;
  }

  allCommands = buildCommands({ close });
  filtered = allCommands.slice();
  activeIndex = 0;

  u.input.value = "";
  render();

  try {
    u.root.classList.add("is-open");
    u.root.removeAttribute("inert");
    u.root.setAttribute("aria-hidden", "false");
    document.body.classList.add("acg-no-scroll");
  } catch {
    // ignore
  }

  try {
    u.input.focus();
    u.input.select();
  } catch {
    // ignore
  }

  try {
    track({ type: "cmdk_open", data: {} });
  } catch {
    // ignore
  }
}
