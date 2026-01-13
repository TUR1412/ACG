import type { Lang } from "../i18n/i18n";

export function formatDateTime(lang: Lang, iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const locale = lang === "ja" ? "ja-JP" : "zh-CN";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatRelativeHours(lang: Lang, iso: string): string | null {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return null;
  const diffMs = Date.now() - time;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 0) return null;
  if (hours === 0) return lang === "ja" ? "1時間未満" : "1小时内";
  if (hours < 24) return lang === "ja" ? `${hours}時間前` : `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return lang === "ja" ? `${days}日前` : `${days}天前`;
}

export function formatReadMinutes(lang: Lang, minutes: number): string {
  const value = Math.max(1, Math.round(minutes));
  return lang === "ja" ? `${value}分` : `${value}分钟`;
}
