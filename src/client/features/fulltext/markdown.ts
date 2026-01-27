import { bestInitialCoverSrc } from "../../utils/cover";

export function parseJinaMarkdown(raw: string): string {
  const marker = "Markdown Content:";
  const i = raw.indexOf(marker);
  const md = i >= 0 ? raw.slice(i + marker.length) : raw;
  return md.replace(/\r\n/g, "\n").trim();
}

export function escapeHtml(input: string): string {
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

export function normalizeFullTextMarkdown(md: string): string {
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

export function splitUrlForDisplay(href: string): { host: string; path: string } {
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

export function trimUrlTrailingPunct(raw: string): { url: string; trailing: string } {
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

export function stripEncodedTrailingPunct(input: string): string {
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

export function normalizeUrlForCompare(href: string): string {
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

export function looksLikeUrlText(text: string): boolean {
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
