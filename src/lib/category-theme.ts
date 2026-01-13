import type { Category } from "./categories";

export type CategoryTheme = {
  dot: string;
  ink: string;
  cover: string;
  glow: string;
};

export const CATEGORY_THEME: Record<Category, CategoryTheme> = {
  anime: {
    dot: "bg-violet-400",
    ink: "text-violet-900",
    cover: "from-violet-500/25 via-fuchsia-500/15 to-sky-500/20",
    glow: "bg-violet-500/10"
  },
  game: {
    dot: "bg-sky-400",
    ink: "text-sky-900",
    cover: "from-sky-500/25 via-cyan-500/15 to-emerald-500/15",
    glow: "bg-sky-500/10"
  },
  goods: {
    dot: "bg-amber-400",
    ink: "text-amber-900",
    cover: "from-amber-500/25 via-orange-500/15 to-rose-500/15",
    glow: "bg-amber-500/10"
  },
  seiyuu: {
    dot: "bg-emerald-400",
    ink: "text-emerald-900",
    cover: "from-emerald-500/25 via-teal-500/15 to-sky-500/15",
    glow: "bg-emerald-500/10"
  }
};

export function getCategoryTheme(category: Category): CategoryTheme {
  return CATEGORY_THEME[category];
}
