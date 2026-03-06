import type { Category } from "./categories";

export type CategoryTheme = {
  dot: string;
  ink: string;
  cover: string;
  glow: string;
  featureLabelZh: string;
  featureLabelJa: string;
  entryLabelZh: string;
  entryLabelJa: string;
  moodZh: string;
  moodJa: string;
};

export const CATEGORY_THEME: Record<Category, CategoryTheme> = {
  anime: {
    dot: "bg-violet-400",
    ink: "text-violet-900",
    cover: "from-violet-500/25 via-fuchsia-500/15 to-sky-500/20",
    glow: "bg-violet-500/10",
    featureLabelZh: "动画特报",
    featureLabelJa: "ANIME FEATURE",
    entryLabelZh: "番剧档案",
    entryLabelJa: "ANIME FILE",
    moodZh: "新番 / 剧场版 / 制作消息",
    moodJa: "新作 / 劇場版 / 制作ニュース"
  },
  game: {
    dot: "bg-sky-400",
    ink: "text-sky-900",
    cover: "from-sky-500/25 via-cyan-500/15 to-emerald-500/15",
    glow: "bg-sky-500/10",
    featureLabelZh: "游戏前线",
    featureLabelJa: "GAME DROP",
    entryLabelZh: "联动速报",
    entryLabelJa: "GAME NOTE",
    moodZh: "联动 / 新游 / 平台动态",
    moodJa: "コラボ / 新作 / プラットフォーム"
  },
  goods: {
    dot: "bg-amber-400",
    ink: "text-amber-900",
    cover: "from-amber-500/25 via-orange-500/15 to-rose-500/15",
    glow: "bg-amber-500/10",
    featureLabelZh: "周边橱窗",
    featureLabelJa: "GOODS SHOWCASE",
    entryLabelZh: "收藏笔记",
    entryLabelJa: "GOODS PICK",
    moodZh: "手办 / 设定集 / 联名周边",
    moodJa: "フィギュア / 設定集 / コラボグッズ"
  },
  seiyuu: {
    dot: "bg-emerald-400",
    ink: "text-emerald-900",
    cover: "from-emerald-500/25 via-teal-500/15 to-sky-500/15",
    glow: "bg-emerald-500/10",
    featureLabelZh: "声优舞台",
    featureLabelJa: "VOICE STAGE",
    entryLabelZh: "现场纪要",
    entryLabelJa: "STAGE NOTE",
    moodZh: "活动 / 访谈 / 舞台消息",
    moodJa: "イベント / インタビュー / ステージニュース"
  }
};

export function getCategoryTheme(category: Category): CategoryTheme {
  return CATEGORY_THEME[category];
}
