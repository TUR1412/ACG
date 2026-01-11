import { STORAGE_KEYS } from "../constants";

type RawEvent = Record<string, unknown>;

type ViewEvent = {
  type: string;
  at: string;
  path: string;
  lang?: string;
  device?: string;
  data?: Record<string, unknown>;
  raw: RawEvent;
};

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readEvents(): { raw: string; events: ViewEvent[] } {
  let raw = "";
  try {
    raw = localStorage.getItem(STORAGE_KEYS.TELEMETRY) ?? "";
  } catch {
    raw = "";
  }

  if (!raw) return { raw, events: [] };

  const parsed = safeJsonParse<{ version?: unknown; events?: unknown }>(raw);
  const version = typeof parsed?.version === "number" ? parsed.version : 0;
  const list = version === 1 && Array.isArray(parsed?.events) ? parsed?.events : [];

  const events: ViewEvent[] = [];
  for (const item of list as unknown[]) {
    if (!item || typeof item !== "object") continue;
    const obj = item as RawEvent;
    const type = typeof obj.type === "string" ? obj.type : "";
    const at = typeof obj.at === "string" ? obj.at : "";
    const path = typeof obj.path === "string" ? obj.path : "";
    if (!type || !at) continue;

    events.push({
      type,
      at,
      path,
      lang: typeof obj.lang === "string" ? obj.lang : undefined,
      device: typeof obj.device === "string" ? obj.device : undefined,
      data: obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : undefined,
      raw: obj
    });
  }

  return { raw, events };
}

function normalizeText(raw: unknown): string {
  return typeof raw === "string" ? raw : String(raw ?? "");
}

function formatAtIso(iso: string): string {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return iso;
    const isJa = (document.documentElement.lang || "").toLowerCase().startsWith("ja");
    const locale = isJa ? "ja-JP" : "zh-CN";
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(d);
  } catch {
    return iso;
  }
}

function shouldKeep(ev: ViewEvent, q: string): boolean {
  if (!q) return true;
  const query = q.toLowerCase();
  const hay = [
    ev.type,
    ev.path,
    ev.lang ?? "",
    ev.device ?? "",
    (() => {
      try {
        return ev.data ? JSON.stringify(ev.data) : "";
      } catch {
        return "";
      }
    })()
  ]
    .join("\n")
    .toLowerCase();
  return hay.includes(query);
}

function renderEvent(ev: ViewEvent): HTMLElement {
  const details = document.createElement("details");
  details.className = "rounded-2xl border border-slate-900/10 bg-white/45 p-3";

  const summary = document.createElement("summary");
  summary.className = "cursor-pointer select-none";

  const head = document.createElement("div");
  head.className = "flex flex-wrap items-center justify-between gap-2";

  const left = document.createElement("div");
  left.className = "flex min-w-0 flex-wrap items-center gap-2";

  const chip = document.createElement("span");
  chip.className = "acg-chip inline-flex max-w-[28ch] items-center truncate rounded-full px-3 py-1 text-[11px] font-semibold";
  chip.textContent = ev.type;
  left.appendChild(chip);

  const path = document.createElement("span");
  path.className = "max-w-[52ch] truncate font-mono text-[11px] text-slate-600";
  path.textContent = ev.path || "/";
  left.appendChild(path);

  const right = document.createElement("div");
  right.className = "flex items-center gap-2 text-[11px] text-slate-600";

  const meta = document.createElement("span");
  const lang = ev.lang ? ev.lang.toUpperCase() : "";
  const device = ev.device ? ev.device : "";
  meta.textContent = [lang, device].filter(Boolean).join(" · ");
  right.appendChild(meta);

  const time = document.createElement("span");
  time.textContent = formatAtIso(ev.at);
  right.appendChild(time);

  head.appendChild(left);
  head.appendChild(right);
  summary.appendChild(head);
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "mt-3 grid gap-2";

  const pre = document.createElement("pre");
  pre.className = "overflow-x-auto rounded-xl border border-slate-900/10 bg-white/60 p-3 text-[11px] leading-relaxed text-slate-900";
  pre.textContent = (() => {
    try {
      return JSON.stringify(ev.raw, null, 2);
    } catch {
      return normalizeText(ev.raw);
    }
  })();
  body.appendChild(pre);

  details.appendChild(body);
  return details;
}

export function wireTelemetryViewer() {
  const root = document.querySelector<HTMLElement>("[data-telemetry-viewer]");
  if (!root) return;

  const input = document.querySelector<HTMLInputElement>("#acg-telemetry-filter");
  const list = document.querySelector<HTMLElement>("#acg-telemetry-events");
  const empty = document.querySelector<HTMLElement>("#acg-telemetry-empty");
  if (!list) return;

  let lastRaw = "";
  let lastQuery = "";

  const render = () => {
    const q = (input?.value ?? "").trim();
    const { raw, events } = readEvents();
    const changed = raw !== lastRaw || q !== lastQuery;
    if (!changed) return;

    lastRaw = raw;
    lastQuery = q;

    const filtered = events
      .slice()
      .reverse()
      .filter((ev) => shouldKeep(ev, q));

    try {
      list.replaceChildren(...filtered.map((ev) => renderEvent(ev)));
    } catch {
      // ignore
    }

    try {
      if (empty) empty.classList.toggle("hidden", filtered.length > 0);
    } catch {
      // ignore
    }
  };

  render();

  input?.addEventListener("input", () => {
    render();
  });

  document.querySelector("#acg-telemetry-clear")?.addEventListener("click", () => {
    // clear action is handled elsewhere; here we only refresh list.
    window.setTimeout(render, 0);
  });

  document.querySelector("#acg-telemetry-export")?.addEventListener("click", () => {
    // export action may append telemetry_export event; refresh list after it completes.
    window.setTimeout(render, 0);
  });
}
