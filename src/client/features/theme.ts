import { STORAGE_KEYS } from "../constants";
import { loadString, saveString } from "../state/storage";
import { syncRadioGroupsFromButtons } from "../ui/radiogroup";

export type ThemeMode = "auto" | "light" | "dark";

const THEME_COLOR = {
  LIGHT: "#f6f7fb",
  DARK: "#04070f"
} as const;

function prefersColorSchemeDark(): boolean {
  try {
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  } catch {
    return false;
  }
}

export function loadThemeMode(): ThemeMode {
  try {
    const raw = loadString(STORAGE_KEYS.THEME);
    return raw === "light" || raw === "dark" || raw === "auto" ? raw : "auto";
  } catch {
    return "auto";
  }
}

export function saveThemeMode(mode: ThemeMode) {
  try {
    saveString(STORAGE_KEYS.THEME, mode);
  } catch {
    // ignore
  }
}

function resolveThemeIsDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return prefersColorSchemeDark();
}

function syncThemeColor(isDark: boolean) {
  try {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) return;
    meta.content = isDark ? THEME_COLOR.DARK : THEME_COLOR.LIGHT;
  } catch {
    // ignore
  }
}

export function applyThemeMode(mode: ThemeMode) {
  try {
    document.documentElement.dataset.acgTheme = mode;
  } catch {
    // ignore
  }
  syncThemeColor(resolveThemeIsDark(mode));
}

export function wireThemeMode() {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-theme-mode]")];
  const toggles = [...document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]")];

  const labelFor = (el: HTMLElement, mode: ThemeMode): string => {
    const name = el.dataset.themeLabelName ?? "Theme";
    const auto = el.dataset.themeLabelAuto ?? "Auto";
    const light = el.dataset.themeLabelLight ?? "Light";
    const dark = el.dataset.themeLabelDark ?? "Dark";
    const modeLabel = mode === "dark" ? dark : mode === "light" ? light : auto;
    return `${name}: ${modeLabel}`;
  };

  const apply = (mode: ThemeMode) => {
    applyThemeMode(mode);
    for (const btn of buttons) {
      const active = (btn.dataset.themeMode ?? "") === mode;
      btn.dataset.active = active ? "true" : "false";
      btn.setAttribute("aria-checked", active ? "true" : "false");
    }
    syncRadioGroupsFromButtons(buttons);
    for (const el of toggles) {
      const title = labelFor(el, mode);
      el.title = title;
      const text = el.querySelector<HTMLElement>("[data-theme-toggle-text]");
      if (text) {
        const auto = el.dataset.themeLabelAuto ?? "Auto";
        const light = el.dataset.themeLabelLight ?? "Light";
        const dark = el.dataset.themeLabelDark ?? "Dark";
        text.textContent = mode === "dark" ? dark : mode === "light" ? light : auto;
      }
    }
  };

  const mode = loadThemeMode();
  apply(mode);

  if (buttons.length > 0) {
    document.addEventListener("click", (e) => {
      if (e.defaultPrevented) return;
      if (!(e.target instanceof HTMLElement)) return;
      const el = e.target.closest<HTMLButtonElement>("[data-theme-mode]");
      if (!el) return;
      const next = el.dataset.themeMode;
      if (next !== "auto" && next !== "light" && next !== "dark") return;
      e.preventDefault();
      saveThemeMode(next);
      apply(next);
    });
  }

  for (const el of toggles) {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const current = loadThemeMode();
      const next: ThemeMode = current === "auto" ? "light" : current === "light" ? "dark" : "auto";
      saveThemeMode(next);
      apply(next);
    });
  }

  const mq = (() => {
    try {
      return window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return null;
    }
  })();
  if (!mq) return;

  const onChange = () => {
    const current = loadThemeMode();
    if (current !== "auto") return;
    syncThemeColor(resolveThemeIsDark(current));
  };

  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", onChange);
  } else {
    // Safari（legacy API）
    const legacy = (mq as unknown as { addListener?: (cb: () => void) => void }).addListener;
    if (typeof legacy === "function") legacy.call(mq, onChange);
  }
}
