import type { Category } from "./categories";

export type SourceKind = "feed" | "html";

export type SourceLang = "en" | "ja" | "zh" | "unknown";

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
   * 来源主要语言（用于离线预生成翻译时避免“同语种自翻译”）。
   * 若不确定可省略，默认按 unknown 处理。
   */
  lang?: SourceLang;
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
    lang: "en",
    url: "https://www.animenewsnetwork.com/all/rss.xml?ann-edition=us",
    homepage: "https://www.animenewsnetwork.com/",
    category: "anime"
  },
  {
    id: "mal-news",
    name: "MyAnimeList News",
    kind: "feed",
    lang: "en",
    url: "https://myanimelist.net/rss/news.xml",
    homepage: "https://myanimelist.net/news",
    category: "anime"
  },
  {
    id: "animeanime-list",
    name: "アニメ！アニメ！",
    kind: "feed",
    lang: "ja",
    url: "https://animeanime.jp/rss20/index.rdf",
    homepage: "https://animeanime.jp/",
    category: "anime"
  },
  {
    id: "inside-games",
    name: "Inside Games",
    kind: "feed",
    lang: "ja",
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
    lang: "en",
    url: "https://otakumode.com/news/feed",
    homepage: "https://otakumode.com/",
    category: "goods"
  },
  {
    id: "natalie-music",
    name: "音楽ナタリー",
    kind: "feed",
    lang: "ja",
    url: "https://natalie.mu/music/feed/news",
    homepage: "https://natalie.mu/music",
    category: "seiyuu",
    include: {
      pattern: "声優|アニメ|ゲーム|2\\.5次元|舞台|キャスト",
      flags: "i"
    }
  },
  {
    id: "natalie-comic",
    name: "コミックナタリー",
    kind: "feed",
    lang: "ja",
    url: "https://natalie.mu/comic/feed/news",
    homepage: "https://natalie.mu/comic",
    category: "anime"
  },
  {
    id: "natalie-stage",
    name: "ステージナタリー",
    kind: "feed",
    lang: "ja",
    url: "https://natalie.mu/stage/feed/news",
    homepage: "https://natalie.mu/stage",
    category: "seiyuu",
    include: {
      pattern: "声優|アニメ|ゲーム|2\\.5次元|舞台|キャスト",
      flags: "i"
    }
  },
  {
    id: "animecorner",
    name: "Anime Corner",
    kind: "feed",
    lang: "en",
    url: "https://animecorner.me/feed/",
    homepage: "https://animecorner.me/",
    category: "anime"
  },
  {
    id: "siliconera",
    name: "Siliconera",
    kind: "feed",
    lang: "en",
    url: "https://www.siliconera.com/feed/",
    homepage: "https://www.siliconera.com/",
    category: "anime"
  },
  {
    id: "gematsu",
    name: "Gematsu",
    kind: "feed",
    lang: "en",
    url: "https://www.gematsu.com/feed",
    homepage: "https://www.gematsu.com/",
    category: "game",
    include: {
      pattern: "collab|collaboration|crossover|anime|manga|vtuber|hololive|nijisanji|seiyuu|声優|アニメ|マンガ|漫画",
      flags: "i"
    }
  },
  {
    id: "game-watch",
    name: "GAME Watch",
    kind: "feed",
    lang: "ja",
    url: "https://game.watch.impress.co.jp/data/rss/1.0/gmw/feed.rdf",
    homepage: "https://game.watch.impress.co.jp/",
    category: "game",
    include: {
      pattern: "コラボ|collab|聯動|アニメ|漫画|マンガ|声優|VTuber|ホロライブ",
      flags: "i"
    }
  },
  {
    id: "hobby-watch",
    name: "HOBBY Watch",
    kind: "feed",
    lang: "ja",
    url: "https://hobby.watch.impress.co.jp/data/rss/1.0/hbw/feed.rdf",
    homepage: "https://hobby.watch.impress.co.jp/",
    category: "goods"
  }
];

