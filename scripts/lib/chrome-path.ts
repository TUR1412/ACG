import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function fromEnv(name: string): string | null {
  const raw = process.env[name];
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed;
}

function fileExists(path: string): boolean {
  try {
    return Boolean(path) && existsSync(path);
  } catch {
    return false;
  }
}

function commandOutputLines(command: string, args: string[]): string[] {
  try {
    const res = spawnSync(command, args, { encoding: "utf-8" });
    if (res.status !== 0) return [];
    const out = String(res.stdout ?? "");
    return out
      .split(/\r?\n/g)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function findInPath(names: string[]): string[] {
  const candidates: string[] = [];

  if (process.platform === "win32") {
    for (const name of names) {
      const lines = commandOutputLines("where.exe", [name]);
      candidates.push(...lines);
    }
    return candidates;
  }

  for (const name of names) {
    const lines = commandOutputLines("which", [name]);
    candidates.push(...lines);
  }
  return candidates;
}

function defaultInstallPaths(): string[] {
  if (process.platform === "win32") {
    const pf = fromEnv("ProgramFiles");
    const pf86 = fromEnv("ProgramFiles(x86)");
    const lad = fromEnv("LocalAppData");
    return [
      pf ? `${pf}\\Google\\Chrome\\Application\\chrome.exe` : null,
      pf86 ? `${pf86}\\Google\\Chrome\\Application\\chrome.exe` : null,
      lad ? `${lad}\\Google\\Chrome\\Application\\chrome.exe` : null,
      pf ? `${pf}\\Microsoft\\Edge\\Application\\msedge.exe` : null,
      pf86 ? `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe` : null,
      lad ? `${lad}\\Microsoft\\Edge\\Application\\msedge.exe` : null
    ].filter((x): x is string => Boolean(x));
  }

  if (process.platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    ];
  }

  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/snap/bin/chromium"
  ];
}

export function findChromePath(): string | null {
  const envCandidates = unique(
    [
      fromEnv("LHCI_CHROME_PATH"),
      fromEnv("CHROME_PATH"),
      fromEnv("PUPPETEER_EXECUTABLE_PATH")
    ].filter((x): x is string => Boolean(x))
  );

  for (const p of envCandidates) {
    if (fileExists(p)) return p;
  }

  const pathCandidates = unique(
    findInPath(["chrome", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "msedge"])
  );
  for (const p of pathCandidates) {
    if (fileExists(p)) return p;
  }

  for (const p of defaultInstallPaths()) {
    if (fileExists(p)) return p;
  }

  return null;
}

