export const MS = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000
} as const;

export const STORAGE_KEYS = {
  BOOKMARKS: "acg.bookmarks.v1",
  READ: "acg.read.v1",
  FOLLOWS: "acg.follows.v1",
  BLOCKLIST: "acg.blocklist.v1",
  FILTERS: "acg.filters.v1",
  VIEW_PRESETS: "acg.viewPresets.v1",
  VIEW_MODE: "acg.view.v1",
  DENSITY: "acg.density.v1",
  DISABLED_SOURCES: "acg.sourcesDisabled.v1",
  FOLLOWED_SOURCES: "acg.sourcesFollowed.v1",
  BOOKMARK_META: "acg.bookmarks.meta.v1",
  THEME: "acg.theme.v1",
  ACCENT: "acg.accent.v1",
  SEARCH_SCOPE: "acg.search.scope.v1",
  TELEMETRY: "acg.telemetry.v1",
  TELEMETRY_ENDPOINT: "acg.telemetry.endpoint.v1",
  TELEMETRY_UPLOAD: "acg.telemetry.upload.v1"
} as const;

export const NETWORK = {
  POSTS_JSON_PATH: "/data/posts.json",
  POSTS_JSON_GZ_PATH: "/data/posts.json.gz",
  SEARCH_PACK_V2_JSON_PATH: "/data/search-pack.v2.json",
  SEARCH_PACK_V2_JSON_GZ_PATH: "/data/search-pack.v2.json.gz",
  SEARCH_PACK_JSON_PATH: "/data/search-pack.v1.json",
  SEARCH_PACK_JSON_GZ_PATH: "/data/search-pack.v1.json.gz",
  DEFAULT_TIMEOUT_MS: 12_000,
  DEFAULT_RETRY_DELAY_MS: 180,
  SLOW_REQUEST_THRESHOLD_MS: 1800,
  SLOW_STATE_HOLD_MS: 4500,
  TEXT_ACCEPT: "text/plain,*/*"
} as const;

export const UI = {
  TOAST_HINT_TIMEOUT_MS: 900,
  BACK_TO_TOP_SHOW_SCROLL_Y: 700,
  IDLE_DEFAULT_TIMEOUT_MS: 1400,
  IDLE_FALLBACK_DELAY_MS: 64,
  LIST_FILTER_IDLE_DELAY_MS: 1500,
  APPLY_READ_IDLE_DELAY_MS: 420,
  HYDRATE_COVER_IDLE_DELAY_MS: 700,
  BOOKMARKS_SKELETON_CARDS: 6,
  BOOKMARK_META_MAX_ITEMS: 600,
  BOOKMARKS_VIRTUALIZE_THRESHOLD: 480,
  BOOKMARK_CARD_ESTIMATE_ROW_HEIGHT: 420,
  FRESH_WINDOW_MS: 6 * MS.HOUR,
  LENS_2H_MS: 2 * MS.HOUR,
  LENS_6H_MS: 6 * MS.HOUR,
  LENS_24H_MS: 24 * MS.HOUR
} as const;
