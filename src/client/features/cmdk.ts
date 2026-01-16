import { href } from "../../lib/href";
import { normalizeText } from "../../lib/search/query";
import { STORAGE_KEYS } from "../constants";
import { copyToClipboard } from "../utils/clipboard";
import { isJapanese } from "../utils/lang";
import { track } from "../utils/telemetry";

type CommandGroup = "nav" | "search" | "filters" | "views" | "system" | "share";

type Command = {
  id: string;
  group: CommandGroup;
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

function toast(params: {
  title: string;
  desc?: string;
  variant?: "info" | "success" | "error";
  timeoutMs?: number;
}) {
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
  const highlight = (() => {
    const raw = ui.input.value.trim();
    if (!raw) return "";
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return raw;
    return parts.reduce((acc, cur) => (cur.length > acc.length ? cur : acc), parts[0]);
  })();

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

  const getViewMode = (): "grid" | "list" => {
    try {
      const raw = document.documentElement.dataset.acgView;
      if (raw === "grid" || raw === "list") return raw;
    } catch {
      // ignore
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.VIEW_MODE);
      return raw === "grid" || raw === "list" ? raw : "grid";
    } catch {
      return "grid";
    }
  };

  const setViewMode = (mode: "grid" | "list"): boolean => {
    const ok = click(`[data-view-mode="${mode}"]`);
    if (ok) return true;
    try {
      localStorage.setItem(STORAGE_KEYS.VIEW_MODE, mode);
    } catch {
      // ignore
    }
    try {
      document.documentElement.dataset.acgView = mode;
    } catch {
      // ignore
    }
    return false;
  };

  const getDensityMode = (): "comfort" | "compact" => {
    try {
      const raw = document.documentElement.dataset.acgDensity;
      if (raw === "comfort" || raw === "compact") return raw;
    } catch {
      // ignore
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.DENSITY);
      return raw === "comfort" || raw === "compact" ? raw : "comfort";
    } catch {
      return "comfort";
    }
  };

  const setDensityMode = (mode: "comfort" | "compact"): boolean => {
    const ok = click(`[data-density-mode="${mode}"]`);
    if (ok) return true;
    try {
      localStorage.setItem(STORAGE_KEYS.DENSITY, mode);
    } catch {
      // ignore
    }
    try {
      document.documentElement.dataset.acgDensity = mode;
    } catch {
      // ignore
    }
    return false;
  };

  const getAccentMode = (): "neon" | "sakura" | "ocean" | "amber" => {
    try {
      const raw = document.documentElement.dataset.acgAccent;
      if (raw === "neon" || raw === "sakura" || raw === "ocean" || raw === "amber") return raw;
    } catch {
      // ignore
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ACCENT);
      return raw === "neon" || raw === "sakura" || raw === "ocean" || raw === "amber" ? raw : "neon";
    } catch {
      return "neon";
    }
  };

  const setAccentMode = (mode: "neon" | "sakura" | "ocean" | "amber"): boolean => {
    const ok = click(`[data-accent-mode="${mode}"]`);
    if (ok) return true;
    try {
      localStorage.setItem(STORAGE_KEYS.ACCENT, mode);
    } catch {
      // ignore
    }
    try {
      document.documentElement.dataset.acgAccent = mode;
    } catch {
      // ignore
    }
    try {
      document.dispatchEvent(new CustomEvent("acg:accent-changed", { detail: { accent: mode } }));
    } catch {
      // ignore
    }
    return false;
  };

  const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object");

  type ViewPresetSummary = { id: string; name: string; createdAt: number; hint: string };

  const loadViewPresets = (): ViewPresetSummary[] => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.VIEW_PRESETS);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!isRecord(parsed) || parsed.version !== 1) return [];
      const listRaw = parsed.presets;
      if (!Array.isArray(listRaw)) return [];

      const normalizeLens = (v: unknown): "all" | "2h" | "6h" | "24h" => {
        return v === "2h" || v === "6h" || v === "24h" || v === "all" ? v : "all";
      };
      const normalizeSort = (v: unknown): "latest" | "pulse" => {
        return v === "pulse" || v === "latest" ? v : "latest";
      };

      const out: ViewPresetSummary[] = [];
      for (const item of listRaw) {
        if (!isRecord(item) || item.version !== 1) continue;
        const id = typeof item.id === "string" ? item.id : "";
        const name = typeof item.name === "string" ? item.name : "";
        const createdAt =
          typeof item.createdAt === "number" && Number.isFinite(item.createdAt) ? item.createdAt : 0;
        const snap = isRecord(item.snapshot) ? item.snapshot : null;
        if (!id || !name || !createdAt || !snap) continue;

        let hint = "";
        const qRaw = typeof snap.q === "string" ? snap.q.trim() : "";
        if (qRaw) hint = qRaw.length > 72 ? `${qRaw.slice(0, 72)}…` : qRaw;
        else if (isRecord(snap.filters)) {
          const lens = normalizeLens(snap.filters.timeLens);
          const sort = normalizeSort(snap.filters.sortMode);
          hint = `${lens} · ${sort}`;
        } else {
          hint = "";
        }

        out.push({ id, name, createdAt, hint });
      }

      out.sort((a, b) => b.createdAt - a.createdAt);
      return out;
    } catch {
      return [];
    }
  };

  const openViewPresetManager = () => {
    openPrefs();
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>("#acg-view-presets");
      if (!el) return;
      const behavior = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth";
      try {
        el.scrollIntoView({ behavior, block: "center" });
      } catch {
        // ignore
      }
    }, 120);
  };

  const applyViewPreset = (id: string): boolean => {
    try {
      document.dispatchEvent(new CustomEvent("acg:apply-view-preset", { detail: { id } }));
      return true;
    } catch {
      return false;
    }
  };

  const toggleLang = () => {
    const ok = click("a[data-lang-switch]");
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
      group: "nav",
      title: isJapanese() ? "ニュース（最新）へ" : "前往：新闻动态（最新）",
      desc: isJapanese() ? "トップ / カテゴリ一覧" : "首页 / 分类列表",
      keywords: ["home", "latest", "news", "top"],
      run: go(`/${lang}/`)
    },
    {
      id: "nav_bookmarks",
      group: "nav",
      title: isJapanese() ? "ブックマークへ" : "前往：收藏",
      desc: isJapanese() ? "保存した記事" : "你收藏的文章",
      keywords: ["bookmark", "star", "save"],
      run: go(`/${lang}/bookmarks/`)
    },
    {
      id: "nav_status",
      group: "nav",
      title: isJapanese() ? "ステータスへ" : "前往：状态页",
      desc: isJapanese() ? "抓取の健康度" : "抓取健康度与错误提示",
      keywords: ["status", "health"],
      run: go(`/${lang}/status/`)
    },
    {
      id: "nav_about",
      group: "nav",
      title: isJapanese() ? "このサイトについて" : "前往：关于",
      desc: isJapanese() ? "仕組み / ソース" : "机制说明 / 来源列表",
      keywords: ["about", "info"],
      run: go(`/${lang}/about/`)
    },
    {
      id: "focus_search",
      group: "search",
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
      group: "filters",
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
      group: "filters",
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
      group: "filters",
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
      group: "filters",
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
      group: "filters",
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
      id: "toggle_layout",
      group: "system",
      title: isJapanese() ? "レイアウトを切替（グリッド/リスト）" : "切换布局（网格/列表）",
      desc: isJapanese() ? "Grid / List" : "Grid / List",
      keywords: [
        "layout",
        "view",
        "grid",
        "list",
        "レイアウト",
        "グリッド",
        "リスト",
        "布局",
        "网格",
        "列表"
      ],
      run: action(() => {
        const next = getViewMode() === "grid" ? "list" : "grid";
        const ok = setViewMode(next);
        close();
        toast({
          title: isJapanese()
            ? `レイアウト：${next === "grid" ? "グリッド" : "リスト"}`
            : `布局：${next === "grid" ? "网格" : "列表"}`,
          desc: ok
            ? undefined
            : isJapanese()
              ? "このページでは UI がないため、設定のみ保存しました。"
              : "当前页无对应控件，已仅保存偏好设置。",
          variant: "success",
          timeoutMs: 1400
        });
      })
    },
    {
      id: "layout_grid",
      group: "system",
      title: isJapanese() ? "レイアウト：グリッド" : "布局：网格",
      desc: isJapanese() ? "Grid view" : "Grid view",
      keywords: ["layout", "grid", "view", "グリッド", "网格"],
      run: action(() => {
        const ok = setViewMode("grid");
        close();
        toast({
          title: isJapanese() ? "レイアウト：グリッド" : "布局：网格",
          desc: ok
            ? undefined
            : isJapanese()
              ? "このページでは UI がないため、設定のみ保存しました。"
              : "当前页无对应控件，已仅保存偏好设置。",
          variant: "success",
          timeoutMs: 1400
        });
      })
    },
    {
      id: "layout_list",
      group: "system",
      title: isJapanese() ? "レイアウト：リスト" : "布局：列表",
      desc: isJapanese() ? "List view" : "List view",
      keywords: ["layout", "list", "view", "リスト", "列表"],
      run: action(() => {
        const ok = setViewMode("list");
        close();
        toast({
          title: isJapanese() ? "レイアウト：リスト" : "布局：列表",
          desc: ok
            ? undefined
            : isJapanese()
              ? "このページでは UI がないため、設定のみ保存しました。"
              : "当前页无对应控件，已仅保存偏好设置。",
          variant: "success",
          timeoutMs: 1400
        });
      })
    },
    {
      id: "toggle_density",
      group: "system",
      title: isJapanese() ? "密度を切替（ゆったり/コンパクト）" : "切换密度（舒适/紧凑）",
      desc: isJapanese() ? "Comfort / Compact" : "Comfort / Compact",
      keywords: ["density", "compact", "comfort", "密度", "紧凑", "舒适", "コンパクト", "ゆったり"],
      run: action(() => {
        const next = getDensityMode() === "comfort" ? "compact" : "comfort";
        const ok = setDensityMode(next);
        close();
        toast({
          title: isJapanese()
            ? `密度：${next === "comfort" ? "ゆったり" : "コンパクト"}`
            : `密度：${next === "comfort" ? "舒适" : "紧凑"}`,
          desc: ok
            ? undefined
            : isJapanese()
              ? "このページでは UI がないため、設定のみ保存しました。"
              : "当前页无对应控件，已仅保存偏好设置。",
          variant: "success",
          timeoutMs: 1400
        });
      })
    },
    {
      id: "density_comfort",
      group: "system",
      title: isJapanese() ? "密度：ゆったり" : "密度：舒适",
      desc: isJapanese() ? "Comfort density" : "Comfort density",
      keywords: ["density", "comfort", "ゆったり", "舒适"],
      run: action(() => {
        const ok = setDensityMode("comfort");
        close();
        toast({
          title: isJapanese() ? "密度：ゆったり" : "密度：舒适",
          desc: ok
            ? undefined
            : isJapanese()
              ? "このページでは UI がないため、設定のみ保存しました。"
              : "当前页无对应控件，已仅保存偏好设置。",
          variant: "success",
          timeoutMs: 1400
        });
      })
    },
    {
      id: "density_compact",
      group: "system",
      title: isJapanese() ? "密度：コンパクト" : "密度：紧凑",
      desc: isJapanese() ? "Compact density" : "Compact density",
      keywords: ["density", "compact", "コンパクト", "紧凑"],
      run: action(() => {
        const ok = setDensityMode("compact");
        close();
        toast({
          title: isJapanese() ? "密度：コンパクト" : "密度：紧凑",
          desc: ok
            ? undefined
            : isJapanese()
              ? "このページでは UI がないため、設定のみ保存しました。"
              : "当前页无对应控件，已仅保存偏好设置。",
          variant: "success",
          timeoutMs: 1400
        });
      })
    },
    {
      id: "toggle_theme",
      group: "system",
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
      group: "system",
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
      group: "share",
      title: isJapanese() ? "このページのURLをコピー" : "复制当前页链接",
      desc: isJapanese() ? "共有用" : "用于分享",
      keywords: ["copy", "share", "url", "link"],
      run: action(copyPageUrl)
    }
  ];

  const fallbackDesc = isJapanese()
    ? "このページでは UI がないため、設定のみ保存しました。"
    : "当前页无对应控件，已仅保存偏好设置。";

  const accentNames = {
    neon: isJapanese() ? "ネオン" : "霓虹",
    sakura: isJapanese() ? "サクラ" : "樱花",
    ocean: isJapanese() ? "オーシャン" : "海蓝",
    amber: isJapanese() ? "アンバー" : "琥珀"
  } as const;

  const buildAccentCommand = (mode: keyof typeof accentNames): Command => ({
    id: `accent_${mode}`,
    group: "views",
    title: isJapanese() ? `アクセント：${accentNames[mode]}` : `强调色：${accentNames[mode]}`,
    desc: isJapanese() ? "Accent color" : "Accent color",
    keywords: ["accent", String(mode), accentNames[mode], "theme", "color"],
    run: action(() => {
      const ok = setAccentMode(mode);
      close();
      toast({
        title: isJapanese() ? `アクセント：${accentNames[mode]}` : `强调色：${accentNames[mode]}`,
        desc: ok ? undefined : fallbackDesc,
        variant: "success",
        timeoutMs: 1400
      });
      try {
        track({ type: "accent_set", data: { accent: mode } });
      } catch {
        // ignore
      }
    })
  });

  const currentAccent = getAccentMode();
  const accentOrder: Array<keyof typeof accentNames> = ["neon", "sakura", "ocean", "amber"];
  const accentSorted = [currentAccent, ...accentOrder.filter((x) => x !== currentAccent)] as Array<
    keyof typeof accentNames
  >;
  commands.push(...accentSorted.map((m) => buildAccentCommand(m)));

  commands.push({
    id: "view_preset_manage",
    group: "views",
    title: isJapanese() ? "ビューのプリセット" : "视图预设",
    desc: isJapanese() ? "保存/適用/リンク" : "保存/应用/链接",
    keywords: ["view", "preset", "saved", "layout", "density", "accent", "视图", "预设"],
    run: action(() => {
      close();
      openViewPresetManager();
    })
  });

  const presets = loadViewPresets();
  for (const p of presets) {
    commands.push({
      id: `view_preset_apply_${p.id}`,
      group: "views",
      title: isJapanese() ? `ビュー：${p.name}` : `视图：${p.name}`,
      desc: p.hint || (isJapanese() ? "保存したビュー" : "已保存视图"),
      keywords: ["view", "preset", p.name, p.hint].filter((x): x is string => Boolean(x)),
      run: action(() => {
        close();
        const ok = applyViewPreset(p.id);
        toast({
          title: ok
            ? isJapanese()
              ? "適用しました"
              : "已应用"
            : isJapanese()
              ? "適用に失敗しました"
              : "应用失败",
          desc: p.name,
          variant: ok ? "success" : "error",
          timeoutMs: ok ? 1400 : 2200
        });
        try {
          track({ type: "view_preset_apply", data: { id: p.id, from: "cmdk" } });
        } catch {
          // ignore
        }
      })
    });
  }

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
