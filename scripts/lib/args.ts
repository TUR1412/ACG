export type SyncArgs = {
  dryRun: boolean;
  days: number;
  limit: number;
  verbose: boolean;
};

export function parseArgs(argv: string[]): SyncArgs {
  const args: SyncArgs = {
    dryRun: false,
    days: 30,
    limit: 2000,
    verbose: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (token === "--verbose") {
      args.verbose = true;
      continue;
    }
    if (token === "--days") {
      const value = Number(argv[i + 1]);
      if (!Number.isFinite(value) || value <= 0) throw new Error("--days 必须是正整数");
      args.days = Math.floor(value);
      i += 1;
      continue;
    }
    if (token === "--limit") {
      const value = Number(argv[i + 1]);
      if (!Number.isFinite(value) || value <= 0) throw new Error("--limit 必须是正整数");
      args.limit = Math.floor(value);
      i += 1;
      continue;
    }
  }

  return args;
}
