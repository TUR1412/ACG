export function href(pathname: string): string {
  const rawBase = import.meta.env.BASE_URL ?? "/";
  const base = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;
  const trimmed = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  return `${base}${trimmed}`;
}

