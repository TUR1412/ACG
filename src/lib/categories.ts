import type { Lang } from "../i18n/i18n";

export const CATEGORIES = ["anime", "game", "goods", "seiyuu"] as const;
export type Category = (typeof CATEGORIES)[number];

const LABELS: Record<Lang, Record<Category, string>> = {
  zh: {
    anime: "动画",
    game: "游戏联动",
    goods: "周边手办",
    seiyuu: "声优活动"
  },
  ja: {
    anime: "アニメ",
    game: "ゲーム/コラボ",
    goods: "グッズ/フィギュア",
    seiyuu: "声優/イベント"
  }
};

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

export function categoryLabel(lang: Lang, category: Category): string {
  return LABELS[lang][category];
}

