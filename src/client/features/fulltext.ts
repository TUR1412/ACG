/**
 * 全文预览（lazy chunk）
 *
 * 目标：把“全文抽取/清洗/渲染/翻译”这一大块逻辑从主包中拆出来，
 * 仅在页面存在 `[data-fulltext]` 时按需加载，降低首页/分类页首包体积与解析成本。
 */
import { bestInitialCoverSrc } from "../utils/cover";
import { isJapanese } from "../utils/lang";
import { NETWORK } from "../constants";
import { httpFetch } from "../utils/http";

type FullTextLang = "zh" | "ja";

type FullTextWorkerRenderMessage = {
  type: "render";
  requestId: number;
  md: string;
  baseUrl: string;
};

type FullTextWorkerTranslateMessage = {
  type: "translate";
  requestId: number;
  text: string;
  target: FullTextLang;
  timeoutMs: number;
};

type FullTextWorkerInMessage = FullTextWorkerRenderMessage | FullTextWorkerTranslateMessage;

type FullTextWorkerRenderResultMessage = {
  type: "render_result";
  requestId: number;
  html: string;
  blocks?: string[];
};

type FullTextWorkerTranslateResultMessage = {
  type: "translate_result";
  requestId: number;
  translated: string;
};

type FullTextWorkerProgressMessage = {
  type: "progress";
  requestId: number;
  done: number;
  total: number;
};

type FullTextWorkerErrorMessage = {
  type: "error";
  requestId?: number;
  phase?: "render" | "translate";
  message: string;
};

type FullTextWorkerOutMessage =
  | FullTextWorkerRenderResultMessage
  | FullTextWorkerTranslateResultMessage
  | FullTextWorkerProgressMessage
  | FullTextWorkerErrorMessage;

const FULLTEXT_CACHE_MAX_CHARS = 160_000;
const FULLTEXT_REQUEST_TIMEOUT_MS = 22_000;
const FULLTEXT_STATUS_FLASH_MS = 1600;
const FULLTEXT_POSTPROCESS_IDLE_TIMEOUT_MS = 1600;
const FULLTEXT_AUTO_TRANSLATE_SCROLL_DELAY_MS = 260;

function isLowPerfMode(): boolean {
  try {
    return document.documentElement.dataset.acgPerf === "low";
  } catch {
    return false;
  }
}

function isScrollingNow(): boolean {
  try {
    return document.documentElement.dataset.acgScroll === "1";
  } catch {
    return false;
  }
}

function runWhenIdle(task: () => void, timeoutMs: number) {
  try {
    type RequestIdleCallbackLike = (cb: (deadline?: unknown) => void, opts?: { timeout?: number }) => number;
    const ric = (window as unknown as { requestIdleCallback?: RequestIdleCallbackLike }).requestIdleCallback;
    if (typeof ric === "function") {
      ric(
        () => {
          try {
            task();
          } catch {
            // ignore
          }
        },
        { timeout: timeoutMs }
      );
      return;
    }
  } catch {
    // ignore
  }

  window.setTimeout(
    () => {
      try {
        task();
      } catch {
        // ignore
      }
    },
    Math.min(80, Math.max(0, timeoutMs))
  );
}

type IdleDeadlineLike = {
  timeRemaining?: () => number;
  didTimeout?: boolean;
};

function runDuringIdle(task: (deadline?: IdleDeadlineLike) => void, timeoutMs: number) {
  try {
    type RequestIdleCallbackLike = (
      cb: (deadline: IdleDeadlineLike) => void,
      opts?: { timeout?: number }
    ) => number;
    const ric = (window as unknown as { requestIdleCallback?: RequestIdleCallbackLike }).requestIdleCallback;
    if (typeof ric === "function") {
      ric(
        (deadline) => {
          try {
            task(deadline);
          } catch {
            // ignore
          }
        },
        { timeout: timeoutMs }
      );
      return;
    }
  } catch {
    // ignore
  }

  window.setTimeout(
    () => {
      try {
        task();
      } catch {
        // ignore
      }
    },
    Math.min(80, Math.max(0, timeoutMs))
  );
}

type FullTextCacheEntry = {
  url: string;
  fetchedAt: string;
  original: string;
  zh?: string;
  ja?: string;
};

// v3：当“全文预览”的抽取/清洗策略发生结构性变化时，升级缓存版本，避免用户长期被旧的错误正文污染。
// 说明：这里采用“硬失效”策略（不自动迁移旧缓存），确保修复能立刻在所有页面生效，而不需要用户手动点「重新加载」或清空缓存。
const FULLTEXT_CACHE_PREFIX = "acg.fulltext.v6:";

function fullTextCacheKey(postId: string): string {
  return `${FULLTEXT_CACHE_PREFIX}${postId}`;
}

function readFullTextCache(postId: string): FullTextCacheEntry | null {
  const parse = (raw: string | null): FullTextCacheEntry | null => {
    if (!raw) return null;
    try {
      const json = JSON.parse(raw) as unknown;
      if (!json || typeof json !== "object") return null;
      const it = json as Record<string, unknown>;
      if (typeof it.original !== "string" || typeof it.url !== "string") return null;
      return {
        url: it.url,
        fetchedAt: typeof it.fetchedAt === "string" ? it.fetchedAt : "",
        original: it.original,
        zh: typeof it.zh === "string" ? it.zh : undefined,
        ja: typeof it.ja === "string" ? it.ja : undefined
      } satisfies FullTextCacheEntry;
    } catch {
      return null;
    }
  };

  return parse(localStorage.getItem(fullTextCacheKey(postId)));
}

function writeFullTextCache(postId: string, entry: FullTextCacheEntry) {
  try {
    // 保护：避免 localStorage 被超大正文撑爆（不同浏览器配额不同）
    // 策略：优先保证“原文”可缓存；若总体过大，则丢弃翻译缓存（翻译可重新生成）。
    const sizeOf = (it: FullTextCacheEntry) =>
      it.original.length + (it.zh?.length ?? 0) + (it.ja?.length ?? 0);

    const base: FullTextCacheEntry = {
      url: entry.url,
      fetchedAt: entry.fetchedAt,
      original: entry.original
    };
    if (sizeOf(base) > FULLTEXT_CACHE_MAX_CHARS) return;

    const toWrite = sizeOf(entry) <= FULLTEXT_CACHE_MAX_CHARS ? entry : base;
    localStorage.setItem(fullTextCacheKey(postId), JSON.stringify(toWrite));
  } catch {
    // ignore
  }
}

function parseJinaMarkdown(raw: string): string {
  const marker = "Markdown Content:";
  const i = raw.indexOf(marker);
  const md = i >= 0 ? raw.slice(i + marker.length) : raw;
  return md.replace(/\r\n/g, "\n").trim();
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function applyBasicEmphasis(escaped: string): string {
  // 注意：这里输入必须是“已 escape”的字符串，保证安全。
  let s = escaped;

  // Bold: **text**
  s = s.replace(/\*\*([^\n*][^*\n]*?)\*\*/g, "<strong>$1</strong>");

  // Italic: _text_（多数抓取/翻译会用下划线包裹作品名）
  s = s.replace(/_([^\n_][^_\n]*?)_/g, "<em>$1</em>");

  // Italic: *text*（尽量保守，避免和列表/符号冲突）
  s = s.replace(/(^|[^*])\*([^\n*][^*\n]*?)\*(?!\*)/g, "$1<em>$2</em>");

  return s;
}

function safeHttpUrl(raw: string, baseUrl: string): string | null {
  let cleaned = raw.trim().replace(/\s+/g, "");
  // 兼容尾部粘连标点/编码标点（尤其是 `）` / `】` / `」` 这类全角符号）
  cleaned = stripEncodedTrailingPunct(trimUrlTrailingPunct(cleaned).url);
  try {
    const u = new URL(cleaned, baseUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function normalizeFullTextMarkdown(md: string): string {
  let text = md.replace(/\r\n/g, "\n").trim();
  // 兼容一些来源的“项目符号 + 标题”写法：`* #### ...` -> `#### ...`
  text = text.replace(/^\s*[*-]\s+(#{1,6}\s+)/gm, "$1");
  // 兼容中文书名号样式链接：`【标题】(url)` -> `[标题](url)`
  text = text.replace(/【([^\n\r]+?)】\((https?:\/\/[^)\s]+)\)/g, "[$1]($2)");
  // 修复“链接 URL 被换行/空白打断”的情况：把 `](` 到 `)` 之间的空白去掉
  text = text.replace(/\]\(([^)]+)\)/g, (_m, url) => `](${String(url).replace(/\s+/g, "")})`);

  // 修复少数来源会把 URL 本体在换行处截断：`https://.../new\ns/...` -> `https://.../news/...`
  // 只在“下一行开头很像 path continuation（短前缀 + /）”时拼接，避免误伤正常段落换行。
  text = text.replace(/(https?:\/\/[^\s)\]]+)\n+([A-Za-z0-9._-]{0,16}\/[^\s)\]]+)/g, "$1$2");

  // 站点脏数据修复：少数来源（例如 ANN 的图片 credit）会输出形如 `[[label](url)]]` 的“多括号”。
  // 这会破坏我们的 Markdown 渲染（并在 UI 中出现 `]]` 等杂质），因此在归一化阶段强行修正。
  text = text.replace(/\[\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)\]\]/g, "[$1]($2)");
  text = text.replace(/\[\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)\]/g, "[$1]($2)");

  // 兜底：如果内部占位符意外泄漏到 Markdown，直接清除（不应出现在用户内容里）
  // 兼容：大小写变化 / 中间被插入空白 / 全角 @ 等异常形态
  // 注：部分抽取器/翻译会插入零宽空白（U+200B/U+FEFF），导致 `\s` 匹配不稳定，这里显式覆盖。
  text = text.replace(
    /@@[\s\u200B\uFEFF]*ACG[\s\u200B\uFEFF]*TOKEN[\s\u200B\uFEFF]*\d+[\s\u200B\uFEFF]*@@/gi,
    ""
  );
  text = text.replace(
    /＠＠[\s\u200B\uFEFF]*ACG[\s\u200B\uFEFF]*TOKEN[\s\u200B\uFEFF]*\d+[\s\u200B\uFEFF]*＠＠/gi,
    ""
  );

  // 清理“孤立括号/标点”噪音行（常由链接换行或抽取器残留导致）
  text = text.replace(/^\s*[)\]】」）]\s*$/gm, "");
  text = text.replace(/^\s*[[（(【「『]\s*$/gm, "");

  // 清理“无意义的纯数字”项目符号（常见于脚注/引用残留，如 `- 1`）
  text = text.replace(/^\s*[-*]\s+\d+\s*$/gm, "");

  // 更激进：移除常见的“站点尾部导航/讨论/档案”残留（尤其是 ANN）
  // 这些内容属于页面壳，而非正文；如果混入全文预览，会显得非常杂乱。
  const annHost = String.raw`(?:www\.)?animenewsnetwork\.com`;
  // 例：`[News homepage](https://www.animenewsnetwork.com/news/) / [archives](https://www.animenewsnetwork.com/news/archive)`
  text = text.replace(
    new RegExp(
      String.raw`^\s*(?:\[[^\]]+\]\(https?:\/\/${annHost}\/news\/\)\s*\/\s*)?\[[^\]]+\]\(https?:\/\/${annHost}\/news\/archive[^)]*\)\s*$`,
      "gmi"
    ),
    ""
  );
  // 例：`[discuss this in the forum](https://www.animenewsnetwork.com/cms/discuss/232153)`
  text = text.replace(
    new RegExp(String.raw`^\s*\[[^\]]+\]\(https?:\/\/${annHost}\/cms\/discuss\/[^)]*\)\s*$`, "gmi"),
    ""
  );

  // 更激进：清理“正文尾部的纯链接/孤立分隔符”噪音（常见于阅读模式/抽取器把页脚/推荐/图片页链接带进来）。
  // 注：站点原文入口已经由页面底部「打开原文」提供，这里宁可删多一点，也不要把正文尾巴污染成链接堆。
  const lines = text.split("\n");
  const isTrailingJunkLine = (raw: string): boolean => {
    const s = raw.trim();
    if (!s) return true;
    if (/^[|/\\]+$/.test(s)) return true;
    if (looksLikeUrlText(s)) return true;
    const m = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*$/.exec(s);
    if (m?.[2]) {
      const label = (m[1] ?? "").trim();
      const href = (m[2] ?? "").trim();
      if (!label) return true;
      if (looksLikeUrlText(label)) return true;
      if (isMostlyUrlLabel(label, href)) return true;
      if (label.length <= 2) return true;
    }
    return false;
  };
  let end = lines.length;
  while (end > 0 && isTrailingJunkLine(lines[end - 1] ?? "")) end -= 1;
  text = lines.slice(0, end).join("\n");

  // 删除明显的“追踪像素/用户同步”图片（常见于部分站点页脚/广告脚本残留）。
  // 这些图片对阅读价值为 0，且会把全文预览变成一串大图/破图，极其影响观感。
  const isTrackingImageLine = (raw: string): boolean => {
    const s = raw.trim();
    if (!s) return false;
    const m = /^!\[[^\]]*\]\(([^)]+)\)\s*$/.exec(s);
    if (!m?.[1]) return false;
    const href = String(m[1]).trim().toLowerCase();
    if (!href) return false;
    if (href.startsWith("data:image/gif")) return true;
    const bad = [
      "imgvc.com/i/bf.png",
      "sync.intentiq.com/profiles_engine",
      "intentiq.com/profiles_engine",
      "sync.adkernel.com/user-sync",
      "creativecdn.com/cm-notify",
      "u.4dex.io/setuid",
      "doubleclick.net",
      "adservice.google.com",
      "adsystem.com"
    ];
    return bad.some((x) => href.includes(x));
  };
  text = text
    .split("\n")
    .filter((l) => !isTrackingImageLine(l))
    .join("\n");

  // 合并空行
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

export function stripInternalPlaceholdersFromHtml(html: string): string {
  if (!html) return html;
  const zw = String.raw`[\s\u200B\uFEFF]*`;
  const num = String.raw`\d+`;
  const broken = String.raw`(?:<[^>]+>)*`;
  const atEntity = String.raw`(?:&#64;|&#x40;)`;
  return (
    html
      // 基础：@@ACGTOKEN0@@（允许空白/零宽空白）
      .replace(new RegExp(String.raw`@@${zw}ACG${zw}TOKEN${zw}${num}${zw}@@`, "gi"), "")
      .replace(new RegExp(String.raw`＠＠${zw}ACG${zw}TOKEN${zw}${num}${zw}＠＠`, "gi"), "")
      // entity 形态：&#64;&#64;ACGTOKEN0&#64;&#64;（某些 HTML->text 流程会转义 @）
      .replace(
        new RegExp(String.raw`${atEntity}{2}${zw}ACG${zw}TOKEN${zw}${num}${zw}${atEntity}{2}`, "gi"),
        ""
      )
      // 兜底：占位符被强调/杂质打断（例：`@@ACG<em>TOKEN</em>0@@`）
      .replace(new RegExp(String.raw`@@ACG${broken}TOKEN${broken}${zw}${num}${zw}${broken}@@`, "gi"), "")
      .replace(new RegExp(String.raw`＠＠ACG${broken}TOKEN${broken}${zw}${num}${zw}${broken}＠＠`, "gi"), "")
      .replace(
        new RegExp(
          String.raw`${atEntity}{2}ACG${broken}TOKEN${broken}${zw}${num}${zw}${broken}${atEntity}{2}`,
          "gi"
        ),
        ""
      )
  );
}

