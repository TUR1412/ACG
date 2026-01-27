function syncRadioGroupTabStops(group: HTMLElement) {
  const radios = [...group.querySelectorAll<HTMLButtonElement>("[role=radio]")];
  if (radios.length === 0) return;
  const checked = radios.find((b) => b.getAttribute("aria-checked") === "true") ?? null;
  const focusable = checked ?? radios[0];
  for (const btn of radios) {
    btn.tabIndex = btn === focusable ? 0 : -1;
  }
}

export function syncRadioGroupsFromButtons(buttons: HTMLButtonElement[]) {
  const groups = new Set<HTMLElement>();
  for (const btn of buttons) {
    const group = btn.closest<HTMLElement>("[role=radiogroup]");
    if (group) groups.add(group);
  }
  for (const group of groups) syncRadioGroupTabStops(group);
}

export function wireRadioGroupKeyboardNav() {
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (!(e.target instanceof HTMLElement)) return;

    const key = e.key;
    if (
      key !== "ArrowLeft" &&
      key !== "ArrowRight" &&
      key !== "ArrowUp" &&
      key !== "ArrowDown" &&
      key !== "Home" &&
      key !== "End"
    ) {
      return;
    }

    const radio = e.target.closest<HTMLButtonElement>("[role=radio]");
    if (!radio) return;
    const group = radio.closest<HTMLElement>("[role=radiogroup]");
    if (!group) return;

    const radios = [...group.querySelectorAll<HTMLButtonElement>("[role=radio]")];
    if (radios.length === 0) return;
    const current = radios.includes(radio) ? radio : radios[0];
    const idx = Math.max(0, radios.indexOf(current));

    const nextIdx =
      key === "Home"
        ? 0
        : key === "End"
          ? radios.length - 1
          : key === "ArrowLeft" || key === "ArrowUp"
            ? (idx + radios.length - 1) % radios.length
            : (idx + 1) % radios.length;

    const next = radios[nextIdx];
    if (!next || next === current) return;
    e.preventDefault();
    try {
      next.focus();
    } catch {
      // ignore
    }
    try {
      next.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    } catch {
      try {
        next.click();
      } catch {
        // ignore
      }
    }
  });
}
