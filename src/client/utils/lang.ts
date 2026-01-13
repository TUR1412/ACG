export function isJapanese(): boolean {
  const lang = document.documentElement.lang || "";
  return lang.toLowerCase().startsWith("ja");
}