type InlineToken =
  | { type: "code"; text: string }
  | { type: "link"; text: string; href: string }
  | { type: "img"; alt: string; src: string; href: string; originalSrc?: string }
  | { type: "autolink"; href: string; host: string; path: string };

function splitUrlForDisplay(href: string): { host: string; path: string } {
  try {
    const u = new URL(href);
    const host = u.hostname.replace(/^www\./, "");
    const rawPath = `${u.pathname || ""}${u.search ? "?…" : ""}${u.hash ? "#…" : ""}`;
    if (!rawPath || rawPath === "/") return { host, path: "" };

    const maxLen = 52;
    const path =
      rawPath.length > maxLen ? `…${rawPath.slice(Math.max(0, rawPath.length - (maxLen - 1)))}` : rawPath;
    return { host, path };
  } catch {
    return { host: href, path: "" };
  }
}

function trimUrlTrailingPunct(raw: string): { url: string; trailing: string } {
  // 常见情况：句末标点/括号导致 URL “粘连”，需要拆开。
  // 规则：尽量保守，只剥离明显的结束标点；括号要做简单配对判断。
  let url = raw;
  let trailing = "";
  const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

  while (url.length > 0) {
    const ch = url[url.length - 1] ?? "";
    // 同时覆盖英文与常见全角标点（避免 `...html）` 之类的粘连）
    if (!/[)\]）］.,!?:;}"'»」】。，！？：；]/.test(ch)) break;

    if (ch === ")") {
      const open = count(url, /\(/g);
      const close = count(url, /\)/g);
      // 如果 close <= open，说明这个 ')' 可能是 URL 自身的一部分（例如 wikipedia 的括号页）
      if (close <= open) break;
    }
    if (ch === "）") {
      const open = count(url, /（/g);
      const close = count(url, /）/g);
      if (close <= open) break;
    }

    trailing = ch + trailing;
    url = url.slice(0, -1);
  }

  return { url, trailing };
}

function stripEncodedTrailingPunct(input: string): string {
  // 一些来源/翻译会把“句末括号/标点”带进 URL，且可能被百分号编码（例如 `%EF%BC%89`）。
  // 这里做“只剥离尾部明显噪音”的保守处理，尽量不误伤 URL 本体。
  let url = input;

  // 1) 先处理常见全角标点（多为正文标点，不太可能是 URL 必需部分）
  // - ） : %EF%BC%89
  // - 】 : %E3%80%91
  // - 」 : %E3%80%8D
  // - 。 : %E3%80%82
  // - ， : %EF%BC%8C
  // - ： : %EF%BC%9A
  // - ； : %EF%BC%9B
  // - ！ : %EF%BC%81
  // - ？ : %EF%BC%9F
  const fullwidthTail =
    /(?:%EF%BC%89|%E3%80%91|%E3%80%8D|%E3%80%82|%EF%BC%8C|%EF%BC%9A|%EF%BC%9B|%EF%BC%81|%EF%BC%9F)+$/i;
  url = url.replace(fullwidthTail, "");

  // 2) 再处理 ASCII 的“闭合符号”编码：仅在没有对应 opener 时才剥离，避免误伤 wiki 等合法括号 URL
  const pairs: Array<{ close: RegExp; open: RegExp }> = [
    { close: /%29$/i, open: /%28/i }, // )
    { close: /%5D$/i, open: /%5B/i }, // ]
    { close: /%7D$/i, open: /%7B/i } // }
  ];

  while (true) {
    let changed = false;
    for (const p of pairs) {
      if (p.close.test(url) && !p.open.test(url)) {
        url = url.replace(p.close, "");
        changed = true;
      }
    }
    if (!changed) break;
  }

  return url;
}

function normalizeUrlForCompare(href: string): string {
  // 用于“去重/聚合”的稳定比较键：忽略 query/hash，并剥离常见尾部括号噪音。
  const raw = href.trim();
  if (!raw) return "";

  // 先剥离可能粘连的“可见标点”
  const t = trimUrlTrailingPunct(raw);
  let cleaned = stripEncodedTrailingPunct(t.url);

  // 再剥离常见的“被百分号编码的标点”（例如文本里把 `）` 编成 `%EF%BC%89`）
  // 只在 URL 末尾出现时处理，避免误伤正文路径。
  const encodedTailRe = /(?:%29|%5D|%7D|%2C|%2E|%3A|%3B|%22|%27|%EF%BC%89|%E3%80%91|%E3%80%8D)+$/i;
  cleaned = cleaned.replace(encodedTailRe, "");

  try {
    const u = new URL(cleaned);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const pathname = (u.pathname || "/").replace(/\/+$/g, "/");
    return `${host}${pathname}`;
  } catch {
    return cleaned;
  }
}

function tryDeriveImageUrlFromLink(href: string): string | null {
  try {
    const u = new URL(href);
    const path = (u.pathname ?? "").toLowerCase();

    // direct image link
    if (/\.(png|jpe?g|webp|gif|avif)$/.test(path)) return u.toString();

    // inside-games “图片页”：/article/img/YYYY/MM/DD/<articleId>/<imageId>.html
    if (u.hostname.endsWith("inside-games.jp")) {
      const m = /\/article\/img\/\d{4}\/\d{2}\/\d{2}\/\d+\/(\d+)\.html$/i.exec(u.pathname ?? "");
      if (m?.[1]) return `https://www.inside-games.jp/imgs/ogp_f/${m[1]}.jpg`;
    }

    return null;
  } catch {
    return null;
  }
}

function looksLikeUrlText(text: string): boolean {
  const s = text.trim();
  if (!s) return false;
  if (/^https?:\/\//i.test(s)) return true;
  if (/^www\./i.test(s)) return true;
  if (s.includes("://")) return true;
  return false;
}

function isMostlyUrlLabel(label: string, href: string): boolean {
  const a = label.trim();
  const b = href.trim();
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.replace(/^https?:\/\//i, "") === b.replace(/^https?:\/\//i, "")) return true;
  return false;
}

function renderInlineMarkdown(input: string, baseUrl: string): string {
  const tokens: InlineToken[] = [];
  const push = (t: InlineToken) => {
    const id = tokens.length;
    tokens.push(t);
    // 注意：占位符里不要包含 "_" 或 "*"，否则会被 `applyBasicEmphasis()` 误判为 Markdown 强调语法，
    // 导致替换失败并把占位符直接渲染到页面上（例如 `@@ACGTOKEN0@@`）。
    return `@@ACGTOKEN${id}@@`;
  };

  let text = input;

  // code spans（先处理，避免把 code 里的 `[]()` 误当成链接）
  text = text.replace(/`([^`]+)`/g, (_m, code) => push({ type: "code", text: String(code) }));

  // images
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
    const abs = safeHttpUrl(String(url), baseUrl);
    if (!abs) return String(alt ?? "");
    const src = bestInitialCoverSrc(abs, 1200);
    return push({ type: "img", alt: String(alt ?? ""), src, href: abs });
  });

  // links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    const abs = safeHttpUrl(String(url), baseUrl);
    if (!abs) return String(label ?? "");
    const labelText = String(label ?? "").trim();

    // 更激进：对特定站点（尤其 ANN）的“百科/人物/公司/作品词条”链接，默认只保留文本，避免正文里一屏全是蓝链。
    // 这类链接属于站点内部增强信息，不是正文必要内容。
    try {
      const baseHost = new URL(baseUrl).hostname.toLowerCase();
      const u = new URL(abs);
      if (
        baseHost.endsWith("animenewsnetwork.com") &&
        u.hostname.toLowerCase().endsWith("animenewsnetwork.com")
      ) {
        const p = (u.pathname || "/").toLowerCase();
        if (p.startsWith("/encyclopedia/")) return labelText || abs;
      }
    } catch {
      // ignore
    }

    // 如果链接本质上是“图片/图片页”，就直接图文化（避免全文里出现一堆 [1](...) / [https://...](...)）
    const derivedImage = tryDeriveImageUrlFromLink(abs);
    if (derivedImage) {
      const numeric = /^\d+$/.test(labelText);
      const urlLike = looksLikeUrlText(labelText) || isMostlyUrlLabel(labelText, abs);
      const shortLabel = labelText.length <= 14;
      if (numeric || urlLike || shortLabel) {
        const src = bestInitialCoverSrc(derivedImage, 1200);
        return push({ type: "img", alt: "", src, href: abs, originalSrc: derivedImage });
      }
    }

    // 形如 [https://...](https://...)：渲染为链接卡片，而不是裸 URL 文本
    if (looksLikeUrlText(labelText) || isMostlyUrlLabel(labelText, abs)) {
      const parts = splitUrlForDisplay(abs);
      return push({ type: "autolink", href: abs, host: parts.host, path: parts.path });
    }

    return push({ type: "link", text: labelText, href: abs });
  });

  // auto-linkify：把纯 URL 变成可点击的“链接卡片”（不联网预取元信息，避免拖慢）
  text = text.replace(/https?:\/\/[^\s<>"']+/g, (m) => {
    const { url, trailing } = trimUrlTrailingPunct(String(m));
    const abs = safeHttpUrl(url, baseUrl);
    if (!abs) return String(m);

    // 图片增强：对“直链图片/图片页”直接渲染为图片（更有视觉信息）
    const derivedImage = tryDeriveImageUrlFromLink(abs);
    if (derivedImage) {
      const src = bestInitialCoverSrc(derivedImage, 1200);
      return `${push({ type: "img", alt: "", src, href: abs, originalSrc: derivedImage })}${trailing}`;
    }

    const parts = splitUrlForDisplay(abs);
    return `${push({ type: "autolink", href: abs, host: parts.host, path: parts.path })}${trailing}`;
  });

  // 先整体 escape，再把 token 注入为 HTML
  text = escapeHtml(text);
  text = applyBasicEmphasis(text);

  text = text.replace(/@@ACGTOKEN(\d+)@@/g, (_m, n) => {
    const idx = Number(n);
    const t = tokens[idx];
    if (!t) return "";

    if (t.type === "code") return `<code>${escapeHtml(t.text)}</code>`;

    if (t.type === "link") {
      const href = escapeHtml(t.href);
      const label = escapeHtml(t.text);
      return `<a href="${href}" target="_blank" rel="noreferrer noopener" title="${href}">${label}</a>`;
    }

    if (t.type === "img") {
      const href = escapeHtml(t.href);
      const original = escapeHtml(t.originalSrc ?? t.href);
      const src = escapeHtml(t.src);
      const alt = escapeHtml(t.alt);
      return `<a class="acg-prose-img-link" href="${href}" target="_blank" rel="noreferrer noopener"><img src="${src}" alt="${alt}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-acg-cover data-acg-cover-original-src="${original}" onload="window.__acgCoverLoad?.(this)" onerror="window.__acgCoverError?.(this)" /></a>`;
    }

    if (t.type === "autolink") {
      const href = escapeHtml(t.href);
      const host = escapeHtml(t.host);
      const path = escapeHtml(t.path);
      const pathHtml = path ? `<span class="acg-prose-autolink-path">${path}</span>` : "";
      return `<a class="acg-prose-autolink" href="${href}" target="_blank" rel="noreferrer noopener" title="${href}"><span class="acg-prose-autolink-text"><span class="acg-prose-autolink-host">${host}</span>${pathHtml}</span></a>`;
    }

    return "";
  });

  // 兜底：如果占位符因强调/杂质被打断，避免把内部实现细节渲染给用户
  // 例：`@@ACG<em>TOKEN</em>0@@`、`＠＠ACGTOKEN0＠＠` 等
  text = text.replace(/@@ACG(?:<[^>]+>)*TOKEN(?:<[^>]+>)*\d+(?:<[^>]+>)*@@/gi, "");
  text = text.replace(/＠＠ACG(?:<[^>]+>)*TOKEN(?:<[^>]+>)*\d+(?:<[^>]+>)*＠＠/gi, "");

  return text;
}

export function renderMarkdownToHtml(md: string, baseUrl: string): string {
  const text = normalizeFullTextMarkdown(md);
  if (!text) return "";

  const baseKey = normalizeUrlForCompare(baseUrl);
  const isSelfLinkLine = (raw: string): boolean => {
    const s = raw.trim();
    if (!s || !baseKey) return false;

    // 纯 URL
    if (looksLikeUrlText(s)) {
      const abs = safeHttpUrl(s, baseUrl);
      if (!abs) return false;
      return normalizeUrlForCompare(abs) === baseKey;
    }

    // 单条 Markdown 链接（整行只有一个 link）：[text](url)
    const m = /^\[([^\]]+)\]\(([^)]+)\)\s*$/.exec(s);
    if (m?.[2]) {
      const abs = safeHttpUrl(m[2], baseUrl);
      if (!abs) return false;
      return normalizeUrlForCompare(abs) === baseKey;
    }

    return false;
  };

  const lines = text.split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: "ul" | "ol" | null = null;
  let olCounter = 0;
  let inCode = false;
  let codeLines: string[] = [];

  const flushPara = () => {
    if (para.length === 0) return;
    // Markdown 语义：段落内的单个换行通常应视为“空格”，否则会出现大量硬换行导致阅读灾难。
    // （抓取/翻译的结果经常会把一段拆成多行；这里做“软换行合并”。）
    const joined = para.join(" ").replace(/\s+/g, " ").trim();
    para = [];
    if (!joined) return;
    // 去掉“正文里重复出现的文章自身 URL”（常由阅读模式/抽取器残留造成，属于纯噪音）
    if (isSelfLinkLine(joined)) return;
    const html = renderInlineMarkdown(joined, baseUrl);
    out.push(`<p>${html}</p>`);
  };

  const closeList = () => {
    if (!list) return;
    out.push(`</${list}>`);
    list = null;
  };

  const openList = (kind: "ul" | "ol") => {
    if (list === kind) return;
    closeList();
    if (kind === "ol") olCounter = 0;
    out.push(`<${kind}>`);
    list = kind;
  };

  const normalizeDateLabel = (raw: string) => raw.replace(/\s+/g, "").replace(/日$/, "日");

  const renderListItem = (raw: string, params: { orderedIndex?: number } = {}) => {
    const orderedIndex = params.orderedIndex;
    const value = raw.trim();

    if (typeof orderedIndex === "number") {
      return `<span class="acg-prose-li-prefix acg-prose-ol">${escapeHtml(String(orderedIndex))}</span><span class="acg-prose-li-content">${renderInlineMarkdown(
        value,
        baseUrl
      )}</span>`;
    }

    const timeMatch = /^(\d{1,2}:\d{2})\s*(.*)$/.exec(value);
    if (timeMatch) {
      const t = timeMatch[1] ?? "";
      const rest = (timeMatch[2] ?? "").trim();
      return `<span class="acg-prose-li-prefix acg-prose-time">${escapeHtml(t)}</span><span class="acg-prose-li-content">${renderInlineMarkdown(
        rest || value,
        baseUrl
      )}</span>`;
    }

    const dateMatch = /^(\d{1,2}\s*月\s*\d{1,2}\s*日)\s*(.*)$/.exec(value);
    if (dateMatch) {
      const d = normalizeDateLabel(dateMatch[1] ?? "");
      const rest = (dateMatch[2] ?? "").trim();
      return `<span class="acg-prose-li-prefix acg-prose-date">${escapeHtml(d)}</span><span class="acg-prose-li-content">${renderInlineMarkdown(
        rest || value,
        baseUrl
      )}</span>`;
    }

    return `<span class="acg-prose-li-prefix acg-prose-dot" aria-hidden="true"></span><span class="acg-prose-li-content">${renderInlineMarkdown(
      value,
      baseUrl
    )}</span>`;
  };

  const flushCode = () => {
    if (!inCode) return;
    const code = escapeHtml(codeLines.join("\n"));
    out.push(`<pre><code>${code}</code></pre>`);
    inCode = false;
    codeLines = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i] ?? "";
    const line = rawLine.replace(/\s+$/g, "");
    const trimmed = line.trim();

    // code fence
    if (trimmed.startsWith("```")) {
      flushPara();
      closeList();
      if (inCode) flushCode();
      else {
        inCode = true;
        codeLines = [];
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!trimmed) {
      flushPara();
      closeList();
      continue;
    }

    // headings
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      flushPara();
      closeList();
      const level = h[1]?.length ?? 2;
      const content = h[2] ?? "";
      out.push(`<h${level}>${renderInlineMarkdown(content, baseUrl)}</h${level}>`);
      continue;
    }

    // hr
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(trimmed)) {
      flushPara();
      closeList();
      out.push("<hr />");
      continue;
    }

    // blockquote
    if (/^>\s?/.test(trimmed)) {
      flushPara();
      closeList();
      const q: string[] = [];
      let j = i;
      while (j < lines.length) {
        const t = (lines[j] ?? "").trim();
        if (!/^>\s?/.test(t)) break;
        q.push(t.replace(/^>\s?/, ""));
        j += 1;
      }
      i = j - 1;
      const html = q.map((x) => renderInlineMarkdown(x, baseUrl)).join("<br />");
      out.push(`<blockquote>${html}</blockquote>`);
      continue;
    }

    // lists
    const ul = /^[-*]\s+(.*)$/.exec(trimmed);
    if (ul) {
      flushPara();
      const value = (ul[1] ?? "").trim();
      if (isSelfLinkLine(value)) continue;
      const liHtml = renderListItem(value);
      if (liHtml.trim()) {
        openList("ul");
        out.push(`<li class="acg-prose-li">${liHtml}</li>`);
      }
      continue;
    }

    const ol = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (ol) {
      flushPara();
      const value = (ol[1] ?? "").trim();
      if (isSelfLinkLine(value)) continue;
      openList("ol");
      const nextIndex = olCounter + 1;
      const liHtml = renderListItem(value, { orderedIndex: nextIndex });
      if (liHtml.trim()) {
        olCounter = nextIndex;
        out.push(`<li class="acg-prose-li">${liHtml}</li>`);
      }
      continue;
    }

    // list continuation（下一行缩进）：把它并到上一条 li 里，避免“标题被换行断开”。
    // 仅在存在缩进时触发，避免误伤正常段落。
    if (list && /^\s{2,}\S/.test(rawLine)) {
      const last = out[out.length - 1];
      if (last && last.endsWith("</li>")) {
        const extra = renderInlineMarkdown(trimmed, baseUrl);
        out[out.length - 1] = last.replace(/<\/li>$/, `<br />${extra}</li>`);
        continue;
      }
    }

    // normal paragraph
    closeList();
    para.push(trimmed);
  }

  if (inCode) flushCode();
  flushPara();
  closeList();
  return out.join("\n");
}

