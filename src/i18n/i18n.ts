export const SUPPORTED_LANGS = ["zh", "ja"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

export const DEFAULT_LANG: Lang = "zh";

export type I18nKey =
  | "site.name"
  | "site.tagline"
  | "site.disclaimer"
  | "nav.latest"
  | "nav.bookmarks"
  | "nav.status"
  | "nav.about"
  | "home.hotTags"
  | "home.dailyBrief"
  | "home.randomPick"
  | "search.placeholder"
  | "search.result"
  | "common.loading"
  | "common.noData"
  | "common.updatedAt"
  | "post.openSource"
  | "post.source"
  | "post.publishedAt"
  | "bookmarks.title"
  | "bookmarks.empty"
  | "status.title"
  | "status.lastRun"
  | "status.sources"
  | "status.ok"
  | "status.error";

const MESSAGES: Record<Lang, Record<I18nKey, string>> = {
  zh: {
    "site.name": "ACG Radar",
    "site.tagline": "每小时更新的二次元资讯雷达（聚合 + 收藏 + 关注）",
    "site.disclaimer": "本站仅聚合标题/摘要并跳转原文，不转载全文。数据由 GitHub Actions 定时更新。",
    "nav.latest": "最新",
    "nav.bookmarks": "收藏",
    "nav.status": "状态",
    "nav.about": "关于",
    "home.hotTags": "今日热点",
    "home.dailyBrief": "今日快报",
    "home.randomPick": "随机安利",
    "search.placeholder": "搜索标题 / 摘要 / 标签…",
    "search.result": "匹配",
    "common.loading": "加载中…",
    "common.noData": "暂无数据，稍后将自动更新。",
    "common.updatedAt": "更新于",
    "post.openSource": "打开原文",
    "post.source": "来源",
    "post.publishedAt": "发布时间",
    "bookmarks.title": "我的收藏",
    "bookmarks.empty": "你还没有收藏任何资讯。",
    "status.title": "抓取状态",
    "status.lastRun": "上次更新",
    "status.sources": "来源健康度",
    "status.ok": "正常",
    "status.error": "异常"
  },
  ja: {
    "site.name": "ACG Radar",
    "site.tagline": "毎時更新のACGニュースレーダー（集約 + ブックマーク + フォロー）",
    "site.disclaimer": "本サイトはタイトル/要約を集約し元記事へ誘導します。全文転載は禁止しません。データは GitHub Actions により定期更新されます。",
    "nav.latest": "最新",
    "nav.bookmarks": "ブックマーク",
    "nav.status": "ステータス",
    "nav.about": "このサイトについて",
    "home.hotTags": "今日のトレンド",
    "home.dailyBrief": "今日のまとめ",
    "home.randomPick": "ランダム推薦",
    "search.placeholder": "検索（タイトル / 要約 / タグ）…",
    "search.result": "一致",
    "common.loading": "読み込み中…",
    "common.noData": "データがまだありません。自動更新をお待ちください。",
    "common.updatedAt": "更新",
    "post.openSource": "元記事へ",
    "post.source": "出典",
    "post.publishedAt": "公開日時",
    "bookmarks.title": "ブックマーク",
    "bookmarks.empty": "まだブックマークがありません。",
    "status.title": "取得ステータス",
    "status.lastRun": "最終更新",
    "status.sources": "ソースの健康状態",
    "status.ok": "OK",
    "status.error": "エラー"
  }
};

export function isLang(value: string): value is Lang {
  return (SUPPORTED_LANGS as readonly string[]).includes(value);
}

export function t(lang: Lang, key: I18nKey): string {
  return MESSAGES[lang]?.[key] ?? MESSAGES[DEFAULT_LANG][key] ?? key;
}
