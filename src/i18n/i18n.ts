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
  | "home.spotlight"
  | "home.randomPick"
  | "home.copyBrief"
  | "home.copied"
  | "home.unread"
  | "search.placeholder"
  | "search.result"
  | "prefs.title"
  | "prefs.followOnly"
  | "prefs.hideRead"
  | "prefs.followPlaceholder"
  | "prefs.followAdd"
  | "prefs.blockPlaceholder"
  | "prefs.blockAdd"
  | "prefs.sources"
  | "prefs.enableAllSources"
  | "prefs.disableAllSources"
  | "prefs.hint"
  | "common.loading"
  | "common.noData"
  | "common.updatedAt"
  | "post.openSource"
  | "post.source"
  | "post.publishedAt"
  | "bookmarks.title"
  | "bookmarks.empty"
  | "bookmarks.export"
  | "bookmarks.import"
  | "bookmarks.clear"
  | "bookmarks.hint"
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
    "home.spotlight": "今日精选",
    "home.randomPick": "随机安利",
    "home.copyBrief": "复制快报",
    "home.copied": "已复制到剪贴板",
    "home.unread": "未读",
    "search.placeholder": "搜索标题 / 摘要 / 标签…",
    "search.result": "匹配",
    "prefs.title": "偏好",
    "prefs.followOnly": "只看关注",
    "prefs.hideRead": "隐藏已读",
    "prefs.followPlaceholder": "关注关键词（作品/角色/声优）",
    "prefs.followAdd": "添加",
    "prefs.blockPlaceholder": "屏蔽关键词（不想看到的）",
    "prefs.blockAdd": "屏蔽",
    "prefs.sources": "来源",
    "prefs.enableAllSources": "启用全部来源",
    "prefs.disableAllSources": "全部禁用",
    "prefs.hint": "以上设置仅保存在本机浏览器（localStorage）。",
    "common.loading": "加载中…",
    "common.noData": "暂无数据，稍后将自动更新。",
    "common.updatedAt": "更新于",
    "post.openSource": "打开原文",
    "post.source": "来源",
    "post.publishedAt": "发布时间",
    "bookmarks.title": "我的收藏",
    "bookmarks.empty": "你还没有收藏任何资讯。",
    "bookmarks.export": "导出收藏",
    "bookmarks.import": "导入收藏",
    "bookmarks.clear": "清空收藏",
    "bookmarks.hint": "导入/导出仅在本机浏览器生效（localStorage）。",
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
    "home.spotlight": "ピックアップ",
    "home.randomPick": "ランダム推薦",
    "home.copyBrief": "コピー",
    "home.copied": "クリップボードにコピーしました",
    "home.unread": "未読",
    "search.placeholder": "検索（タイトル / 要約 / タグ）…",
    "search.result": "一致",
    "prefs.title": "設定",
    "prefs.followOnly": "フォローのみ",
    "prefs.hideRead": "既読を隠す",
    "prefs.followPlaceholder": "フォロー（作品/声優など）",
    "prefs.followAdd": "追加",
    "prefs.blockPlaceholder": "除外キーワード",
    "prefs.blockAdd": "除外",
    "prefs.sources": "ソース",
    "prefs.enableAllSources": "すべて有効化",
    "prefs.disableAllSources": "すべて無効化",
    "prefs.hint": "設定はこのブラウザ内のみ（localStorage）。",
    "common.loading": "読み込み中…",
    "common.noData": "データがまだありません。自動更新をお待ちください。",
    "common.updatedAt": "更新",
    "post.openSource": "元記事へ",
    "post.source": "出典",
    "post.publishedAt": "公開日時",
    "bookmarks.title": "ブックマーク",
    "bookmarks.empty": "まだブックマークがありません。",
    "bookmarks.export": "エクスポート",
    "bookmarks.import": "インポート",
    "bookmarks.clear": "クリア",
    "bookmarks.hint": "インポート/エクスポートはこのブラウザ内のみ（localStorage）。",
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