export function renderMarkdownToHtmlBlocks(md: string, baseUrl: string): string[] {
  const html = renderMarkdownToHtml(md, baseUrl).trim();
  if (!html) return [];

  const lines = html.split("\n").filter((l) => l.trim().length > 0);
  const blocks: string[] = [];

  const MAX_LIST_ITEMS_PER_BLOCK = 28;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const t = line.trim();

    if (t === "<ul>" || t === "<ol>") {
      const kind = t === "<ul>" ? "ul" : "ol";
      const endTag = `</${kind}>`;

      const rawItems: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j += 1) {
        const next = (lines[j] ?? "").trim();
        if (next === endTag) break;
        rawItems.push(lines[j] ?? "");
      }

      // 找不到闭合标签：退化成普通行（不冒险重写结构）
      if (j >= lines.length) {
        blocks.push(line);
        continue;
      }

      // split list block by <li> count（避免单块过大）
      let liCount = 0;
      let buf: string[] = [];
      const flushChunk = () => {
        if (buf.length === 0) return;
        blocks.push(`<${kind}>${buf.join("")}</${kind}>`);
        buf = [];
        liCount = 0;
      };

      for (const frag of rawItems) {
        const fragTrim = frag.trim();
        if (!fragTrim) continue;
        buf.push(fragTrim);
        if (fragTrim.startsWith("<li")) liCount += 1;
        if (liCount >= MAX_LIST_ITEMS_PER_BLOCK) flushChunk();
      }
      flushChunk();

      i = j; // skip closing tag
      continue;
    }

    blocks.push(t);
  }

  return blocks;
}

type ProseKind = "article" | "index";

function detectProseKind(root: HTMLElement): ProseKind {
  try {
    const li = root.querySelectorAll("li").length;
    const pNodes = [...root.querySelectorAll("p")];
    const p = pNodes.length;
    const h = root.querySelectorAll("h2, h3, h4").length;
    const textLen = (root.textContent ?? "").trim().length;

    // 文章信号：存在多段“较长段落”，优先判定为文章（避免 Inside 等文章页因“相关链接列表”而被误判为目录页）
    const longP = pNodes.filter(
      (el) => (el.textContent ?? "").replace(/\s+/g, " ").trim().length >= 90
    ).length;
    if (longP >= 3 || (longP >= 2 && p >= 6)) return "article";

    // “目录/新闻列表”特征：大量 list item，段落较少；或标题+列表组合；或整体很长但结构偏列表。
    if (li >= 36) return "index";
    if (li >= 24 && p <= 6) return "index";
    if (li >= 16 && li >= Math.max(6, p * 2) && p <= 8) return "index";
    if (h >= 4 && li >= 10 && p <= 8) return "index";
    if (textLen >= 8000 && li >= 12 && p <= 12 && longP <= 1) return "index";
    return "article";
  } catch {
    return "article";
  }
}

function enhanceProseIndex(root: HTMLElement) {
  // 只对“新闻目录/列表页”做折叠分区：让一大坨列表变得可浏览、可定位。
  if (root.dataset.acgProseKind !== "index") return;

  // 重复渲染（原文/翻译切换）会重建 innerHTML，因此这里不需要全局单例锁；
  // 但同一次渲染里避免二次执行。
  if (root.dataset.acgProseEnhanced === "1") return;
  root.dataset.acgProseEnhanced = "1";

  let sectionIndex = 0;
  let el: Element | null = root.firstElementChild;

  const shouldOpenByDefault = (title: string, idx: number) => {
    if (idx <= 2) return true;
    if (/news|ニュース|新闻动态|新闻|公告|press|feature/i.test(title)) return true;
    return false;
  };

  while (el) {
    if (el.tagName === "H4") {
      sectionIndex += 1;
      const h = el as HTMLElement;
      const titleText = (h.textContent ?? "").trim();

      const details = document.createElement("details");
      details.className = "acg-prose-section";
      if (shouldOpenByDefault(titleText, sectionIndex)) details.open = true;

      const summary = document.createElement("summary");
      summary.className = "acg-prose-section-summary";
      summary.innerHTML = h.innerHTML;

      const body = document.createElement("div");
      body.className = "acg-prose-section-body";

      details.appendChild(summary);
      details.appendChild(body);

      // 把 heading 之后的内容移入 section，直到下一个 H4
      let sib = h.nextElementSibling;
      while (sib && sib.tagName !== "H4") {
        const next = sib.nextElementSibling;
        body.appendChild(sib);
        sib = next;
      }

      const itemCount = body.querySelectorAll("li").length;
      if (itemCount > 0) {
        const badge = document.createElement("span");
        badge.className = "acg-prose-section-count";
        badge.textContent = String(itemCount);
        summary.appendChild(badge);
      }

      h.replaceWith(details);
      el = sib;
      continue;
    }

    el = el.nextElementSibling;
  }
}

