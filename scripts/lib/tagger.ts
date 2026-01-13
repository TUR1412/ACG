import type { Category } from "../../src/lib/categories";

const TAG_RULES: Array<{ tag: string; re: RegExp }> = [
  { tag: "PV/预告", re: /\bPV\b|ティザー|特報|予告|trailer|teaser/i },
  { tag: "定档/上映", re: /放送|配信|公開|上映|解禁|決定|start|premiere|release date/i },
  { tag: "联动/コラボ", re: /コラボ|collab|collaboration|联动/i },
  { tag: "手办/フィギュア", re: /フィギュア|figure|手办|ねんどろいど|nendoroid/i },
  { tag: "活动/イベント", re: /イベント|event|live|concert|フェス/i },
  { tag: "声优/キャスト", re: /声優|CV|出演|cast|voice actor/i }
];

export function deriveTags(input: { title: string; summary?: string; category: Category }): string[] {
  const blob = `${input.title}\n${input.summary ?? ""}`;
  const tags = TAG_RULES.filter((r) => r.re.test(blob)).map((r) => r.tag);
  if (tags.length === 0) {
    if (input.category === "game") return ["游戏"];
    if (input.category === "goods") return ["周边"];
    if (input.category === "seiyuu") return ["声优"];
    return ["资讯"];
  }
  return tags.slice(0, 6);
}
