export type ParsedQuery = {
  text: string[];
  notText: string[];
  tags: string[];
  notTags: string[];
  sources: string[];
  notSources: string[];
  categories: string[];
  notCategories: string[];
  afterMs: number | null;
  beforeMs: number | null;
  isRead: boolean | null;
  isUnread: boolean | null;
  isFresh: boolean | null;
};

export const QUERY_CATEGORY_ALIASES: Record<string, string> = {
  anime: "anime",
  动画: "anime",
  アニメ: "anime",
  game: "game",
  游戏: "game",
  ゲーム: "game",
  goods: "goods",
  周边: "goods",
  周邊: "goods",
  グッズ: "goods",
  seiyuu: "seiyuu",
  声优: "seiyuu",
  声優: "seiyuu"
};

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\u3000/g, " ")
    .replace(/[\u200b-\u200d\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeQuery(raw: string): string[] {
  const out: string[] = [];
  const s = raw.trim();
  if (!s) return out;

  const re = /"([^"]+)"|'([^']+)'|(\S+)/g;
  for (const m of s.matchAll(re)) {
    const token = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (token) out.push(token);
  }
  return out;
}

export function parseDateToMs(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

export function parseQuery(raw: string): ParsedQuery {
  const out: ParsedQuery = {
    text: [],
    notText: [],
    tags: [],
    notTags: [],
    sources: [],
    notSources: [],
    categories: [],
    notCategories: [],
    afterMs: null,
    beforeMs: null,
    isRead: null,
    isUnread: null,
    isFresh: null
  };

  const tokens = tokenizeQuery(raw);
  for (const tokenRaw of tokens) {
    const negative = tokenRaw.startsWith("-");
    const token = (negative ? tokenRaw.slice(1) : tokenRaw).trim();
    if (!token) continue;

    const parts = token.split(":");
    const keyRaw = parts.length >= 2 ? parts[0] : "";
    const valueRaw = parts.length >= 2 ? parts.slice(1).join(":") : token;
    const key = normalizeText(keyRaw);
    const value = normalizeText(valueRaw);
    if (!value) continue;

    const push = (arr: string[]) => arr.push(value);

    if (key === "tag" || key === "t") {
      if (negative) push(out.notTags);
      else push(out.tags);
      continue;
    }

    if (key === "source" || key === "s") {
      if (negative) push(out.notSources);
      else push(out.sources);
      continue;
    }

    if (key === "cat" || key === "c" || key === "category") {
      const mapped = QUERY_CATEGORY_ALIASES[value] ?? value;
      if (negative) out.notCategories.push(mapped);
      else out.categories.push(mapped);
      continue;
    }

    if (key === "after" || key === "since") {
      const t = parseDateToMs(valueRaw);
      if (t != null) out.afterMs = t;
      continue;
    }

    if (key === "before" || key === "until") {
      const t = parseDateToMs(valueRaw);
      if (t != null) out.beforeMs = t;
      continue;
    }

    if (key === "is") {
      if (value === "read") {
        out.isRead = !negative;
        out.isUnread = negative ? true : null;
      } else if (value === "unread" || value === "new") {
        out.isUnread = !negative;
        out.isRead = negative ? true : null;
      } else if (value === "fresh") {
        out.isFresh = !negative;
      }
      continue;
    }

    if (negative) out.notText.push(value);
    else out.text.push(value);
  }

  return out;
}