function cleanLinkRowTitle(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  // 去掉“URL 被抽走”后常见残留：行尾的 "(" / "（" / "【" 等开括号
  s = s.replace(/[[（(【「『]\s*$/g, "").trim();
  // 去掉行尾孤立的冒号
  s = s.replace(/[：:]\s*$/g, "").trim();
  return s;
}

function enhanceLinkListItems(root: HTMLElement) {
  // 文章页：链接卡片化会让“杂质链接”更显眼。这里只服务于“目录/列表页”。
  if (root.dataset.acgProseKind === "article") return;

  // 把“标题 + inside-games.jp URL 卡片”这类内容，压缩成单条可点击嵌入：
  // - 覆盖 list item 内部（.acg-prose-li-content）
  // - 覆盖部分来源会输出为段落的“标题 + URL”
  const containers = [
    ...root.querySelectorAll<HTMLElement>(".acg-prose-li-content"),
    ...root.querySelectorAll<HTMLElement>("p")
  ];
  if (containers.length === 0) return;

  for (const content of containers) {
    // 已处理过的不再处理
    if (content.querySelector(".acg-prose-linkrow")) continue;
    // 不处理含图片/代码块的段落（避免误伤正常文章内容）
    if (content.querySelector("img, pre, code")) continue;

    const allLinks = [...content.querySelectorAll<HTMLAnchorElement>("a")].filter((a) =>
      Boolean(a.getAttribute("href"))
    );
    if (allLinks.length === 0) continue;

    const autolinks = allLinks.filter((a) => a.classList.contains("acg-prose-autolink"));
    if (autolinks.length === 0) continue;

    const nonAutolinkLinks = allLinks.filter((a) => !a.classList.contains("acg-prose-autolink"));

    // 只在“所有链接基本指向同一个目的地”时聚合，避免误伤正常段落里的多链接内容
    const unique = new Map<string, string>(); // key -> href
    for (const a of allLinks) {
      const href = a.getAttribute("href") ?? "";
      const key = normalizeUrlForCompare(href);
      if (!key) continue;
      if (!unique.has(key)) unique.set(key, href);
    }

    if (unique.size !== 1) continue;
    const onlyKey = [...unique.keys()][0] ?? "";
    if (!onlyKey) continue;

    // 选择最终 href：优先用“标题链接”的 href（通常更干净），否则退回第一个出现的 href
    let href = [...unique.values()][0] ?? "";
    const bestTitleAnchor = nonAutolinkLinks
      .map((a) => ({
        href: a.getAttribute("href") ?? "",
        text: cleanLinkRowTitle((a.textContent ?? "").trim())
      }))
      .filter(
        (it) =>
          it.href &&
          normalizeUrlForCompare(it.href) === onlyKey &&
          it.text.length >= 6 &&
          !looksLikeUrlText(it.text)
      )
      .sort((a, b) => b.text.length - a.text.length)[0];
    if (bestTitleAnchor?.href) href = bestTitleAnchor.href;
    if (!href) continue;

    // 取标题：优先用“移除链接后剩余文本”
    const clone = content.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("a").forEach((a) => {
      a.remove();
    });
    let titleText = cleanLinkRowTitle((clone.textContent ?? "").trim());

    // 兜底：如果正文只剩很短的碎片，但存在“标题链接文本”，则用它
    if (!titleText || titleText.length < 6) {
      const cand = bestTitleAnchor?.text;
      if (cand) titleText = cand;
    }

    if (!titleText || titleText.length < 6) continue;

    const { host, path } = splitUrlForDisplay(href);

    const a = document.createElement("a");
    a.className = "acg-prose-linkrow";
    a.href = href;
    a.target = "_blank";
    a.rel = "noreferrer noopener";
    a.title = href;

    const titleEl = document.createElement("div");
    titleEl.className = "acg-prose-linkrow-title";
    titleEl.textContent = titleText;

    const metaEl = document.createElement("div");
    metaEl.className = "acg-prose-linkrow-meta";
    metaEl.textContent = path ? `${host} ${path}` : host;

    a.appendChild(titleEl);
    a.appendChild(metaEl);

    content.innerHTML = "";
    content.appendChild(a);
  }
}

function pruneProseArticleJunk(root: HTMLElement) {
  // 目标：更激进地剥离“非正文内容”（相关推荐/社媒/导航/纯链接/免责声明等），避免全文预览变成“链接堆 + 大图墙”。
  // 原则：宁可删多一点，也不要把页面壳/推荐区污染到正文里。
  if (root.dataset.acgProseKind !== "article") return;

  // 0) 兜底：内部占位符绝不允许泄漏到最终 UI
  root.innerHTML = stripInternalPlaceholdersFromHtml(root.innerHTML);

  const normalizeText = (s: string) => s.replace(/\s+/g, " ").trim();
  const isTrivialText = (s: string) => {
    const t = normalizeText(s);
    if (!t) return true;
    const compact = t.replace(/\s+/g, "");
    if (!compact) return true;
    if (/^[)\]】」）(（[【「『"”'’《》<>.,，。:：;；!?！？·•、\-—–|]+$/.test(compact)) return true;
    return false;
  };

  const isJunkLabel = (s: string) => {
    const t = normalizeText(s).toLowerCase();
    if (!t) return false;
    // 常见“来源/引用/跳转提示”残留：只提供链接，不提供正文信息
    if (/^(?:source|via|reference|references|read more|open|original|link|links)[:：]?$/.test(t)) return true;
    if (/^(?:来源|來源|原文|引用元|参照|参考|參考|更多|查看原文|打开原文|查看|打开)[:：]?$/.test(t))
      return true;
    if (/^(?:続きを読む|リンク|リンク先|参照元)[:：]?$/.test(t)) return true;
    return false;
  };

  const isSourceLikeText = (raw: string) => {
    const t = normalizeText(raw);
    if (!t) return false;
    const lower = t.toLowerCase();

    // “来源/原文/跳转”类提示（通常带链接，信息量低）
    if (/^(?:source|via|original|read more|open|link|links|credit|credits)[:：\s]/i.test(t)) return true;
    if (/^disclosure[:：\s]/i.test(t)) return true;
    if (/^(?:image|photo)(?:\s+via|\s*:)/i.test(t)) return true;
    if (/^(?:来源|來源|原文|查看原文|打开原文|引用元|参照|参考|參考|出典)[:：\s]/.test(t)) return true;
    if (/^(?:出典|参照元|続きを読む|リンク)[:：\s]/.test(t)) return true;

    // 版权/署名类（短行）：更像页面壳残留
    if (/^©/.test(t) || lower.includes("copyright") || lower.includes("all rights reserved")) return true;
    return false;
  };

  const removeIfSourceLike = (container: HTMLElement) => {
    if (container.querySelector("img, pre, code")) return;
    const links = [...container.querySelectorAll<HTMLAnchorElement>("a[href]")];
    if (links.length === 0) return;
    const full = normalizeText(container.textContent ?? "");
    if (!full) return;
    // 太长的“引用/脚注”可能是正文的一部分，不动
    if (full.length > 280) return;
    if (isSourceLikeText(full)) container.remove();
  };

  const removeIfLinkOnly = (container: HTMLElement) => {
    if (container.querySelector("img, pre, code")) return;
    const links = [...container.querySelectorAll<HTMLAnchorElement>("a[href]")];
    if (links.length === 0) return;

    // 媒体白名单：正文里的“预告片/视频”链接即使是纯链接，也属于内容，不应当作噪音删除。
    const hasMediaLink = links.some((a) => {
      const href = (a.getAttribute("href") ?? "").trim();
      if (!href) return false;
      try {
        const u = new URL(href);
        const host = u.hostname.replace(/^www\./, "").toLowerCase();
        return (
          host.endsWith("youtube.com") ||
          host === "youtu.be" ||
          host.endsWith("vimeo.com") ||
          host === "player.vimeo.com" ||
          host.endsWith("nicovideo.jp") ||
          host.endsWith("nico.ms") ||
          host.endsWith("bilibili.com") ||
          host.endsWith("b23.tv") ||
          host.endsWith("twitch.tv")
        );
      } catch {
        return false;
      }
    });
    if (hasMediaLink) return;

    const clone = container.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("a").forEach((a) => a.remove());
    const rest = normalizeText(clone.textContent ?? "");

    if (isTrivialText(rest) || isJunkLabel(rest)) {
      container.remove();
      return;
    }

    const full = normalizeText(container.textContent ?? "");
    const aTextLen = links.reduce((sum, a) => sum + normalizeText(a.textContent ?? "").length, 0);
    const linkDensity = aTextLen / Math.max(1, full.length);

    // “几乎全是链接”的短段落：更像推荐/导航残留
    if (full.length <= 280 && links.length >= 1 && linkDensity >= 0.78) {
      container.remove();
      return;
    }

    // 只有自动 URL 卡片，且正文残留很短：直接删
    const nonAuto = links.filter(
      (a) => !a.classList.contains("acg-prose-autolink") && !a.classList.contains("acg-prose-linkrow")
    );
    if (nonAuto.length === 0 && rest.length <= 18) {
      container.remove();
      return;
    }
  };

  const removeIfRawUrlHeavy = (container: HTMLElement) => {
    // 兜底：有些抽取器会把 URL 当作纯文本塞进正文（甚至紧贴中文/日文），导致“纯链接行”绕过 <a> 检测。
    // 原则：宁可删多一点，也不要让正文被 URL 噪音污染（原文入口由页面下方按钮提供）。
    if (container.querySelector("img, a, pre, code")) return;

    const full = normalizeText(container.textContent ?? "");
    if (!full) return;
    const urls = full.match(/https?:\/\/\S+|www\.\S+/gi) ?? [];
    if (urls.length === 0) return;

    // 媒体白名单：如果是视频/直播链接文本，保留（它属于内容）。
    const hasMediaUrl = urls.some((raw) => {
      const abs = raw.startsWith("www.") ? `https://${raw}` : raw;
      try {
        const u = new URL(abs);
        const host = u.hostname.replace(/^www\./, "").toLowerCase();
        return (
          host.endsWith("youtube.com") ||
          host === "youtu.be" ||
          host.endsWith("vimeo.com") ||
          host === "player.vimeo.com" ||
          host.endsWith("nicovideo.jp") ||
          host.endsWith("nico.ms") ||
          host.endsWith("bilibili.com") ||
          host.endsWith("b23.tv") ||
          host.endsWith("twitch.tv")
        );
      } catch {
        return false;
      }
    });
    if (hasMediaUrl) return;

    const urlLen = urls.reduce((sum, u) => sum + u.length, 0);
    const rest = normalizeText(full.replace(/https?:\/\/\S+|www\.\S+/gi, " "));

    if (isTrivialText(rest) || isJunkLabel(rest)) {
      container.remove();
      return;
    }

    const ratio = urlLen / Math.max(1, full.length);
    // 短段落里 URL 密度极高：几乎确定是推荐/导航/页脚残留
    if (full.length <= 240 && ratio >= 0.55) {
      container.remove();
      return;
    }

    // 单纯“URL + 少量无意义尾巴”也删（例如多了个短括号/分隔符/编号）
    if (full.length <= 320 && rest.length <= 14) {
      container.remove();
      return;
    }
  };

  // 1) 段落级：删除“纯链接/提示型”段落
  for (const p of [...root.querySelectorAll<HTMLElement>("p")]) {
    removeIfRawUrlHeavy(p);
    if (!p.isConnected) continue;
    removeIfLinkOnly(p);
    if (!p.isConnected) continue;
    removeIfSourceLike(p);
  }

  // 2) list item 级：删除“纯链接/提示型”条目（并清理空列表）
  for (const li of [...root.querySelectorAll<HTMLElement>("li")]) {
    const content = li.querySelector<HTMLElement>(":scope > .acg-prose-li-content") ?? li;
    removeIfRawUrlHeavy(content);
    if (!content.isConnected) continue;
    removeIfLinkOnly(content);
    if (!content.isConnected) continue;
    removeIfSourceLike(content);
    // 如果 content 被 remove 了，li 可能变空：一并处理
    if ((li.textContent ?? "").trim().length === 0 && li.querySelectorAll("img").length === 0) li.remove();
  }
  for (const list of [...root.querySelectorAll<HTMLElement>("ul, ol")]) {
    if (list.querySelectorAll(":scope > li").length === 0) list.remove();
  }

  // 2.5) 引用块：图片来源/版权/原文入口这类“短引用”直接剥离（避免把正文变成 credit 墙）
  for (const q of [...root.querySelectorAll<HTMLElement>("blockquote")]) {
    const text = normalizeText(q.textContent ?? "");
    if (!text) {
      q.remove();
      continue;
    }
    const links = q.querySelectorAll("a[href]").length;
    if (text.length <= 260 && (links >= 1 || /^©/.test(text)) && isSourceLikeText(text)) {
      q.remove();
    }
  }

  // 3) 块级：更激进剥离“相关推荐/分享/标签/排行”等链接密度块（即使它夹在正文中间）
  const noisyKeywords = [
    "related",
    "recommended",
    "recommend",
    "popular",
    "ranking",
    "archive",
    "archives",
    "subscribe",
    "newsletter",
    "follow",
    "share",
    "tag",
    "tags",
    "category",
    "categories",
    "sponsored",
    "advertisement",
    "read more",
    "関連記事",
    "関連",
    "おすすめ",
    "人気",
    "ランキング",
    "タグ",
    "カテゴリ",
    "シェア",
    "フォロー",
    "スポンサー",
    "広告",
    "続きを読む"
  ];

  const linkMetrics = (el: HTMLElement) => {
    const text = normalizeText(el.textContent ?? "");
    const textLen = text.length;
    const links = [...el.querySelectorAll<HTMLAnchorElement>("a[href]")];
    const aCount = links.length;
    const aTextLen = links.reduce((sum, a) => sum + normalizeText(a.textContent ?? "").length, 0);
    const pNodes = [...el.querySelectorAll<HTMLElement>("p")];
    const longP = pNodes.filter((p) => normalizeText(p.textContent ?? "").length >= 120).length;
    const liCount = el.querySelectorAll("li").length;
    const imgCount = el.querySelectorAll("img").length;
    const linkDensity = aTextLen / Math.max(1, textLen);
    const lower = text.toLowerCase();
    const keywordHit = noisyKeywords.some((k) => lower.includes(k.toLowerCase()));
    return { textLen, aCount, longP, liCount, imgCount, linkDensity, keywordHit };
  };

  const candidates = [
    ...root.querySelectorAll<HTMLElement>("section, div, ul, ol, table, details")
  ].reverse();
  for (const el of candidates) {
    if (el === root) continue;
    const m = linkMetrics(el);

    // 明显正文块：有多段长段落 => 不动
    if (m.longP >= 2) continue;

    const tag = el.tagName.toUpperCase();

    // 目录型/推荐型列表：li 多 + 链接密度高 + 无长段落
    if ((tag === "UL" || tag === "OL") && m.liCount >= 6 && m.linkDensity >= 0.6 && m.longP === 0) {
      el.remove();
      continue;
    }

    // 关键词命中 + 链接为主：剥离
    if (m.keywordHit && m.aCount >= 4 && m.linkDensity >= 0.35 && m.longP === 0 && m.textLen <= 2400) {
      el.remove();
      continue;
    }

    // 极端链接块：几乎全是链接，且没有图片/正文段落
    if (m.linkDensity >= 0.88 && m.aCount >= 4 && m.longP === 0 && m.imgCount === 0 && m.textLen <= 2200) {
      el.remove();
      continue;
    }
  }
}

function enhanceProseImageGalleries(root: HTMLElement) {
  // 目标：全文预览中常见“多张图片链接/引用堆在一起”，会导致页面被大图淹没、排版极乱。
  // 策略：把连续的“纯图片段落”或“纯图片列表”收敛成一个网格画廊（缩略图），点击仍可打开原图/原页。

  const isIgnorableJunkText = (s: string) => {
    const t = s.replace(/\s+/g, "").trim();
    if (!t) return true;
    // 常见残留：括号/引号/全角标点
    if (/^[)\]】」）"”'’]+$/.test(t)) return true;
    if (/^[[（(【「『]+$/.test(t)) return true;
    if (/^[,，.。:：;；!?！？]+$/.test(t)) return true;
    // 常见“图片提示/放大提示/来源提示”（短句且信息量低）：允许忽略，便于把图片序列收敛成画廊
    if (t.length <= 24) {
      if (/^(?:画像|写真|圖像|图片|圖片|image|photo)(?:[:：].*)?$/i.test(t)) return true;
      if (/(クリック|タップ).*(拡大|拡大表示)/.test(t)) return true;
      if (/画像.*(クリック|タップ).*(拡大|拡大表示)/.test(t)) return true;
      if (/点击.*(查看|打开|放大).*(原图|原圖|大图|大圖|图片|圖片)/.test(t)) return true;
      if (/點擊.*(查看|打開|放大).*(原圖|大圖|圖片)/.test(t)) return true;
      if (/^source[:：]/i.test(t)) return true;
      if (/^via[:：]/i.test(t)) return true;
    }
    return false;
  };

  const isIgnorableParagraph = (p: HTMLElement) => {
    // 仅当段落不含可见结构（链接/图片/代码），且文本为“噪音/提示/空白”时，才移除
    if (p.querySelector("img, a, pre, code")) return false;
    const t = (p.textContent ?? "").trim();
    if (!t) return true;
    return isIgnorableJunkText(t);
  };

  const extractImageOnlyLink = (container: HTMLElement): HTMLAnchorElement | null => {
    const a = container.querySelector<HTMLAnchorElement>(":scope > a.acg-prose-img-link");
    if (!a) return null;

    for (const node of [...container.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent ?? "";
        if (t.trim() === "") continue;
        if (isIgnorableJunkText(t)) {
          node.remove();
          continue;
        }
        return null;
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node === a) continue;
        return null;
      }
    }

    return a;
  };

  const mountGallery = (anchors: HTMLAnchorElement[], beforeEl: Element) => {
    if (anchors.length < 2) return false;
    const gallery = document.createElement("div");
    gallery.className = "acg-prose-gallery";
    for (const a of anchors) {
      a.classList.add("acg-prose-gallery-item");
      gallery.appendChild(a);
    }
    beforeEl.before(gallery);
    return true;
  };

  // 1) 连续的“纯图片段落” -> 画廊
  const paras = [...root.querySelectorAll<HTMLElement>("p")];
  let run: { p: HTMLElement; a: HTMLAnchorElement }[] = [];
  const flushRun = () => {
    if (run.length < 2) {
      run = [];
      return;
    }
    const anchors = run.map((x) => x.a);
    const first = run[0]?.p;
    if (!first) {
      run = [];
      return;
    }
    const ok = mountGallery(anchors, first);
    if (ok) {
      for (const item of run) item.p.remove();
    }
    run = [];
  };

  for (const p of paras) {
    if (isIgnorableParagraph(p)) {
      // 这种段落常见于“点击放大/图片来源/空白占位”，删除后可让图片序列连续，从而被画廊收敛。
      p.remove();
      continue;
    }

    const a = extractImageOnlyLink(p);
    if (a) {
      run.push({ p, a });
      continue;
    }
    flushRun();
  }
  flushRun();

  // 2) 纯图片列表（常见于“图片页 URL 列表”）-> 画廊
  const lists = [...root.querySelectorAll<HTMLElement>("ul, ol")];
  for (const list of lists) {
    const li = [...list.querySelectorAll<HTMLElement>(":scope > li")];
    if (li.length < 2) continue;

    const anchors: HTMLAnchorElement[] = [];
    let ok = true;
    for (const item of li) {
      const content = item.querySelector<HTMLElement>(":scope > .acg-prose-li-content") ?? item;
      const a = extractImageOnlyLink(content);
      if (!a) {
        ok = false;
        break;
      }
      anchors.push(a);
    }
    if (!ok || anchors.length < 2) continue;

    const before = list;
    const mounted = mountGallery(anchors, before);
    if (!mounted) continue;
    list.remove();
  }
}

type FullTextSource = "jina" | "allorigins" | "codetabs";
type FullTextLoadResult = {
  md: string;
  source: FullTextSource;
  status?: number;
};

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  return httpFetch(url, undefined, {
    label: "fulltext",
    timeoutMs,
    retries: 0,
    headers: {
      accept: NETWORK.TEXT_ACCEPT
    }
  });
}

function toAbsoluteUrlMaybe(raw: string, baseUrl: string): string | null {
  try {
    const u = new URL(raw, baseUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function inlineHtmlToMarkdown(node: Node, baseUrl: string): string {
  const t = (node.textContent ?? "").replace(/\s+/g, " ");

  if (node.nodeType === Node.TEXT_NODE) return t;
  if (node.nodeType !== Node.ELEMENT_NODE) return t;

  const el = node as HTMLElement;
  const tag = el.tagName.toUpperCase();

  if (tag === "BR") return "\n";

  if (tag === "A") {
    const label = (el.textContent ?? "").trim().replace(/\s+/g, " ");
    const hrefRaw = el.getAttribute("href") ?? "";
    const hrefAbs = toAbsoluteUrlMaybe(hrefRaw, baseUrl);
    if (!hrefAbs) return label || hrefRaw;
    if (!label) return hrefAbs;
    return `[${label}](${hrefAbs})`;
  }

  if (tag === "IMG") {
    let alt = (el.getAttribute("alt") ?? "").trim();
    if (/^(?:undefined|null)$/i.test(alt)) alt = "";
    const pickSrc = (): string => {
      const keys = ["src", "data-src", "data-original", "data-lazy-src", "data-srcset", "srcset"];
      const isPlaceholder = (raw: string) => {
        const v = raw.trim();
        if (!v) return true;
        const lower = v.toLowerCase();
        if (lower.startsWith("data:image/gif")) return true;
        if (lower === "about:blank") return true;
        // 常见懒加载占位：spacer/blank/transparent 之类的小 gif
        if (/(?:^|\/)(?:spacer|blank|pixel|transparent)\.gif(?:$|[?#])/.test(lower)) return true;
        return false;
      };

      let fallback = "";
      for (const k of keys) {
        const v = (el.getAttribute(k) ?? "").trim();
        if (!v) continue;
        if (k === "src" && isPlaceholder(v)) {
          // 记录一下，若完全找不到真实资源，才退回占位（避免“空白大图”污染排版）
          fallback = v;
          continue;
        }
        // srcset: 取最后一个（通常是最大尺寸），然后截掉 `640w/2x` 这类描述符
        if (k.endsWith("srcset") && v.includes(",")) {
          const parts = v
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
          const last = parts[parts.length - 1] ?? "";
          const url = last.split(/\s+/)[0] ?? "";
          if (url) return url;
        }
        if (k.endsWith("srcset")) {
          const url = v.split(/\s+/)[0] ?? "";
          if (url) return url;
        }
        return v;
      }
      return fallback;
    };

    const srcRaw = pickSrc();
    const srcAbs = toAbsoluteUrlMaybe(srcRaw, baseUrl);
    if (!srcAbs) return alt ? `![${alt}]` : "";
    return `![${alt}](${srcAbs})`;
  }

  if (tag === "CODE") {
    const code = (el.textContent ?? "").trim();
    if (!code) return "";
    return `\`${code.replace(/`/g, "")}\``;
  }

  if (tag === "EM" || tag === "I") {
    const inner = [...el.childNodes].map((c) => inlineHtmlToMarkdown(c, baseUrl)).join("");
    const s = inner.trim();
    return s ? `_${s}_` : "";
  }

  if (tag === "STRONG" || tag === "B") {
    const inner = [...el.childNodes].map((c) => inlineHtmlToMarkdown(c, baseUrl)).join("");
    const s = inner.trim();
    return s ? `**${s}**` : "";
  }

  return [...el.childNodes].map((c) => inlineHtmlToMarkdown(c, baseUrl)).join("");
}

function htmlElementToMarkdown(root: Element, baseUrl: string): string {
  const blocks: string[] = [];
  let host = "";
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    // ignore
  }

  const isLowValueCaption = (raw: string): boolean => {
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t) return true;
    const lower = t.toLowerCase();
    if (lower === "undefined" || lower === "null") return true;

    // 典型“版权/来源/社媒 credit”类：信息价值低，且极易把正文污染成链接堆
    if (/^(?:image|photo)(?:\s+via|\s*:)/i.test(t)) return true;
    if (/^(?:source|via|credit|credits)[:：\s]/i.test(t)) return true;
    if (/^(?:来源|來源|原文|引用元|参照|参考|參考|出典)[:：\s]/.test(t)) return true;
    if (/^(?:画像|写真|出典|参照元|リンク)[:：\s]/.test(t)) return true;
    if (t.startsWith("©") || lower.includes("copyright") || lower.includes("all rights reserved"))
      return true;

    // 纯链接/几乎是链接：直接丢弃（正文已提供“打开原文”入口）
    if (/^https?:\/\//i.test(t)) return true;
    if (/^\[[^\]]+\]\(https?:\/\/[^)]+\)$/.test(t)) return true;

    // 太短：通常是无意义标注
    if (t.length <= 8) return true;
    return false;
  };

  const push = (block: string) => {
    const b = block
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (b) blocks.push(b);
  };

  const walk = (node: Element) => {
    const children = [...node.children] as HTMLElement[];
    for (const child of children) {
      const tag = child.tagName.toUpperCase();

      // block images：有些站点（例如 natalie）会把正文图放在 div/a 里而不是 figure/p，
      // 如果不显式处理 IMG，会导致全文预览“看起来缺图”。
      if (tag === "IMG") {
        const md = inlineHtmlToMarkdown(child, baseUrl).trim();
        if (md) push(md);
        continue;
      }

      if (/^H[1-6]$/.test(tag)) {
        const level = Math.min(6, Math.max(1, Number(tag.slice(1))));
        const text = [...child.childNodes]
          .map((c) => inlineHtmlToMarkdown(c, baseUrl))
          .join("")
          .trim();
        if (text) push(`${"#".repeat(level)} ${text}`);
        continue;
      }

      if (tag === "FIGURE") {
        const parts: string[] = [];
        const imgs = [...child.querySelectorAll("img")];
        for (const img of imgs) {
          const md = inlineHtmlToMarkdown(img, baseUrl).trim();
          if (md) parts.push(md);
        }

        // figcaption 往往是“图片来源/版权声明/站点壳 credit”，对阅读价值不大，且常产生 `]]`/纯链接/杂质。
        // 更激进：对 ANN 直接忽略；其他站点只保留“看起来像正文描述”的 caption，并用轻量 italic 呈现。
        if (!host.endsWith("animenewsnetwork.com")) {
          const captionEls = [...child.querySelectorAll("figcaption")];
          const captions = captionEls
            .map((cap) =>
              [...cap.childNodes]
                .map((c) => inlineHtmlToMarkdown(c, baseUrl))
                .join("")
                .replace(/\s+/g, " ")
                .trim()
            )
            .map((s) => s.trim())
            .filter(Boolean)
            .filter((s) => !isLowValueCaption(s))
            .slice(0, 2);
          const caption = captions.join(" / ").trim();
          if (caption) parts.push(`_${caption}_`);
        }

        if (parts.length > 0) push(parts.join("\n\n"));
        continue;
      }

      if (tag === "P") {
        const text = [...child.childNodes].map((c) => inlineHtmlToMarkdown(c, baseUrl)).join("");
        push(text);
        continue;
      }

      if (tag === "BLOCKQUOTE") {
        const text = (child.textContent ?? "").replace(/\r\n/g, "\n").trim();
        if (text) {
          const quoted = text
            .split("\n")
            .map((l) => `> ${l.trim()}`)
            .join("\n");
          push(quoted);
        }
        continue;
      }

      if (tag === "PRE") {
        const text = (child.textContent ?? "").replace(/\r\n/g, "\n").trim();
        if (text) push(`\`\`\`\n${text}\n\`\`\``);
        continue;
      }

      if (tag === "UL") {
        const items = [...child.querySelectorAll(":scope > li")];
        const lines = items
          .map((li) => {
            const text = [...li.childNodes]
              .map((c) => inlineHtmlToMarkdown(c, baseUrl))
              .join("")
              .replace(/\s+/g, " ")
              .trim();
            return text ? `- ${text}` : "";
          })
          .filter(Boolean);
        push(lines.join("\n"));
        continue;
      }

      if (tag === "OL") {
        const items = [...child.querySelectorAll(":scope > li")];
        let idx = 0;
        const lines = items
          .map((li) => {
            idx += 1;
            const text = [...li.childNodes]
              .map((c) => inlineHtmlToMarkdown(c, baseUrl))
              .join("")
              .replace(/\s+/g, " ")
              .trim();
            return text ? `${idx}. ${text}` : "";
          })
          .filter(Boolean);
        push(lines.join("\n"));
        continue;
      }

      // 默认：继续深入（略过无意义容器）
      walk(child);
    }
  };

  walk(root);
  return blocks.join("\n\n").trim();
}

function pickMainElement(doc: Document, baseUrl: string): HTMLElement {
  let host = "";
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    // ignore
  }

  const fallbackBody = doc.body;

  // 站点特化：ナタリー（natalie.mu）正文结构稳定：`.NA_article_body` 是最干净的正文容器。
  // 如果误选整个 article，会把“标签/相关人物/推荐”一并吞进来，导致全文预览再次变成“目录 + 图墙 + 链接堆”。
  if (host.endsWith("natalie.mu")) {
    const preferredSelectors = [
      "article.NA_article .NA_article_body",
      ".NA_article_body",
      "article.NA_article"
    ];
    for (const sel of preferredSelectors) {
      const el = doc.querySelector(sel);
      if (!el || !(el instanceof HTMLElement)) continue;
      const textLen = (el.textContent ?? "").replace(/\s+/g, " ").trim().length;
      const pCount = el.querySelectorAll("p").length;
      if (sel.includes("_body")) {
        if (textLen >= 120 || pCount >= 1) return el;
        continue;
      }
      if (textLen >= 420 || pCount >= 2) return el;
    }
  }

  // 站点特化：ANN（AnimeNewsNetwork）有很稳定的主容器命名
  // 说明：我们不能让“全页 body”参与评分，否则极易把导航/侧栏/页脚一起吞进正文（导致全文预览变成一坨目录/链接）。
  if (host.endsWith("animenewsnetwork.com")) {
    const preferredSelectors = [
      "#content-zone .meat",
      "#content-zone .KonaBody",
      "#content-zone",
      ".KonaBody",
      ".meat",
      "#maincontent .KonaBody",
      "#maincontent"
    ];
    for (const sel of preferredSelectors) {
      const el = doc.querySelector(sel);
      if (!el || !(el instanceof HTMLElement)) continue;
      const textLen = (el.textContent ?? "").replace(/\s+/g, " ").trim().length;
      const pCount = el.querySelectorAll("p").length;
      const isMeat = sel.includes(".meat");
      if (isMeat) {
        if (textLen >= 120 || pCount >= 1) return el;
        continue;
      }
      if (textLen >= 420 || pCount >= 2) return el;
    }
  }

  // 站点特化：Inside / アニメ！アニメ！（IID 系）正文容器命名稳定
  if (host.endsWith("inside-games.jp") || host.endsWith("animeanime.jp")) {
    const preferredSelectors = ["article.arti-body", ".arti-body"];
    for (const sel of preferredSelectors) {
      const el = doc.querySelector(sel);
      if (!el || !(el instanceof HTMLElement)) continue;
      const textLen = (el.textContent ?? "").replace(/\s+/g, " ").trim().length;
      const pCount = el.querySelectorAll("p").length;
      if (textLen >= 260 || pCount >= 2) return el;
    }
  }

  // 站点特化：Tokyo Otaku Mode（otakumode.com）正文容器较深，且主 article 内含工具栏/评论等杂质。
  // 优先选择“纯正文”子容器，避免全文预览出现导航/工具按钮/评论区等噪音。
  if (host.endsWith("otakumode.com")) {
    const preferredSelectors = [
      "article.p-article .p-article__text",
      "article.p-article .p-article__body",
      "article.p-article",
      "article"
    ];
    for (const sel of preferredSelectors) {
      const el = doc.querySelector(sel);
      if (!el || !(el instanceof HTMLElement)) continue;
      const textLen = (el.textContent ?? "").replace(/\s+/g, " ").trim().length;
      const pCount = el.querySelectorAll("p").length;
      if (sel.includes("__text")) {
        if (textLen >= 140 || pCount >= 1) return el;
        continue;
      }
      if (sel.includes("__body")) {
        if (textLen >= 260 || pCount >= 2) return el;
        continue;
      }
      if (textLen >= 520 || pCount >= 3) return el;
    }
  }

  const candidates: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  const push = (el: Element | null) => {
    if (!el || !(el instanceof HTMLElement)) return;
    if (seen.has(el)) return;
    seen.add(el);
    candidates.push(el);
  };

  // 通用：常见文章容器
  push(doc.querySelector("article"));
  push(doc.querySelector("[itemprop='articleBody']"));
  push(doc.querySelector(".article-body"));
  push(doc.querySelector(".article__body"));
  push(doc.querySelector(".entry-content"));
  push(doc.querySelector(".post-content"));
  push(doc.querySelector(".post-body"));
  push(doc.querySelector(".content__body"));
  push(doc.querySelector(".c-article__body"));

  // 通用：常见页面容器
  push(doc.querySelector("main"));
  push(doc.querySelector("#content"));
  push(doc.querySelector("#main"));
  push(doc.querySelector(".content"));

  // 关键：不要让 body 参与评分（几乎总是“更长”），只作为最后兜底。
  let best: HTMLElement | null = null;
  let bestScore = -Infinity;

  for (const el of candidates) {
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    const textLen = text.length;

    const anchors = [...el.querySelectorAll("a")];
    const aCount = anchors.length;
    const aTextLen = anchors.reduce((sum, a) => sum + ((a.textContent ?? "").trim().length || 0), 0);
    const pCount = el.querySelectorAll("p").length;
    const liCount = el.querySelectorAll("li").length;
    const hCount = el.querySelectorAll("h1,h2,h3,h4").length;
    const imgCount = el.querySelectorAll("img").length;

    // 过滤“太短/太空”的容器，避免误选导航残片
    if (textLen < 120 && pCount < 2 && liCount < 6 && imgCount < 1) continue;

    const linkDensity = aTextLen / Math.max(1, textLen);

    // 评分：偏向“更像正文”的元素（段落/标题/少量图片），强力惩罚“链接密度过高”的导航页结构
    let score = 0;
    score += textLen;
    score += pCount * 180;
    score += Math.min(48, liCount) * 18;
    score += Math.min(12, hCount) * 80;
    score += Math.min(10, imgCount) * 55;
    score -= aTextLen * 0.55;
    score -= aCount * 10;
    if (linkDensity > 0.55) score -= (linkDensity - 0.55) * textLen * 1.6;
    if (textLen < 260) score -= 260 - textLen;

    if (score > bestScore) {
      best = el;
      bestScore = score;
    }
  }

  // 如果评分体系没有命中，按候选优先级返回（仍避免直接回退到 body）
  return best ?? candidates[0] ?? fallbackBody;
}

function cleanupHtmlDocument(doc: Document, baseUrl: string) {
  // 说明：全文抽取的目标不是“复刻网页”，而是拿到“可读正文”。
  // 但某些站点会把“正文关键媒体（如 YouTube 预告片）”放在 iframe 里；
  // 如果我们直接删除 iframe，会导致正文信息缺失。
  // 处理：把可信媒体 iframe 转成“普通链接”后再统一清壳。

  const pickIframeSrc = (iframe: HTMLIFrameElement): string => {
    const keys = ["src", "data-src", "data-lazy-src", "data-original"];
    for (const k of keys) {
      const v = (iframe.getAttribute(k) ?? "").trim();
      if (v) return v;
    }
    return "";
  };

  const normalizeMediaHref = (hrefAbs: string): { href: string; label: string } | null => {
    try {
      const u = new URL(hrefAbs);
      const host = u.hostname.replace(/^www\./, "").toLowerCase();
      const path = u.pathname || "/";

      // YouTube: embed -> watch
      if (host.endsWith("youtube.com") || host === "youtu.be") {
        let id = "";
        if (host === "youtu.be") {
          id = (path || "/").replace(/^\/+/, "").split("/")[0] ?? "";
        } else if (path.startsWith("/embed/")) {
          id = path.slice("/embed/".length).split("/")[0] ?? "";
        } else {
          id = u.searchParams.get("v") ?? "";
        }
        if (!id) return { href: u.toString(), label: "Watch video (YouTube)" };
        return {
          href: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
          label: "Watch video (YouTube)"
        };
      }

      // Vimeo: player -> canonical
      if (host === "player.vimeo.com" && path.startsWith("/video/")) {
        const id = path.slice("/video/".length).split("/")[0] ?? "";
        if (id) return { href: `https://vimeo.com/${encodeURIComponent(id)}`, label: "Watch video (Vimeo)" };
        return { href: u.toString(), label: "Watch video (Vimeo)" };
      }
      if (host.endsWith("vimeo.com")) return { href: u.toString(), label: "Watch video (Vimeo)" };

      // Nico / Bilibili / Twitch 等（常见 ACG 来源）
      if (host.endsWith("nicovideo.jp") || host.endsWith("nico.ms"))
        return { href: u.toString(), label: "Watch video (Niconico)" };
      if (host.endsWith("bilibili.com") || host.endsWith("b23.tv"))
        return { href: u.toString(), label: "Watch video (Bilibili)" };
      if (host.endsWith("twitch.tv")) return { href: u.toString(), label: "Watch video (Twitch)" };

      return null;
    } catch {
      return null;
    }
  };

  // 先把可信媒体 iframe 变成链接（保留信息，但避免 iframe 本身）
  const iframes = [...doc.querySelectorAll<HTMLIFrameElement>("iframe")];
  for (const iframe of iframes) {
    const srcRaw = pickIframeSrc(iframe);
    const abs = srcRaw ? toAbsoluteUrlMaybe(srcRaw, baseUrl) : null;
    if (!abs) continue;
    const media = normalizeMediaHref(abs);
    if (!media) continue;

    const a = doc.createElement("a");
    a.setAttribute("href", media.href);
    a.textContent = media.label;
    // 避免把 <p> 嵌进 <p>（某些站点会把 iframe 放在段落内，嵌套会导致抽取/排版变形）
    const parentTag = (iframe.parentElement?.tagName ?? "").toUpperCase();
    if (parentTag === "P") {
      iframe.replaceWith(a);
    } else {
      const p = doc.createElement("p");
      p.appendChild(a);
      iframe.replaceWith(p);
    }
  }

  // 删除明显的“壳/导航/脚本”，减少噪音与 XSS 面
  const selectors = [
    "script",
    "style",
    "noscript",
    "iframe",
    "svg",
    "canvas",
    "nav",
    "header",
    "footer",
    "aside",
    "form",
    "[role='navigation']",
    "[role='banner']",
    "[role='contentinfo']",
    "[aria-hidden='true']",
    // 常见“分享/评论/相关推荐/广告”等噪音块（尽量用“精确类名”，避免误删正文容器）
    ".share",
    ".shares",
    ".social",
    ".sns",
    ".comment",
    ".comments",
    ".related",
    ".recommend",
    ".recommended",
    ".newsletter",
    ".subscribe",
    ".breadcrumb",
    ".breadcrumbs",
    ".pagination",
    ".pager",
    ".adsbygoogle",
    ".advertisement",
    ".ad",
    ".ads",
    // ANN 常见噪音盒子（其脚本会尝试删除；我们在去掉 script 后手动清掉）
    ".box[data-topics]"
  ];
  doc.querySelectorAll(selectors.join(",")).forEach((el) => el.remove());

  // 追踪像素/用户同步图片：在 HTML fallback 里也很常见（而且经常会变成破图/大空白）。
  // 策略：只删除“高度可疑”的小图与已知 tracker 域名，避免误伤正文图片。
  const imgs = [...doc.querySelectorAll<HTMLImageElement>("img")];
  for (const img of imgs) {
    const src = (img.getAttribute("src") ?? "").trim();
    const lower = src.toLowerCase();
    const wRaw = (img.getAttribute("width") ?? "").trim();
    const hRaw = (img.getAttribute("height") ?? "").trim();
    const w = wRaw ? Number.parseInt(wRaw, 10) : 0;
    const h = hRaw ? Number.parseInt(hRaw, 10) : 0;

    // 1x1 / 2x2 像素：几乎确定是 tracker
    if ((w > 0 && w <= 2) || (h > 0 && h <= 2)) {
      img.remove();
      continue;
    }

    // data gif：常见透明占位/追踪
    if (lower.startsWith("data:image/gif")) {
      img.remove();
      continue;
    }

    const bad = [
      "imgvc.com/i/bf.png",
      "sync.intentiq.com/profiles_engine",
      "intentiq.com/profiles_engine",
      "sync.adkernel.com/user-sync",
      "creativecdn.com/cm-notify",
      "u.4dex.io/setuid",
      "doubleclick.net",
      "adservice.google.com",
      "adsystem.com"
    ];
    if (bad.some((x) => lower.includes(x))) {
      img.remove();
      continue;
    }
  }
}

function pruneMainElement(main: HTMLElement, baseUrl: string) {
  let host = "";
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    // ignore
  }

  const hardCutAt = (sentinel: Element | null) => {
    if (!sentinel) return;
    const parent = sentinel.parentElement;
    if (!parent) {
      sentinel.remove();
      return;
    }
    let cur: Element | null = sentinel;
    while (cur) {
      const next: Element | null = cur.nextElementSibling;
      cur.remove();
      cur = next;
    }
    // 如果 sentinel 父节点被删空，也顺带移除（避免残留空壳影响抽取）
    if (parent !== main && parent.children.length === 0 && (parent.textContent ?? "").trim().length === 0) {
      parent.remove();
    }
  };

  // 0) 站点特化（先截断再删除）：某些站点会把“文章结束后的讨论/导航/页脚”塞在主容器内部。
  // 如果不先截断，后续的通用去噪/链接密度剪枝仍可能遗漏，导致正文尾部出现大量杂质。
  if (host.endsWith("animenewsnetwork.com")) {
    // ANN：文章正文结束点通常在 “discuss this in the forum / social-bookmarks / footer” 附近
    hardCutAt(main.querySelector("#social-bookmarks"));
    hardCutAt(main.querySelector("#footer"));

    // 讨论入口：直接把其所在的小容器移除（避免遗留 `|` 或孤立链接）
    const discussAnchors = [
      ...main.querySelectorAll<HTMLAnchorElement>("a[href^='/cms/discuss/'], a[href*='/cms/discuss/']")
    ];
    for (const a of discussAnchors) {
      const container = (a.closest("div, p, li, section") as HTMLElement | null) ?? a;
      if (container && container !== main) container.remove();
      else a.remove();
    }
  }

  if (host.endsWith("inside-games.jp") || host.endsWith("animeanime.jp")) {
    // 这两站的页脚/侧栏常作为普通 div/section 插在主容器里（不是 <footer>），必须硬截断。
    hardCutAt(main.querySelector(".footer-common-link"));
    hardCutAt(main.querySelector(".thm-footer"));
    hardCutAt(main.querySelector(".footer-nav"));
    hardCutAt(main.querySelector(".footer-sitemap"));
  }

  if (host.endsWith("otakumode.com")) {
    // TOM：正文后常接评论/工具栏/推荐等大块；先硬截断，避免尾部污染成“链接+大图墙”。
    hardCutAt(main.querySelector(".p-article__comments"));
    hardCutAt(main.querySelector(".p-article__toolbox"));
  }

  if (host.endsWith("natalie.mu")) {
    // ナタリー：正文后会拼接“タグ / 関連人物 / 推荐卡片”等大块内容（含大量缩略图与链接）
    // 如果主容器不是 `.NA_article_body`，这里必须硬截断，避免全文预览变成“图墙”。
    hardCutAt(main.querySelector(".NA_article_tag"));
    // 正文中部/尾部的“関連記事”也属于壳内容
    const embeds = [...main.querySelectorAll<HTMLElement>(".NA_article_embed_article")];
    for (const el of embeds) el.remove();
  }

  // 1) 站点特化：优先移除“已知非正文”的块（比纯 heuristics 更稳）
  const siteSelectors: string[] = [];
  if (host.endsWith("animenewsnetwork.com")) {
    siteSelectors.push(
      "instaread-player",
      "[data-user-preferences-action-open]",
      "#content-preferences",
      "#social-bookmarks",
      "#footer",
      ".box[data-topics]"
    );
  }
  if (host.endsWith("inside-games.jp") || host.endsWith("animeanime.jp")) {
    // 这两站常见“购物导流/社媒嵌入”会把正文污染成广告+链接堆
    siteSelectors.push(
      // 顶部“推荐/导流”列表（正文无关）
      ".pickup-text-list",
      ".main-pickup",
      ".main-ranking",
      "#_popIn_recommend",
      ".af_box",
      ".af_list",
      "[class^='af_']",
      "[class*=' af_']",
      "figure.ctms-editor-twitter",
      ".ctms-editor-twitter",
      "blockquote.twitter-tweet",
      ".twitter-tweet",
      "figure.ctms-editor-instagram",
      ".instagram-media",
      // 列表/侧栏/推荐/分享：属于页面壳内容
      ".recommended-list",
      ".recommended-ttl",
      ".share-block",
      ".sidebox",
      "article.pickup-content",
      "article.feature-content",
      "article.ranking-content",
      "article.side-content"
    );
  }
  if (host.endsWith("natalie.mu")) {
    siteSelectors.push(
      ".NA_article_embed_article",
      ".NA_article_tag",
      ".NA_article_img_link",
      ".NA_article_data",
      ".NA_article_score",
      ".NA_article_score-comment"
    );
  }
  if (host.endsWith("otakumode.com")) {
    siteSelectors.push(
      // 全局导航（有时会被塞进 article 内）
      ".p-global-header-wrapper",
      ".p-global-header",
      ".p-global-nav",
      ".p-news-nav",
      ".p-news-categories-nav",
      // 正文之外的工具/评论/导流
      ".p-article__toolbox",
      ".p-article__tool-btn",
      ".p-article__comments",
      // 部分页面会把这些 meta 段落当作正文的一部分输出，直接剥离以减少噪音
      ".p-article__meta"
    );
  }

  // 2) 通用去噪：正文内部依然可能夹带“相关推荐/分享/面包屑/订阅”等块
  const genericSelectors = [
    "nav",
    "header",
    "footer",
    "aside",
    ".share",
    ".shares",
    ".social",
    ".sns",
    ".comment",
    ".comments",
    ".related",
    ".recommend",
    ".recommended",
    ".newsletter",
    ".subscribe",
    ".breadcrumb",
    ".breadcrumbs",
    ".pagination",
    ".pager",
    ".ad",
    ".ads",
    ".adsbygoogle",
    ".advertisement",
    // 更激进：一些站点用 af_* 做导购模块，不一定叫 ad/ads
    ".af_box",
    ".af_list"
  ];

  const mergedSelectors = [...siteSelectors, ...genericSelectors];
  if (mergedSelectors.length > 0) {
    main.querySelectorAll(mergedSelectors.join(",")).forEach((el) => el.remove());
  }

  // 3) 链接密度剪枝：把“几乎全是链接”的导航块/站点目录从正文里剥离
  // 目标：减少“杂七杂八全进来”的情况；策略尽量保守，避免误删正文段落。
  const noisyKeywords = [
    "related",
    "recommended",
    "recommend",
    "popular",
    "ranking",
    "archive",
    "archives",
    "newsletter",
    "subscribe",
    "follow",
    "share",
    "tag",
    "tags",
    "category",
    "categories",
    "関連記事",
    "関連",
    "おすすめ",
    "人気",
    "ランキング",
    "タグ",
    "カテゴリ",
    "シェア"
  ];

  const normalizeText = (s: string) => s.replace(/\s+/g, " ").trim();
  const linkMetrics = (el: HTMLElement) => {
    const text = normalizeText(el.textContent ?? "");
    const textLen = text.length;
    const links = [...el.querySelectorAll<HTMLAnchorElement>("a")];
    const aCount = links.length;
    const aTextLen = links.reduce((sum, a) => sum + normalizeText(a.textContent ?? "").length, 0);
    const pCount = el.querySelectorAll("p").length;
    const liCount = el.querySelectorAll("li").length;
    const imgCount = el.querySelectorAll("img").length;
    const linkDensity = aTextLen / Math.max(1, textLen);
    const lower = text.toLowerCase();
    const keywordHit = noisyKeywords.some((k) => lower.includes(k.toLowerCase()));
    return { text, textLen, aCount, aTextLen, pCount, liCount, imgCount, linkDensity, keywordHit };
  };

  const candidates = [
    ...main.querySelectorAll<HTMLElement>("section, nav, aside, div, ul, ol, table, details")
  ].reverse();
  for (const el of candidates) {
    if (el === main) continue;

    const tag = el.tagName.toUpperCase();
    if (tag === "P") continue;
    if (tag === "H1" || tag === "H2" || tag === "H3" || tag === "H4" || tag === "H5" || tag === "H6")
      continue;

    const m = linkMetrics(el);

    // 极端链接块：短文本 + 高链接密度 + 几乎没有段落/图片 => 直接移除
    if (m.textLen <= 260 && m.linkDensity >= 0.72 && m.pCount <= 0 && m.imgCount <= 0 && m.aCount >= 6) {
      el.remove();
      continue;
    }

    // 更激进：标签/目录/推荐常是“少量文本 + 一堆链接”，li 不一定很多
    if (
      (tag === "UL" || tag === "OL") &&
      m.liCount >= 4 &&
      m.linkDensity >= 0.74 &&
      m.pCount <= 0 &&
      m.imgCount <= 0 &&
      m.textLen <= 420
    ) {
      el.remove();
      continue;
    }

    // 更激进：如果一个块几乎全是链接，并且没有明显正文段落，就当作“导航/推荐”剥离
    if (m.linkDensity >= 0.82 && m.aCount >= 4 && m.pCount <= 1 && m.imgCount <= 0 && m.textLen <= 1800) {
      el.remove();
      continue;
    }

    // 目录型列表：li 多 + 链接多 + 正文段落少 => 移除
    if (
      (tag === "UL" || tag === "OL") &&
      m.liCount >= 10 &&
      m.linkDensity >= 0.62 &&
      m.pCount <= 1 &&
      m.imgCount <= 0
    ) {
      el.remove();
      continue;
    }

    // 关键词命中：像“相关推荐/排行/标签/分享”等，又是链接为主的块 => 移除
    if (m.keywordHit && m.aCount >= 6 && m.linkDensity >= 0.42 && m.pCount <= 2 && m.textLen <= 2200) {
      el.remove();
      continue;
    }
  }
}

async function loadFullTextViaJina(params: { url: string; timeoutMs: number }): Promise<FullTextLoadResult> {
  const { url, timeoutMs } = params;
  const readerUrl = `https://r.jina.ai/${url}`;
  const res = await fetchWithTimeout(readerUrl, timeoutMs);
  if (!res.ok) return { md: "", source: "jina", status: res.status };
  const text = await res.text();
  const md = parseJinaMarkdown(text);
  return { md, source: "jina", status: res.status };
}

async function loadFullTextViaAllOrigins(params: {
  url: string;
  timeoutMs: number;
}): Promise<FullTextLoadResult> {
  const { url, timeoutMs } = params;
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  const res = await fetchWithTimeout(proxyUrl, timeoutMs);
  if (!res.ok) return { md: "", source: "allorigins", status: res.status };
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  cleanupHtmlDocument(doc, url);
  const main = pickMainElement(doc, url);
  pruneMainElement(main, url);
  const md = htmlElementToMarkdown(main, url);
  return { md, source: "allorigins", status: res.status };
}

async function loadFullTextViaCodeTabs(params: {
  url: string;
  timeoutMs: number;
}): Promise<FullTextLoadResult> {
  const { url, timeoutMs } = params;
  const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
  const res = await fetchWithTimeout(proxyUrl, timeoutMs);
  if (!res.ok) return { md: "", source: "codetabs", status: res.status };
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  cleanupHtmlDocument(doc, url);
  const main = pickMainElement(doc, url);
  pruneMainElement(main, url);
  const md = htmlElementToMarkdown(main, url);
  return { md, source: "codetabs", status: res.status };
}

function isProbablyIndexUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = (u.pathname || "/").toLowerCase();
    if (path === "/" || path === "") return true;
    if (path.endsWith("/archive") || path.includes("/archive/")) return true;
    if (/^\/(news|interest|feature|review|convention|column|press-release|newsfeed)\/?$/.test(path))
      return true;
    return false;
  } catch {
    return false;
  }
}

function looksLikeIndexMarkdown(md: string): boolean {
  const text = md.replace(/\r\n/g, "\n").trim();
  if (!text) return false;

  const lower = text.toLowerCase();
  const strongSignals = [
    "chronological archives",
    "alphabetical archives",
    "time archives",
    "按字母顺序排列的档案",
    "时间档案"
  ];
  if (strongSignals.some((s) => lower.includes(s.toLowerCase()))) return true;

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 18) return false;

  // 列表行：有些站点会输出 `*04:00...`（无空格），因此这里允许 `\s*`
  const listLine = (l: string) => /^(\*|-)\s*\S+/.test(l) || /^\d+\.\s*\S+/.test(l);
  const headingLine = (l: string) => /^#{2,6}\s+/.test(l);
  const timeLine = (l: string) => /^(\*|-)?\s*\d{1,2}:\d{2}\b/.test(l);
  const dateLine = (l: string) =>
    /^(\*|-)?\s*\d{1,2}\s*月\s*\d{1,2}\s*日\b/.test(l) ||
    /^(\*|-)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(l);

  let listCount = 0;
  let timeCount = 0;
  let dateCount = 0;
  let paragraphCount = 0;

  for (const l of lines) {
    if (timeLine(l)) timeCount += 1;
    if (dateLine(l)) dateCount += 1;
    if (listLine(l)) {
      listCount += 1;
      continue;
    }
    if (headingLine(l)) continue;
    if (l.length >= 80) paragraphCount += 1;
  }

  const ratio = listCount / Math.max(1, lines.length);
  if (ratio > 0.62 && (timeCount >= 8 || dateCount >= 8) && paragraphCount <= 4) return true;
  if (ratio > 0.75 && paragraphCount <= 8) return true;
  return false;
}

