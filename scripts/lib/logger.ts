type GitHubAnnotation = "notice" | "warning" | "error";

export type Logger = {
  debug: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  group: <T>(title: string, fn: () => Promise<T> | T) => Promise<T>;
};

function isGitHubActions(): boolean {
  return process.env.GITHUB_ACTIONS === "true";
}

function escapeGitHubCommandValue(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function toOneLine(raw: string, maxLen = 360): string {
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, Math.max(0, maxLen - 1))}…`;
}

function annotate(kind: GitHubAnnotation, message: string): void {
  if (!isGitHubActions()) return;
  const safe = escapeGitHubCommandValue(toOneLine(message));
  console.log(`::${kind}::${safe}`);
}

export function createLogger(params?: { verbose?: boolean }): Logger {
  const verbose = Boolean(params?.verbose) || process.env.ACG_LOG_VERBOSE === "true";

  const debug = (message: string) => {
    if (!verbose) return;
    console.log(message);
  };

  const info = (message: string) => {
    console.log(message);
  };

  const warn = (message: string) => {
    console.warn(message);
    annotate("warning", message);
  };

  const error = (message: string) => {
    console.error(message);
    annotate("error", message);
  };

  const group = async <T>(title: string, fn: () => Promise<T> | T): Promise<T> => {
    if (isGitHubActions()) {
      console.log(`::group::${escapeGitHubCommandValue(toOneLine(title, 120))}`);
      try {
        return await fn();
      } finally {
        console.log("::endgroup::");
      }
    }

    return await fn();
  };

  return { debug, info, warn, error, group };
}
