export function parseDate(input: string | undefined): Date | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) return direct;

  // 某些 RSS 会用 "Mon, 15 Dec 2025 12:34:56 +0000" 这类格式，Date 基本能吃。
  return null;
}

export function toIso(date: Date): string {
  return date.toISOString();
}

