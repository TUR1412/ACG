import type { Lang } from "../i18n/i18n";
import { categoryLabel, CATEGORIES } from "./categories";
import type { SourceConfig } from "./source-config";

type OpmlParams = {
  title: string;
  dateCreated: string;
  ownerName?: string;
  language?: string;
  sources: SourceConfig[];
  lang: Lang;
};

function escapeXmlAttr(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function outline(attrs: Record<string, string | undefined>, children?: string[]): string {
  const kv = Object.entries(attrs)
    .filter(([, v]) => typeof v === "string" && v.length > 0)
    .map(([k, v]) => `${k}="${escapeXmlAttr(String(v))}"`)
    .join(" ");
  if (!children || children.length === 0) return `<outline ${kv} />`;
  return [`<outline ${kv}>`, ...children, `</outline>`].join("\n");
}

export function renderOpml(params: OpmlParams): string {
  const { title, dateCreated, ownerName, language, sources, lang } = params;

  const byCategory = new Map<string, SourceConfig[]>();
  for (const c of CATEGORIES) byCategory.set(c, []);
  for (const s of sources) byCategory.get(s.category)?.push(s);

  const bodyOutlines: string[] = [];
  for (const c of CATEGORIES) {
    const list = (byCategory.get(c) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
    if (list.length === 0) continue;

    const children = list.map((s) => {
      const isFeed = s.kind === "feed";
      return outline(
        {
          text: s.name,
          title: s.name,
          type: isFeed ? "rss" : "link",
          xmlUrl: isFeed ? s.url : undefined,
          htmlUrl: s.homepage ?? s.url,
          category: categoryLabel(lang, s.category)
        },
        []
      );
    });

    bodyOutlines.push(
      outline(
        {
          text: categoryLabel(lang, c),
          title: categoryLabel(lang, c)
        },
        children
      )
    );
  }

  const head = [
    "<head>",
    `<title>${escapeXmlAttr(title)}</title>`,
    `<dateCreated>${escapeXmlAttr(dateCreated)}</dateCreated>`,
    ownerName ? `<ownerName>${escapeXmlAttr(ownerName)}</ownerName>` : "",
    language ? `<language>${escapeXmlAttr(language)}</language>` : "",
    "</head>"
  ]
    .filter(Boolean)
    .join("\n");

  const body = ["<body>", ...bodyOutlines, "</body>"].join("\n");

  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<opml version=\"2.0\">",
    head,
    body,
    "</opml>",
    ""
  ].join("\n");
}

