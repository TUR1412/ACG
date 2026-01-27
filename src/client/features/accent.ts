import { STORAGE_KEYS } from "../constants";
import { loadString, saveString } from "../state/storage";
import { syncRadioGroupsFromButtons } from "../ui/radiogroup";
import { track } from "../utils/telemetry";

export type AccentMode = "neon" | "sakura" | "ocean" | "amber";

export function normalizeAccentMode(value: unknown): AccentMode {
  return value === "neon" || value === "sakura" || value === "ocean" || value === "amber" ? value : "neon";
}

export function loadAccentMode(): AccentMode {
  try {
    return normalizeAccentMode(loadString(STORAGE_KEYS.ACCENT));
  } catch {
    return "neon";
  }
}

export function saveAccentMode(mode: AccentMode) {
  try {
    saveString(STORAGE_KEYS.ACCENT, mode);
  } catch {
    // ignore
  }
}

export function applyAccentMode(mode: AccentMode) {
  try {
    document.documentElement.dataset.acgAccent = mode;
  } catch {
    // ignore
  }
}

export function wireAccentMode() {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-accent-mode]")];

  const apply = (mode: AccentMode) => {
    applyAccentMode(mode);
    for (const btn of buttons) {
      const active = (btn.dataset.accentMode ?? "") === mode;
      btn.dataset.active = active ? "true" : "false";
      btn.setAttribute("aria-checked", active ? "true" : "false");
    }
    syncRadioGroupsFromButtons(buttons);
    document.dispatchEvent(new CustomEvent("acg:accent-changed", { detail: { mode, accent: mode } }));
  };

  const mode = loadAccentMode();
  apply(mode);

  if (buttons.length > 0) {
    document.addEventListener("click", (e) => {
      if (e.defaultPrevented) return;
      if (!(e.target instanceof HTMLElement)) return;
      const el = e.target.closest<HTMLButtonElement>("[data-accent-mode]");
      if (!el) return;
      e.preventDefault();
      const next = normalizeAccentMode(el.dataset.accentMode);
      saveAccentMode(next);
      apply(next);
      track({ type: "accent_changed", data: { mode: next } });
    });
  }
}
