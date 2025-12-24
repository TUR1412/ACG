export const SUPPORTED_LANGS = ["zh", "ja"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

export const DEFAULT_LANG: Lang = "zh";

export type I18nKey =
  | "site.name"
  | "site.tagline"
  | "site.disclaimer"
  | "nav.latest"
  | "nav.search"
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
  | "search.emptyTitle"
  | "search.emptyHint"
  | "search.clear"
  | "prefs.title"
  | "prefs.theme"
  | "prefs.themeAuto"
  | "prefs.themeLight"
  | "prefs.themeDark"
  | "prefs.themeHint"
  | "prefs.followOnly"
  | "prefs.followedSourcesOnly"
  | "prefs.hideRead"
  | "prefs.followPlaceholder"
  | "prefs.followAdd"
  | "prefs.blockPlaceholder"
  | "prefs.blockAdd"
  | "prefs.sources"
  | "prefs.sourcesFollowHint"
  | "prefs.followedSources"
  | "prefs.followSource"
  | "prefs.followAllSources"
  | "prefs.unfollowAllSources"
  | "prefs.enableAllSources"
  | "prefs.disableAllSources"
  | "prefs.hint"
  | "common.loading"
  | "common.noData"
  | "common.updatedAt"
  | "post.openSource"
  | "post.previewTitle"
  | "post.previewHint"
  | "post.fullTextTitle"
  | "post.fullTextHint"
  | "post.fullTextReload"
  | "post.fullTextOriginal"
  | "post.fullTextTranslated"
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
    "site.disclaimer": "本站聚合标题/摘要并跳转原文；详情页提供「全文预览（实验）」阅读模式（实时解析/翻译，可能有误），版权归原站。数据由 GitHub Actions 定时更新。",
    "nav.latest": "新闻动态",
    "nav.search": "搜索",
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
    "search.emptyTitle": "没有匹配结果",
    "search.emptyHint": "试试清空搜索词，或关闭“只看关注 / 只看关注源 / 隐藏已读 / 来源过滤”。",
    "search.clear": "清空搜索",
    "prefs.title": "偏好",
    "prefs.theme": "主题",
    "prefs.themeAuto": "自动",
    "prefs.themeLight": "浅色",
    "prefs.themeDark": "深色",
    "prefs.themeHint": "自动 = 跟随系统外观（可在系统设置中切换深色/浅色）。",
    "prefs.followOnly": "只看关注",
    "prefs.followedSourcesOnly": "只看关注源",
    "prefs.hideRead": "隐藏已读",
    "prefs.followPlaceholder": "关注关键词（作品/角色/声优）",
    "prefs.followAdd": "添加",
    "prefs.blockPlaceholder": "屏蔽关键词（不想看到的）",
    "prefs.blockAdd": "屏蔽",
    "prefs.sources": "来源",
    "prefs.sourcesFollowHint": "星标 = 关注来源（用于订阅过滤）",
    "prefs.followedSources": "已关注来源",
    "prefs.followSource": "关注",
    "prefs.followAllSources": "关注全部",
    "prefs.unfollowAllSources": "取消全部关注",
    "prefs.enableAllSources": "启用全部来源",
    "prefs.disableAllSources": "全部禁用",
    "prefs.hint": "以上设置仅保存在本机浏览器（localStorage）。",
    "common.loading": "加载中…",
    "common.noData": "暂无数据，稍后将自动更新。",
    "common.updatedAt": "更新于",
    "post.openSource": "打开原文",
    "post.previewTitle": "内容预览",
    "post.previewHint": "预览来自页面描述/自动摘录（非全文）。完整内容请点击「打开原文」。",
    "post.fullTextTitle": "全文预览（实验）",
    "post.fullTextHint": "全文预览（实验）：将尝试从原站提取全文并翻译到当前语言，可能不完整或有误；版权归原站。加载失败请点击「打开原文」。",
    "post.fullTextReload": "重新加载",
    "post.fullTextOriginal": "查看原文",
    "post.fullTextTranslated": "查看翻译",
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
    "site.disclaimer": "本サイトはタイトル/要約を集約し元記事へ誘導します。詳細ページの「全文プレビュー（実験）」はリアルタイム解析/翻訳（誤訳の可能性あり）で、著作権は原サイトに帰属します。データは GitHub Actions により定期更新されます。",
    "nav.latest": "ニュース",
    "nav.search": "検索",
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
    "search.emptyTitle": "一致する結果がありません",
    "search.emptyHint": "検索語をクリアするか、「フォローのみ / フォローしたソースのみ / 既読を隠す / ソース無効化」を見直してください。",
    "search.clear": "クリア",
    "prefs.title": "設定",
    "prefs.theme": "テーマ",
    "prefs.themeAuto": "自動",
    "prefs.themeLight": "ライト",
    "prefs.themeDark": "ダーク",
    "prefs.themeHint": "自動 = OSの外観設定（ライト/ダーク）に追従します。",
    "prefs.followOnly": "フォローのみ",
    "prefs.followedSourcesOnly": "フォローしたソースのみ",
    "prefs.hideRead": "既読を隠す",
    "prefs.followPlaceholder": "フォロー（作品/声優など）",
    "prefs.followAdd": "追加",
    "prefs.blockPlaceholder": "除外キーワード",
    "prefs.blockAdd": "除外",
    "prefs.sources": "ソース",
    "prefs.sourcesFollowHint": "星マーク = フォロー（購読フィルター用）",
    "prefs.followedSources": "フォロー中のソース",
    "prefs.followSource": "フォロー",
    "prefs.followAllSources": "すべてフォロー",
    "prefs.unfollowAllSources": "すべて解除",
    "prefs.enableAllSources": "すべて有効化",
    "prefs.disableAllSources": "すべて無効化",
    "prefs.hint": "設定はこのブラウザ内のみ（localStorage）。",
    "common.loading": "読み込み中…",
    "common.noData": "データがまだありません。自動更新をお待ちください。",
    "common.updatedAt": "更新",
    "post.openSource": "元記事へ",
    "post.previewTitle": "内容プレビュー",
    "post.previewHint": "プレビューはページの説明/自動抽出（全文ではありません）。全文は「元記事へ」からご確認ください。",
    "post.fullTextTitle": "全文プレビュー（実験）",
    "post.fullTextHint": "全文プレビュー（実験）：元記事から全文を抽出して現在の言語に翻訳します（不完全・誤訳の可能性あり）。著作権は原サイトに帰属します。失敗時は「元記事を開く」をご利用ください。",
    "post.fullTextReload": "再読み込み",
    "post.fullTextOriginal": "原文",
    "post.fullTextTranslated": "翻訳",
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
