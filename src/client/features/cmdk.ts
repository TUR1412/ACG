import { href } from "../../lib/href";
import { normalizeText } from "../search/query";
import { copyToClipboard } from "../utils/clipboard";
import { isJapanese } from "../utils/lang";
import { track } from "../utils/telemetry";

type Command = {
  id: string;
  title: string;
  desc?: string;
  keywords?: string[];
  run: () => void | Promise<void>;
};

type CommandView = Command & { _hay: string };

type CmdkUi = {
  root: HTMLElement;
  panel: HTMLElement;
  input: HTMLInputElement;
  list: HTMLElement;
};

let ui: CmdkUi | null = null;
let activeIndex = 0;
let lastFocus: HTMLElement | null = null;
let allCommands: CommandView[] = [];
let filtered: CommandView[] = [];

function toast(params: { title: string; desc?: string; variant?: "info" | "success" | "error"; timeoutMs?: number }) {
  try {
    document.dispatchEvent(new CustomEvent("acg:toast", { detail: params }));
  } catch {
    // ignore
  }
}

function getLang(): "zh" | "ja" {
  return isJapanese() ? "ja" : "zh";
}

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

function render() {
  if (!ui) return;
  ui.list.innerHTML = "";

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "acg-cmdk-empty";
    empty.textContent = isJapanese() ? "該当するコマンドがありません。" : "没有匹配的命令。";
    ui.list.appendChild(empty);
    return;
  }

  for (let i = 0; i < filtered.length; i += 1) {
    const cmd = filtered[i];
    const item = document.createElement("button");
    item.type = "button";
    item.className = "acg-cmdk-item";
    item.dataset.index = String(i);
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", i === activeIndex ? "true" : "false");
    if (i === activeIndex) item.classList.add("is-active");

    const title = document.createElement("div");
    title.className = "acg-cmdk-item-title";
    title.textContent = cmd.title;
    item.appendChild(title);

    if (cmd.desc) {
      const desc = document.createElement("div");
      desc.className = "acg-cmdk-item-desc";
      desc.textContent = cmd.desc;
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
  const q = normalizeText(ui.input.value);
  activeIndex = 0;

  if (!q) {
    filtered = allCommands.slice();
    render();
    return;
  }

  filtered = allCommands.filter((cmd) => cmd._hay.includes(q));
  render();
}

function execActive() {
  const cmd = filtered[activeIndex];
  if (!cmd) return;
  void Promise.resolve(cmd.run());
}

function buildCommands(): CommandView[] {
  const lang = getLang();
  const otherLang = lang === "zh" ? "ja" : "zh";

  const click = (selector: string): boolean => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return false;
    try {
      el.click();
      return true;
    } catch {
      return false;
    }
  };

  const toggleCheckbox = (selector: string): boolean => {
    const el = document.querySelector<HTMLInputElement>(selector);
    if (!el) return false;
    try {
      el.checked = !el.checked;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  };

  const nav = (path: string) => {
    location.href = href(path);
  };

  const openSearch = () => {
    const input = document.querySelector<HTMLInputElement>("#acg-search");
    if (input) {
      const behavior = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth";
      try {
        input.scrollIntoView({ behavior, block: "center" });
      } catch {
        // ignore
      }
      try {
        input.focus();
        input.select();
      } catch {
        // ignore
      }
      return;
    }
    nav(`/${lang}/#search`);
  };

  const openPrefs = () => {
    if (click("[data-open-prefs]")) return;
    nav(`/${lang}/#prefs`);
  };

  const toggleLang = () => {
    const ok = click('a[aria-label="Switch language"]');
    if (ok) return;
    const rest = location.pathname.replace(/^\/(zh|ja)(\/|$)/, "/");
    nav(`/${otherLang}${rest}${location.search}${location.hash}`);
  };

  const copyPageUrl = async () => {
    const ok = await copyToClipboard(location.href);
    toast({
      title: ok ? (isJapanese() ? "コピーしました" : "已复制") : isJapanese() ? "コピー失敗" : "复制失败",
      variant: ok ? "success" : "error",
      timeoutMs: 1200
    });
    close();
  };

  const go = (path: string) => () => {
    close();
    nav(path);
  };

  const action = (fn: () => void | Promise<void>) => async () => {
    await fn();
  };

  const commands: Command[] = [
    {
      id: "nav_latest",
      title: isJapanese() ? "ニュース（最新）へ" : "前往：新闻动态（最新）",
      desc: isJapanese() ? "トップ / カテゴリ一覧" : "首页 / 分类列表",
      keywords: ["home", "latest", "news", "top"],
      run: go(`/${lang}/`)
    },
    {
      id: "nav_bookmarks",
      title: isJapanese() ? "ブックマークへ" : "前往：收藏",
      desc: isJapanese() ? "保存した記事" : "你收藏的文章",
      keywords: ["bookmark", "star", "save"],
      run: go(`/${lang}/bookmarks/`)
    },
    {
      id: "nav_status",
      title: isJapanese() ? "ステータスへ" : "前往：状态页",
      desc: isJapanese() ? "抓取の健康度" : "抓取健康度与错误提示",
      keywords: ["status", "health"],
      run: go(`/${lang}/status/`)
    },
    {
      id: "nav_about",
      title: isJapanese() ? "このサイトについて" : "前往：关于",
      desc: isJapanese() ? "仕組み / ソース" : "机制说明 / 来源列表",
      keywords: ["about", "info"],
      run: go(`/${lang}/about/`)
    },
    {
      id: "focus_search",
      title: isJapanese() ? "検索を開く / フォーカス" : "打开/聚焦搜索",
      desc: isJapanese() ? "「/」でも可" : "也可按「/」",
      keywords: ["search", "find", "/"],
      run: action(() => {
        close();
        openSearch();
      })
    },
    {
      id: "open_prefs",
      title: isJapanese() ? "設定（Preferences）" : "偏好设置（Preferences）",
      desc: isJapanese() ? "フィルタ / ソース / テーマ" : "过滤 / 来源 / 主题",
      keywords: ["prefs", "settings", "filter", "theme"],
      run: action(() => {
        close();
        openPrefs();
      })
    },
    {
      id: "toggle_search_scope",
      title: isJapanese() ? "検索範囲を切替（ページ/全件）" : "切换：搜索范围（本页/全站）",
      desc: isJapanese() ? "acg-search-scope-toggle" : "acg-search-scope-toggle",
      keywords: ["scope", "page", "all", "global", "search"],
      run: action(() => {
        const ok = click("#acg-search-scope-toggle");
        close();
        if (ok) return;
        toast({
          title: isJapanese() ? "このページでは切替できません" : "当前页面无法切换搜索范围",
          desc: isJapanese() ? "検索入力があるページで試してください。" : "请在带搜索框的页面使用此命令。",
          variant: "error",
          timeoutMs: 1600
        });
      })
    },
    {
      id: "toggle_followed",
      title: isJapanese() ? "「フォローのみ」を切替" : "切换：只看关注关键词",
      desc: isJapanese() ? "acg-only-followed" : "acg-only-followed",
      keywords: ["only", "follow", "keyword"],
      run: action(() => {
        const ok = toggleCheckbox("#acg-only-followed");
        close();
        if (!ok) openPrefs();
      })
    },
    {
      id: "toggle_followed_sources",
      title: isJapanese() ? "「フォロー源のみ」を切替" : "切换：只看关注来源",
      desc: isJapanese() ? "acg-only-followed-sources" : "acg-only-followed-sources",
      keywords: ["only", "follow", "source"],
      run: action(() => {
        const ok = toggleCheckbox("#acg-only-followed-sources");
        close();
        if (!ok) openPrefs();
      })
    },
    {
      id: "toggle_hide_read",
      title: isJapanese() ? "「既読を隠す」を切替" : "切换：隐藏已读",
      desc: isJapanese() ? "acg-hide-read" : "acg-hide-read",
      keywords: ["hide", "read", "unread"],
      run: action(() => {
        const ok = toggleCheckbox("#acg-hide-read");
        close();
        if (!ok) openPrefs();
      })
    },
    {
      id: "toggle_theme",
      title: isJapanese() ? "テーマを切替" : "切换主题",
      desc: isJapanese() ? "自動 / ライト / ダーク" : "自动 / 浅色 / 深色",
      keywords: ["theme", "dark", "light"],
      run: action(() => {
        const ok = click("[data-theme-toggle]");
        close();
        if (!ok) return;
      })
    },
    {
      id: "switch_lang",
      title: isJapanese() ? "言語を切替" : "切换语言",
      desc: isJapanese() ? "日本語 / 中文" : "中文 / 日本語",
      keywords: ["lang", "language", "中文", "日本語"],
      run: action(() => {
        close();
        toggleLang();
      })
    },
    {
      id: "copy_url",
      title: isJapanese() ? "このページのURLをコピー" : "复制当前页链接",
      desc: isJapanese() ? "共有用" : "用于分享",
      keywords: ["copy", "share", "url", "link"],
      run: action(copyPageUrl)
    }
  ];

  return commands.map((c) => ({
    ...c,
    _hay: normalizeText([c.title, c.desc ?? "", ...(c.keywords ?? [])].join(" "))
  }));
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

  allCommands = buildCommands();
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
