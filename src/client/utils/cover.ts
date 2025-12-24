import { toWeservImageUrl } from "../../lib/cover";
import { href } from "../../lib/href";

export function bestInitialCoverSrc(original: string, width = 1200): string {
  // GitHub Pages 项目站点：需要 base path 前缀（/ACG/...）
  if (original.startsWith("/")) {
    return href(original);
  }
  // https 页面里加载 http 图片会被浏览器直接拦截；这里直接用 https 包装，减少“看起来像缺图”的时间。
  if (window.location.protocol === "https:" && original.startsWith("http://")) {
    return toWeservImageUrl({ url: original, width });
  }
  return original;
}

