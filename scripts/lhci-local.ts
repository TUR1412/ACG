import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createLogger } from "./lib/logger";
import { findChromePath } from "./lib/chrome-path";

function cmd(name: string): string {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

function run(command: string, args: string[], env?: Record<string, string | undefined>): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: { ...process.env, ...env }
    });

    child.on("error", (err) => rejectPromise(err));
    child.on("close", (code) => {
      if (code === 0) return resolvePromise();
      rejectPromise(new Error(`${command} exited with code ${code ?? "null"}`));
    });
  });
}

async function main() {
  const log = createLogger();

  const chromePath = findChromePath();
  if (!chromePath) {
    log.error("Chrome/Chromium 未找到：本地运行 Lighthouse CI 需要可用的浏览器可执行文件。");
    log.info("可选方案：");
    log.info("- 安装 Chrome（推荐）或 Edge，并确保可执行文件存在。");
    log.info("- 或设置环境变量 LHCI_CHROME_PATH 指向 chrome/msedge 可执行文件路径。");
    log.info("示例（PowerShell）：");
    log.info("  $env:LHCI_CHROME_PATH = \"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\"");
    process.exitCode = 1;
    return;
  }

  const root = process.cwd();
  const distDir = resolve(root, "dist");
  if (!existsSync(distDir)) {
    log.info("[LHCI] dist/ 不存在，先构建（ACG_BASE=/）…");
    await run(cmd("npm"), ["run", "build"], { ACG_BASE: "/" });
  }

  log.info(`[LHCI] chromePath=${chromePath}`);
  await run(
    cmd("npx"),
    [
      "--yes",
      "@lhci/cli@0.15.1",
      "autorun",
      "--config",
      ".lighthouserc.json",
      "--collect.chromePath",
      chromePath
    ],
    { ACG_BASE: "/" }
  );
}

void main().catch((err) => {
  const log = createLogger();
  log.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});