function shouldRejectFullTextMarkdown(md: string, url: string): boolean {
  const normalized = normalizeFullTextMarkdown(md);
  if (!normalized) return true;

  // 兜底：内部占位符不应暴露给用户，出现即视为异常
  if (/@@ACG/i.test(normalized) || /＠＠ACG/i.test(normalized)) return true;

  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    // ignore
  }

  const lower = normalized.toLowerCase();

  // 1) Jina / Proxy 偶发会返回 JSON 错误体（HTTP 仍可能是 200），如果不拒绝会被当作正文渲染成“乱码一坨”。
  const head = normalized.trim().slice(0, 2200);
  const headLower = head.toLowerCase();
  if (head.startsWith("{") || head.startsWith("[")) {
    const jsonSignals = [
      "securitycompromiseerror",
      '"code":451',
      '"status":451',
      "blocked until",
      "anonymous access",
      "readablemessage",
      '"name":"security',
      '"name": "security',
      '"message":',
      '"code":'
    ];
    if (jsonSignals.some((s) => headLower.includes(s))) return true;
  }

  // 2) 明显 HTML/XML：说明抽取器没正常输出 markdown
  if (/^<!doctype\s+html/i.test(head) || /^<html/i.test(head) || /^<\?xml/i.test(head)) return true;

  const blockedSignals = [
    "attention required",
    "cloudflare",
    "enable javascript",
    "enable cookies",
    "captcha",
    "access denied",
    "temporarily unavailable",
    "service unavailable",
    "are you a human",
    "robot check"
  ];
  if (blockedSignals.some((s) => lower.includes(s))) return true;

  // ANN 常见“懒加载占位图”污染：会导致全文预览出现空白大图（/img/spacer.gif）。
  // 这类内容属于抽取质量问题，直接判失败以触发重新提取（或换源）。
  if (host.endsWith("animenewsnetwork.com")) {
    if (lower.includes("/img/spacer.gif") && /!\[[^\]]*\]\([^)]*spacer\.gif[^)]*\)/i.test(normalized))
      return true;
  }

  // 3) 站点“整页壳”dump（导航/页脚/追踪图混入）：对文章页直接拒绝，走 HTML 抽取更干净。
  // 说明：这是导致“全文预览满屏杂乱链接/大图/无意义菜单”的核心根因之一。
  const headLines = normalized
    .split("\n")
    .slice(0, 140)
    .map((l) => l.trim())
    .filter(Boolean);
  const headBlob = headLines.join(" ").toLowerCase();
  const bulletLinkCount = headLines.filter((l) => /^[-*]\s+\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(l)).length;
  const longLineCount = headLines.filter((l) => l.length >= 140).length;
  const navKeywords = [
    "home",
    "about",
    "privacy",
    "contact",
    "rss",
    "login",
    "log in",
    "sign up",
    "subscribe",
    "newsletter",
    "category",
    "categories",
    "ranking",
    "search",
    "twitter",
    "facebook",
    "youtube",
    "ホーム",
    "アクセスランキング",
    "特集",
    "ランキング",
    "お問い合わせ",
    "ログイン",
    "会員登録",
    "カテゴリ",
    "タグ"
  ];
  const navHit = navKeywords.some((k) => headBlob.includes(k.toLowerCase()));
  const logoHit = headLines.some((l) =>
    /\[!\[[^\]]*\]\((https?:\/\/|\/\/)[^)]+\)\]\(https?:\/\/[^)]+\/\)/.test(l)
  );
  if (
    !isProbablyIndexUrl(url) &&
    bulletLinkCount >= 10 &&
    navHit &&
    longLineCount === 0 &&
    (logoHit || bulletLinkCount >= 14)
  )
    return true;

  // inside/animeanime：Jina 输出经常包含站点壳文本 + 菜单，必须拒绝。
  if (host.endsWith("inside-games.jp") || host.endsWith("animeanime.jp")) {
    if (
      bulletLinkCount >= 10 &&
      (headBlob.includes("人生にゲームをプラスするメディア") ||
        headBlob.includes("インサイド") ||
        headBlob.includes("animeanime"))
    ) {
      return true;
    }
  }

  // TOM：开头常是全站导航（Shop/News/Gallery/Otapedia…），拒绝走 HTML 抽取。
  if (host.endsWith("otakumode.com")) {
    const tomSignals = [
      "tokyo otaku mode",
      "otapedia",
      "shop",
      "gallery",
      "news",
      "log in",
      "sign up",
      "shopping guide"
    ];
    const hits = tomSignals.filter((s) => headBlob.includes(s)).length;
    if (bulletLinkCount >= 8 && hits >= 3) return true;
  }

  // 目录/导航 dump：对“文章页”直接拒绝
  if (!isProbablyIndexUrl(url) && looksLikeIndexMarkdown(normalized)) return true;

  return false;
}

