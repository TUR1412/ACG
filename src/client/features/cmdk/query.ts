import { normalizeText } from "../../../lib/search/query";
import type { Command, CommandView } from "./types";

export function pickHighlightToken(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return trimmed;
  return parts.reduce((acc, cur) => (cur.length > acc.length ? cur : acc), parts[0]);
}

export function buildCommandHaystack(cmd: Pick<Command, "title" | "desc" | "keywords">): string {
  return normalizeText([cmd.title, cmd.desc ?? "", ...(cmd.keywords ?? [])].join(" "));
}

export function toCommandViews(commands: Command[]): CommandView[] {
  return commands.map((cmd) => ({ ...cmd, _hay: buildCommandHaystack(cmd) }));
}

export function filterCommandViews(allCommands: CommandView[], rawQuery: string): CommandView[] {
  const q = normalizeText(rawQuery);
  if (!q) return allCommands.slice();
  return allCommands.filter((cmd) => cmd._hay.includes(q));
}
