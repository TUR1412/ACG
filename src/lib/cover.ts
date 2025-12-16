type CoverParams = {
  url: string;
  /** 期望的最大宽度（Weserv 会按需缩放，避免过大浪费流量） */
  width?: number;
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

export function toWeservImageUrl(params: CoverParams): string {
  const { url, width = 960 } = params;
  const encoded = encodeURIComponent(url);
  // fit=cover：卡片/头图统一“杂志封面”裁切；n=-1：允许 upscaling（在少数小图场景更好看）
  return `https://images.weserv.nl/?url=${encoded}&w=${width}&fit=cover&n=-1`;
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

  if (isHttpUrl(original) && !isProxyUrl(original) && original.startsWith("http://")) {
    return { src: toWeservImageUrl({ url: original, width }), original };
  }

  return { src: original, original };
}

