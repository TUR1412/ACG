import type { Category } from "./categories";

export type SourceKind = "feed" | "html";

export type SourceIncludeRule = {
  /**
   * 正则表达式主体（不包含包裹用的 / /）
   * 示例: "foo|bar"
   */
  pattern: string;
  /**
   * 正则 flags（例如 "i"）
   */
  flags?: string;
};

export type SourceConfig = {
  id: string;
  name: string;
  kind: SourceKind;
  /**
   * Feed URL 或 HTML 列表入口（取决于 kind）
   */
  url: string;
  /**
   * 来源首页（用于 About/OPML 的 htmlUrl）
   */
  homepage?: string;
  category: Category;
  /**
   * 对来源条目做二次过滤（用于“泛 RSS/泛频道”场景）。
   * 规则必须可序列化，便于在 scripts/ 与 web-ui 之间共用。
   */
  include?: SourceIncludeRule;
};

export const SOURCE_CONFIGS: SourceConfig[] = [
  {
    id: "ann-all",
    name: "Anime News Network",
    kind: "feed",
    url: "https://www.animenewsnetwork.com/all/rss.xml?ann-edition=us",
    homepage: "https://www.animenewsnetwork.com/",
    category: "anime"
  },
  {
    id: "mal-news",
    name: "MyAnimeList News",
    kind: "feed",
    url: "https://myanimelist.net/rss/news.xml",
    homepage: "https://myanimelist.net/news",
    category: "anime"
  },
  {
    id: "animeanime-list",
    name: "アニメ！アニメ！",
    kind: "html",
    url: "https://animeanime.jp/article/",
    homepage: "https://animeanime.jp/",
    category: "anime"
  },
  {
    id: "inside-games",
    name: "Inside Games",
    kind: "feed",
    url: "https://www.inside-games.jp/rss/index.rdf",
    homepage: "https://www.inside-games.jp/",
    category: "game",
    include: {
      pattern: "コラボ|collab|聯動|アニメ|漫画|マンガ|声優|VTuber|ホロライブ",
      flags: "i"
    }
  },
  {
    id: "tom-news",
    name: "Tokyo Otaku Mode",
    kind: "feed",
    url: "https://otakumode.com/news/feed",
    homepage: "https://otakumode.com/",
    category: "goods"
  },
  {
    id: "natalie-music",
    name: "音楽ナタリー",
    kind: "feed",
    url: "https://natalie.mu/music/feed/news",
    homepage: "https://natalie.mu/music",
    category: "seiyuu",
    include: {
      pattern: "声優|アニメ|ゲーム|2\\.5次元|舞台|キャスト",
      flags: "i"
    }
  }
];

