export function envNonNegativeInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw == null) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

export function envPositiveIntInRange(
  key: string,
  fallback: number,
  params: { min: number; max: number }
): number {
  const raw = process.env[key];
  const parsed = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(params.min, Math.min(params.max, Math.floor(parsed)));
}

export function envRatio01(key: string, fallback: number): number {
  const raw = process.env[key];
  const parsed = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 1) return fallback;
  return parsed;
}
