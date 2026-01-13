export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // ignore
  }

  let ta: HTMLTextAreaElement | null = null;
  const prevActive = (() => {
    try {
      return document.activeElement instanceof HTMLElement ? document.activeElement : null;
    } catch {
      return null;
    }
  })();

  try {
    if (!document.body) return false;
    ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.setAttribute("aria-hidden", "true");
    ta.tabIndex = -1;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      ta.setSelectionRange(0, ta.value.length);
    } catch {
      // ignore
    }
    return (
      (document as unknown as { execCommand?: (commandId: string) => boolean }).execCommand?.("copy") ?? false
    );
  } catch {
    return false;
  } finally {
    try {
      ta?.remove();
    } catch {
      // ignore
    }
    try {
      prevActive?.focus();
    } catch {
      // ignore
    }
  }
}