async function loadFullTextMarkdown(params: { url: string; timeoutMs: number }): Promise<FullTextLoadResult> {
  const { url, timeoutMs } = params;

  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    // ignore
  }

  const skipJina =
    host.endsWith("inside-games.jp") ||
    host.endsWith("animeanime.jp") ||
    // TOM 的 Jina 输出经常夹带全站导航/工具栏，且容易把“图片墙”放大成噪音，直接跳过
    host.endsWith("otakumode.com");

  // 1) 首选：Jina Reader（质量高，输出 Markdown）
  let primary: FullTextLoadResult | null = null;
  if (!skipJina) {
    try {
      primary = await loadFullTextViaJina({ url, timeoutMs });
      if (primary.md) {
        // 兜底：Jina 偶发会返回“站点目录/导航 dump”或“拦截页文本”，这种内容必须判失败走后备抽取。
        if (shouldRejectFullTextMarkdown(primary.md, url)) primary.md = "";
        else return primary;
      }
    } catch {
      // ignore（走后备）
    }
  }

  // 2) 后备：AllOrigins（CORS proxy）+ 本地 HTML 抽取
  // 注：此方案不一定能达到 Reader 的结构化质量，但能显著减少 451/403 导致的“完全不可用”。
  let fallback: FullTextLoadResult | null = null;
  try {
    fallback = await loadFullTextViaAllOrigins({ url, timeoutMs });
    if (fallback.md) {
      if (!shouldRejectFullTextMarkdown(fallback.md, url)) return fallback;
      fallback.md = "";
    }
  } catch {
    // ignore（统一抛错）
  }

  // 3) 再后备：CodeTabs proxy + 本地 HTML 抽取（补 AllOrigins 偶发 5xx / 限流）
  let fallback2: FullTextLoadResult | null = null;
  try {
    fallback2 = await loadFullTextViaCodeTabs({ url, timeoutMs });
    if (fallback2.md) {
      if (!shouldRejectFullTextMarkdown(fallback2.md, url)) return fallback2;
      fallback2.md = "";
    }
  } catch {
    // ignore（统一抛错）
  }

  // 都失败：抛出更可诊断的错误（用于 UI 提示）
  const status = primary?.status ?? fallback?.status ?? fallback2?.status;
  const err = new Error(status ? `HTTP ${status}` : "load_failed") as Error & { status?: number };
  err.status = status;
  throw err;
}

