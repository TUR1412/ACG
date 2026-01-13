type CoverParams = {
  url: string;
  /** 期望的最大宽度（Weserv 会按需缩放，避免过大浪费流量） */
  width?: number;
  /** 可选：切换 Weserv 域名（某些网络环境下不同域名可用性不一致） */
  host?: string;
};

export type CoverAsset = {
  /** 用于页面渲染的 src（可能是原图，也可能是代理后的 https 图） */
  src: string;
  /** 原始封面地址（用于失败重试/回退逻辑） */
  original: string;
};

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function isProxyUrl(url: string): boolean {
  return /^https:\/\/(images\.weserv\.nl|wsrv\.nl)\//i.test(url);
}

function hrefInBase(pathname: string): string {
  const base = import.meta.env?.BASE_URL ?? "/";
  const trimmed = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  return `${base}${trimmed}`;
}

export function toWeservImageUrl(params: CoverParams): string {
  const { url, width = 960, host = "images.weserv.nl" } = params;
  const encoded = encodeURIComponent(url);
  // fit=cover：卡片/头图统一“杂志封面”裁切；n=-1：允许 upscaling（在少数小图场景更好看）
  return `https://${host}/?url=${encoded}&w=${width}&fit=cover&n=-1`;
}

/**
 * 只在“明显会导致混合内容”或“需要 https 包装”的场景走代理：
 * - GitHub Pages 是 https；http 图片会被浏览器直接拦截。
 * - 其他 https 图片默认不强制代理，避免过度依赖第三方。
 */
export function resolveCover(url?: string | null, width?: number): CoverAsset | null {
  if (!url) return null;
  const original = String(url);
  if (!original.trim()) return null;

  // 本地缓存封面：用 base path 组装（GitHub Pages 项目站点需要 /<repo>/ 前缀）
  if (!isHttpUrl(original) && original.startsWith("/")) {
    return { src: hrefInBase(original), original };
  }

  if (isHttpUrl(original) && !isProxyUrl(original) && original.startsWith("http://")) {
    return { src: toWeservImageUrl({ url: original, width }), original };
  }

  return { src: original, original };
}
