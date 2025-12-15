export function href(pathname: string): string {
  const base = import.meta.env.BASE_URL;
  const trimmed = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  return `${base}${trimmed}`;
}

