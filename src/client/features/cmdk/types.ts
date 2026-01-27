export type CommandGroup = "nav" | "search" | "filters" | "views" | "system" | "share";

export type Command = {
  id: string;
  group: CommandGroup;
  title: string;
  desc?: string;
  keywords?: string[];
  run: () => void | Promise<void>;
};

export type CommandView = Command & { _hay: string };

export type CmdkUi = {
  root: HTMLElement;
  panel: HTMLElement;
  input: HTMLInputElement;
  list: HTMLElement;
};

export type ToastParams = {
  title: string;
  desc?: string;
  variant?: "info" | "success" | "error";
  timeoutMs?: number;
};
