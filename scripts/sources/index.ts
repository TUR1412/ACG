import type { Source } from "./types";

export const SOURCES: Source[] = [
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
    include: ({ title, summary }) => {
      const blob = `${title}\n${summary ?? ""}`;
      return /コラボ|collab|聯動|アニメ|漫画|マンガ|声優|VTuber|ホロライブ/i.test(blob);
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
    include: ({ title, summary }) => {
      const blob = `${title}\n${summary ?? ""}`;
      return /声優|アニメ|ゲーム|2\.5次元|舞台|キャスト/i.test(blob);
    }
  }
];