function chunkForTranslate(text: string, maxLen: number): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxLen) return [normalized];

  const paras = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    const c = current.trim();
    if (c) chunks.push(c);
    current = "";
  };

  for (const p of paras) {
    const next = current ? `${current}\n\n${p}` : p;
    if (next.length <= maxLen) {
      current = next;
      continue;
    }

    flush();

    // 单段过长：硬切（尽量保留换行）
    if (p.length > maxLen) {
      for (let i = 0; i < p.length; i += maxLen) {
        chunks.push(p.slice(i, i + maxLen));
      }
      continue;
    }

    current = p;
  }

  flush();
  return chunks.length > 0 ? chunks : [normalized.slice(0, maxLen)];
}

function parseGoogleGtx(json: unknown): string | null {
  if (!Array.isArray(json)) return null;
  const top0 = json[0];
  if (!Array.isArray(top0)) return null;
  const parts: string[] = [];
  for (const seg of top0) {
    if (!Array.isArray(seg)) continue;
    const out = seg[0];
    if (typeof out === "string" && out) parts.push(out);
  }
  const joined = parts.join("");
  return joined.trim() ? joined : null;
}

export async function translateViaGtx(params: {
  text: string;
  target: FullTextLang;
  timeoutMs: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<string> {
  const { text, target, timeoutMs, onProgress } = params;
  const tl = target === "zh" ? "zh-CN" : "ja";

  // URL 长度与服务稳定性：保守切块
  const chunks = chunkForTranslate(text, 1200);
  const outParts: string[] = [];

  for (let i = 0; i < chunks.length; i += 1) {
    onProgress?.(i, chunks.length);
    const q = chunks[i] ?? "";
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
      tl
    )}&dt=t&q=${encodeURIComponent(q)}`;
    const res = await fetchWithTimeout(url, timeoutMs);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as unknown;
    const translated = parseGoogleGtx(json);
    outParts.push(translated ?? q);
  }
  onProgress?.(chunks.length, chunks.length);
  return outParts.join("\n\n").trim();
}

export function wireFullTextReader() {
  const blocks = [...document.querySelectorAll<HTMLElement>("[data-fulltext]")];
  if (blocks.length === 0) return;

  for (const block of blocks) {
    const lang = (block.dataset.fulltextLang as FullTextLang | undefined) ?? (isJapanese() ? "ja" : "zh");
    const postId = block.dataset.fulltextPostId ?? "";
    const url = block.dataset.fulltextUrl ?? "";
    const autoload = block.dataset.fulltextAutoload === "true";

    const statusEl = block.querySelector<HTMLElement>("[data-fulltext-status]");
    const contentEl = block.querySelector<HTMLElement>("[data-fulltext-content]");
    const btnReload = block.querySelector<HTMLButtonElement>('[data-fulltext-action="reload"]');
    const btnShowOriginal = block.querySelector<HTMLButtonElement>('[data-fulltext-action="show-original"]');
    const btnShowTranslated = block.querySelector<HTMLButtonElement>(
      '[data-fulltext-action="show-translated"]'
    );

    if (!postId || !url || !contentEl) continue;

    let viewMode: "auto" | "original" | "translated" = "auto";
    let loadPromise: Promise<void> | null = null;
    let translatePromise: Promise<void> | null = null;
    // 说明：全文可能很长，localStorage 写入会被配额/上限拦截（或被我们主动跳过）。
    // 但用户在“本次会话”里依然应该能用「查看原文/查看翻译」切换，所以保留内存态兜底。
    let memoryCache: FullTextCacheEntry | null = null;
    let renderSeq = 0;

    type FullTextRenderPayload = { html: string; blocks?: string[] };

    type FullTextWorkerPending =
      | { kind: "render"; resolve: (payload: FullTextRenderPayload) => void; reject: (err: Error) => void }
      | {
          kind: "translate";
          resolve: (translated: string) => void;
          reject: (err: Error) => void;
          onProgress?: (done: number, total: number) => void;
        };

    let worker: Worker | null = null;
    let workerBroken = false;
    let workerRequestSeq = 0;
    const workerPending = new Map<number, FullTextWorkerPending>();

    const invalidateWorker = (reason: string) => {
      workerBroken = true;
      try {
        worker?.terminate();
      } catch {
        // ignore
      }
      worker = null;

      for (const pending of workerPending.values()) {
        try {
          pending.reject(new Error(reason));
        } catch {
          // ignore
        }
      }
      workerPending.clear();
    };

    const ensureWorker = (): Worker | null => {
      if (workerBroken) return null;
      if (worker) return worker;

      let next: Worker;
      try {
        next = new Worker(new URL("../workers/fulltext.worker.ts", import.meta.url), { type: "module" });
      } catch {
        workerBroken = true;
        return null;
      }

      worker = next;

      worker.addEventListener("message", (ev: MessageEvent<FullTextWorkerOutMessage>) => {
        const msg = ev.data;
        if (!msg || typeof msg !== "object") return;

        if (msg.type === "progress") {
          const pending = workerPending.get(msg.requestId);
          if (pending?.kind === "translate") pending.onProgress?.(msg.done, msg.total);
          return;
        }

        if (msg.type === "render_result") {
          const pending = workerPending.get(msg.requestId);
          if (pending?.kind !== "render") return;
          workerPending.delete(msg.requestId);
          pending.resolve({ html: msg.html, blocks: msg.blocks });
          return;
        }

        if (msg.type === "translate_result") {
          const pending = workerPending.get(msg.requestId);
          if (pending?.kind !== "translate") return;
          workerPending.delete(msg.requestId);
          pending.resolve(msg.translated);
          return;
        }

        if (msg.type === "error") {
          const requestId = msg.requestId;
          if (typeof requestId !== "number") return;
          const pending = workerPending.get(requestId);
          if (!pending) return;
          workerPending.delete(requestId);
          pending.reject(new Error(msg.message || "worker_error"));
        }
      });

      worker.addEventListener("error", () => {
        invalidateWorker("worker_crash");
      });

      worker.addEventListener("messageerror", () => {
        invalidateWorker("worker_messageerror");
      });

      return worker;
    };

    const renderHtmlMainThread = (md: string): FullTextRenderPayload => ({
      html: stripInternalPlaceholdersFromHtml(renderMarkdownToHtml(md, url))
    });

    const renderHtml = async (md: string): Promise<FullTextRenderPayload> => {
      // 小文本直接主线程渲染，避免 Worker 启动/通信开销。
      const shouldUseWorker = md.length >= 8000 || isLowPerfMode();
      if (!shouldUseWorker) return renderHtmlMainThread(md);

      const w = ensureWorker();
      if (!w) return renderHtmlMainThread(md);

      const requestId = (workerRequestSeq += 1);
      return await new Promise<FullTextRenderPayload>((resolve, reject) => {
        workerPending.set(requestId, { kind: "render", resolve, reject });
        try {
          w.postMessage({ type: "render", requestId, md, baseUrl: url } satisfies FullTextWorkerInMessage);
        } catch (err) {
          workerPending.delete(requestId);
          invalidateWorker("worker_post_failed");
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }).catch(() => renderHtmlMainThread(md));
    };

    const translateText = async (params: {
      text: string;
      target: FullTextLang;
      timeoutMs: number;
      onProgress?: (done: number, total: number) => void;
    }): Promise<string> => {
      const { text, target, timeoutMs, onProgress } = params;

      const w = ensureWorker();
      if (!w) return await translateViaGtx({ text, target, timeoutMs, onProgress });

      const requestId = (workerRequestSeq += 1);
      return await new Promise<string>((resolve, reject) => {
        workerPending.set(requestId, { kind: "translate", resolve, reject, onProgress });
        try {
          w.postMessage({
            type: "translate",
            requestId,
            text,
            target,
            timeoutMs
          } satisfies FullTextWorkerInMessage);
        } catch (err) {
          workerPending.delete(requestId);
          invalidateWorker("worker_post_failed");
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    };

    const setStatus = (text: string) => {
      if (!statusEl) return;
      statusEl.textContent = text;
      statusEl.classList.toggle("hidden", text.trim().length === 0);
    };

    const flashStatus = (text: string, ms: number) => {
      if (!text.trim()) return;
      setStatus(text);
      window.setTimeout(() => {
        if ((statusEl?.textContent ?? "") === text) setStatus("");
      }, ms);
    };

    const render = (text: string) => {
      renderSeq += 1;
      const seq = renderSeq;

      const applyRendered = (rendered: FullTextRenderPayload) => {
        if (seq !== renderSeq) return;

        delete contentEl.dataset.acgProseEnhanced;
        delete contentEl.dataset.acgProseKind;

        // 说明：以下逻辑会遍历/重写 DOM，移动端可能造成“卡一下”；因此延后到 idle 执行。
        // 使用 seq 防止快速切换（原文/翻译/重试）导致重复后处理与错序写入。
        const postProcess = () => {
          if (seq !== renderSeq) return;

          let kind: ProseKind = "article";
          try {
            kind = detectProseKind(contentEl);
            contentEl.dataset.acgProseKind = kind;
          } catch {
            // ignore
          }

          if (kind === "article") {
            try {
              pruneProseArticleJunk(contentEl);
            } catch {
              // ignore
            }
          }

          if (kind === "index") {
            try {
              enhanceProseIndex(contentEl);
            } catch {
              // ignore
            }
          }

          const lowPerf = isLowPerfMode();
          const imgCount = contentEl.querySelectorAll("img").length;
          const linkCount = contentEl.querySelectorAll("a[href]").length;

          // 低性能模式：对“增强”做阈值限制（优先保证滚动与交互）。
          if (!lowPerf || imgCount <= 36) {
            try {
              enhanceProseImageGalleries(contentEl);
            } catch {
              // ignore
            }
          }

          if (!lowPerf || linkCount <= 220) {
            try {
              enhanceLinkListItems(contentEl);
            } catch {
              // ignore
            }
          }
        };

        const schedulePostProcess = () => {
          const timeoutMs = isLowPerfMode() ? FULLTEXT_POSTPROCESS_IDLE_TIMEOUT_MS : 600;
          runWhenIdle(postProcess, timeoutMs);
        };

        const applyHtmlOnce = (html: string) => {
          contentEl.innerHTML = html;
          schedulePostProcess();
        };

        const getBlocksForProgressive = (): string[] | null => {
          if (Array.isArray(rendered.blocks) && rendered.blocks.length > 0) {
            const b = rendered.blocks.map((x) => x.trim()).filter((x) => x.length > 0);
            if (b.length > 0) return b;
          }

          try {
            const b = renderMarkdownToHtmlBlocks(text, url)
              .map(stripInternalPlaceholdersFromHtml)
              .map((x) => x.trim())
              .filter((x) => x.length > 0);
            return b.length > 0 ? b : null;
          } catch {
            return null;
          }
        };

        const shouldProgressive =
          isLowPerfMode() ||
          rendered.html.length >= 24_000 ||
          (Array.isArray(rendered.blocks) ? rendered.blocks.length >= 44 : false);

        if (!shouldProgressive) {
          applyHtmlOnce(rendered.html);
          return;
        }

        const blocks = getBlocksForProgressive();
        if (!blocks) {
          applyHtmlOnce(rendered.html);
          return;
        }

        try {
          contentEl.innerHTML = "";

          const tpl = document.createElement("template");
          let nextIndex = 0;

          const appendSome = (count: number) => {
            const frag = document.createDocumentFragment();
            const end = Math.min(blocks.length, nextIndex + Math.max(1, count));
            for (let i = nextIndex; i < end; i += 1) {
              tpl.innerHTML = blocks[i] ?? "";
              frag.appendChild(tpl.content);
            }
            nextIndex = end;
            contentEl.appendChild(frag);
          };

          // 优先快速渲染一小段（让首屏尽快可见），剩余内容在空闲时渐进追加。
          appendSome(isLowPerfMode() ? 6 : 10);

          const pump = (deadline?: IdleDeadlineLike) => {
            if (seq !== renderSeq) return;
            if (nextIndex >= blocks.length) {
              schedulePostProcess();
              return;
            }

            const start = performance.now();
            const timeRemaining =
              typeof deadline?.timeRemaining === "function" ? deadline.timeRemaining() : 0;
            const budgetMs = Math.max(6, Math.min(18, timeRemaining || (isLowPerfMode() ? 10 : 14)));
            const maxPerChunk = isLowPerfMode() ? 6 : 12;

            const frag = document.createDocumentFragment();
            let appended = 0;
            while (nextIndex < blocks.length) {
              tpl.innerHTML = blocks[nextIndex] ?? "";
              frag.appendChild(tpl.content);
              nextIndex += 1;
              appended += 1;
              if (appended >= maxPerChunk) break;
              if (performance.now() - start >= budgetMs) break;
            }
            contentEl.appendChild(frag);

            if (nextIndex >= blocks.length) {
              schedulePostProcess();
              return;
            }

            // 如果用户在滚动，放慢追加节奏，优先保证滚动流畅。
            const nextTimeout = isScrollingNow() ? 1600 : isLowPerfMode() ? 1200 : 900;
            runDuringIdle(pump, nextTimeout);
          };

          if (nextIndex >= blocks.length) schedulePostProcess();
          else runDuringIdle(pump, isLowPerfMode() ? 600 : 420);
        } catch {
          // 兜底：渐进渲染失败时回退到一次性渲染，不影响可用性
          applyHtmlOnce(rendered.html);
        }
      };

      void renderHtml(text)
        .then((rendered) => {
          applyRendered(rendered);
        })
        .catch(() => {
          // 兜底：避免渲染异常导致区域空白
          try {
            applyRendered({ html: `<pre><code>${escapeHtml(text)}</code></pre>` });
          } catch {
            // ignore
          }
        });
    };

    const hasTranslated = (cache: FullTextCacheEntry) =>
      lang === "zh" ? Boolean(cache.zh) : Boolean(cache.ja);
    const applyTranslated = (cache: FullTextCacheEntry, translated: string) => {
      if (lang === "zh") cache.zh = translated;
      else cache.ja = translated;
    };

    const getCache = (): FullTextCacheEntry | null => {
      const cache = memoryCache ?? readFullTextCache(postId);
      if (!cache || cache.url !== url) return null;
      if (!cache.original || cache.original.trim().length === 0) return null;
      if (shouldRejectFullTextMarkdown(cache.original, url)) return null;
      return cache;
    };

    const showOriginal = (cache: FullTextCacheEntry) => {
      memoryCache = cache;
      render(cache.original);
      if (btnShowOriginal) btnShowOriginal.hidden = true;
      if (btnShowTranslated) btnShowTranslated.hidden = false;
    };

    const showTranslated = (cache: FullTextCacheEntry) => {
      memoryCache = cache;
      const t = lang === "zh" ? cache.zh : cache.ja;
      if (!t) {
        // 翻译未就绪：保持原文视图（避免按钮状态来回跳，造成“点了没反应”的错觉）
        setStatus(lang === "ja" ? "翻訳がまだありません。" : "翻译还未完成。");
        if (btnShowOriginal) btnShowOriginal.hidden = true;
        if (btnShowTranslated) btnShowTranslated.hidden = false;
        return;
      }

      render(t);
      if (btnShowOriginal) btnShowOriginal.hidden = false;
      if (btnShowTranslated) btnShowTranslated.hidden = true;
    };

    const ensureLoaded = (force: boolean): Promise<void> => {
      if (loadPromise) return loadPromise;
      loadPromise = (async () => {
        try {
          setStatus(lang === "ja" ? "全文を読み込み中…" : "正在加载全文…");

          let cache: FullTextCacheEntry | null = force ? null : (memoryCache ?? readFullTextCache(postId));
          let loadResult: FullTextLoadResult | null = null;
          if (cache && cache.url !== url) cache = null;
          if (cache && shouldRejectFullTextMarkdown(cache.original, url)) cache = null;

          if (!cache || !cache.original) {
            loadResult = await loadFullTextMarkdown({ url, timeoutMs: FULLTEXT_REQUEST_TIMEOUT_MS });
            cache = {
              url,
              fetchedAt: new Date().toISOString(),
              original: normalizeFullTextMarkdown(loadResult.md)
            };
            writeFullTextCache(postId, cache);
          }
          memoryCache = cache;
          showOriginal(cache);
          setStatus("");

          if (loadResult && loadResult.source !== "jina") {
            flashStatus(
              lang === "ja" ? "代替解析で抽出済み。" : "已使用备用解析提取全文。",
              FULLTEXT_STATUS_FLASH_MS
            );
          }
        } catch (err) {
          const status = (() => {
            if (!err || typeof err !== "object") return undefined;
            const v = (err as Record<string, unknown>).status;
            return typeof v === "number" ? v : undefined;
          })();
          if (status === 451) {
            setStatus(
              lang === "ja"
                ? "読み込みに失敗しました (HTTP 451)。このサイトは外部リーダーを拒否している可能性があります。元記事を開いてください。"
                : "加载失败 (HTTP 451)：该来源可能拒绝第三方阅读模式。建议点击「打开原文」。"
            );
          } else if (status) {
            setStatus(
              lang === "ja"
                ? `読み込みに失敗しました (HTTP ${status})。元記事を開いてください。`
                : `加载失败 (HTTP ${status})：建议点击「打开原文」。`
            );
          } else {
            setStatus(
              lang === "ja"
                ? "読み込みに失敗しました。元記事を開いてください。"
                : "加载失败：建议点击「打开原文」。"
            );
          }
        }
      })().finally(() => {
        loadPromise = null;
      });
      return loadPromise;
    };

    const ensureTranslated = (): Promise<void> => {
      if (translatePromise) return translatePromise;
      translatePromise = (async () => {
        await ensureLoaded(false);
        const cache = getCache();
        if (!cache) return;
        if (hasTranslated(cache)) {
          if (viewMode !== "original") showTranslated(cache);
          return;
        }

        const snapshotUrl = cache.url;
        const snapshotOriginal = cache.original;

        if (btnReload) btnReload.disabled = true;
        if (btnShowTranslated) btnShowTranslated.disabled = true;

        setStatus(lang === "ja" ? "翻訳中…" : "正在翻译…");
        const translated = await translateText({
          text: cache.original,
          target: lang,
          timeoutMs: FULLTEXT_REQUEST_TIMEOUT_MS,
          onProgress: (done, total) => {
            if (total <= 1) return;
            const label =
              lang === "ja"
                ? `翻訳中… (${Math.min(done + 1, total)}/${total})`
                : `正在翻译… (${Math.min(done + 1, total)}/${total})`;
            setStatus(label);
          }
        });

        // 若用户中途点了「重新加载」，原文可能已变化：此时不要把旧翻译写回（避免错配）
        const current = memoryCache ?? readFullTextCache(postId);
        if (!current || current.url !== snapshotUrl || current.original !== snapshotOriginal) return;

        applyTranslated(current, translated);
        memoryCache = current;
        writeFullTextCache(postId, current);

        // 默认切到翻译（满足“选中文/日文就看懂”）；若用户明确选择了原文，则只提示“翻译已就绪”
        if (viewMode !== "original") showTranslated(current);
        else
          flashStatus(
            lang === "ja"
              ? "翻訳が完了しました。必要なら「翻訳を見る」を押してください。"
              : "翻译已就绪，如需查看请点击「查看翻译」。",
            2000
          );
        setStatus("");
      })()
        .catch((err) => {
          const msg =
            err instanceof Error
              ? err.message
              : (() => {
                  if (!err || typeof err !== "object") return String(err ?? "");
                  const m = (err as Record<string, unknown>).message;
                  return typeof m === "string" ? m : String(err);
                })();
          const m = /HTTP\s+(\d+)/i.exec(msg);
          if (m?.[1]) {
            setStatus(lang === "ja" ? `翻訳に失敗しました (HTTP ${m[1]})。` : `翻译失败 (HTTP ${m[1]})。`);
          } else {
            setStatus(lang === "ja" ? "翻訳に失敗しました。" : "翻译失败。");
          }
        })
        .finally(() => {
          if (btnReload) btnReload.disabled = false;
          if (btnShowTranslated) btnShowTranslated.disabled = false;
          translatePromise = null;
        });
      return translatePromise;
    };

    btnReload?.addEventListener("click", (e) => {
      e.preventDefault();
      void ensureLoaded(true).then(() => {
        if (viewMode !== "original") void ensureTranslated();
      });
    });

    btnShowOriginal?.addEventListener("click", (e) => {
      e.preventDefault();
      viewMode = "original";
      const cache = getCache();
      if (cache) showOriginal(cache);
      setStatus("");
    });

    btnShowTranslated?.addEventListener("click", (e) => {
      e.preventDefault();
      viewMode = "translated";
      void ensureTranslated();
    });

    // 初始：命中缓存就立即展示（纯本地，不影响性能）；翻译按“进入视口再启动”
    const cached = readFullTextCache(postId);
    if (
      cached &&
      cached.url === url &&
      cached.original &&
      !shouldRejectFullTextMarkdown(cached.original, url)
    ) {
      memoryCache = cached;
      if (hasTranslated(cached)) {
        viewMode = "translated";
        showTranslated(cached);
      } else {
        viewMode = "auto";
        showOriginal(cached);
      }
      setStatus("");
    }

    // 自动加载/翻译：进入视口再触发（显著降低“页面刚打开就卡卡的”）
    if (autoload) {
      const startTranslateIfWanted = () => {
        if (viewMode === "original") return;
        // 低性能模式：默认不自动翻译（保留手动入口）。
        if (isLowPerfMode()) return;

        // 滚动期：优先保证滚动与交互，延后到滚动停止再翻译。
        const tryStart = () => {
          if (viewMode === "original") return;
          if (isLowPerfMode()) return;
          if (isScrollingNow()) {
            window.setTimeout(tryStart, FULLTEXT_AUTO_TRANSLATE_SCROLL_DELAY_MS);
            return;
          }
          void ensureTranslated();
        };
        tryStart();
      };

      if (!("IntersectionObserver" in window)) {
        // 无 IO：退化为立即加载（但仍不强制翻译；翻译仅在用户点击或视图需要时触发）
        void ensureLoaded(false).then(startTranslateIfWanted);
      } else {
        // 1) 预取原文：接近视口时开始加载（降低“滚动到这里才开始转圈”的等待）
        if (!getCache()) {
          const ioLoad = new IntersectionObserver(
            (entries) => {
              if (!entries.some((e) => e.isIntersecting)) return;
              ioLoad.disconnect();
              void ensureLoaded(false);
            },
            { rootMargin: "0px 0px 900px 0px", threshold: 0 }
          );
          ioLoad.observe(block);
        }

        // 2) 启动翻译：真正进入视口后再翻译（避免在用户阅读上半部分时后台重活导致卡顿）
        const ioTranslate = new IntersectionObserver(
          (entries) => {
            const hit = entries.some((e) => e.isIntersecting && (e.intersectionRatio ?? 0) > 0);
            if (!hit) return;
            ioTranslate.disconnect();
            startTranslateIfWanted();
          },
          { threshold: 0.12 }
        );
        ioTranslate.observe(block);
      }
    }
  }
}
