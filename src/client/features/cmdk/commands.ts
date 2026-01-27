import { href } from "../../../lib/href";
import { STORAGE_KEYS } from "../../constants";
import { loadString, safeJsonParse, saveString } from "../../state/storage";
import { copyToClipboard } from "../../utils/clipboard";
import { isJapanese } from "../../utils/lang";
import { track } from "../../utils/telemetry";
import { toCommandViews } from "./query";
import { parseViewPresetSummaries } from "./view-presets";
import type { Command, CommandView, ToastParams } from "./types";

function toast(params: ToastParams) {
  try {
    document.dispatchEvent(new CustomEvent("acg:toast", { detail: params }));
  } catch {
    // ignore
  }
}

export function buildCommands(params: { close: () => void }): CommandView[] {
  const { close } = params;
  const lang = isJapanese() ? "ja" : "zh";
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
      const raw = loadString(STORAGE_KEYS.VIEW_MODE);
      return raw === "grid" || raw === "list" ? raw : "grid";
    } catch {
      return "grid";
    }
  };

  const setViewMode = (mode: "grid" | "list"): boolean => {
    const ok = click(`[data-view-mode="${mode}"]`);
    if (ok) return true;
    try {
      saveString(STORAGE_KEYS.VIEW_MODE, mode);
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
      const raw = loadString(STORAGE_KEYS.DENSITY);
      return raw === "comfort" || raw === "compact" ? raw : "comfort";
    } catch {
      return "comfort";
    }
  };

  const setDensityMode = (mode: "comfort" | "compact"): boolean => {
    const ok = click(`[data-density-mode="${mode}"]`);
    if (ok) return true;
    try {
      saveString(STORAGE_KEYS.DENSITY, mode);
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
      const raw = loadString(STORAGE_KEYS.ACCENT);
      return raw === "neon" || raw === "sakura" || raw === "ocean" || raw === "amber" ? raw : "neon";
    } catch {
      return "neon";
    }
  };

  const setAccentMode = (mode: "neon" | "sakura" | "ocean" | "amber"): boolean => {
    const ok = click(`[data-accent-mode="${mode}"]`);
    if (ok) return true;
    try {
      saveString(STORAGE_KEYS.ACCENT, mode);
    } catch {
      // ignore
    }
    try {
      document.documentElement.dataset.acgAccent = mode;
    } catch {
      // ignore
    }
    try {
      document.dispatchEvent(new CustomEvent("acg:accent-changed", { detail: { mode, accent: mode } }));
    } catch {
      // ignore
    }
    return false;
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

  const presets = parseViewPresetSummaries(safeJsonParse<unknown>(loadString(STORAGE_KEYS.VIEW_PRESETS)));
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

  return toCommandViews(commands);
}
