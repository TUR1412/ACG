import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createLogger } from "./lib/logger";
import { findChromePath } from "./lib/chrome-path";

function run(command: string, args: string[], env?: Record<string, string | undefined>): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: { ...process.env, ...env },
      // Node 22 on some Windows setups cannot spawn *.cmd directly (EINVAL).
      // Use a shell on win32 to keep `npm`/`npx` invocations reliable.
      shell: process.platform === "win32"
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
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    log.info("Usage: npm run lhci:local [-- --skip-build]");
    log.info("");
    log.info("Options:");
    log.info("  --skip-build   Skip `npm run build` when dist/ exists");
    return;
  }

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
  const skipBuild = args.includes("--skip-build");
  const hasDist = existsSync(distDir);

  // 默认策略：总是先 build，避免 dist/ 存在但内容过期导致跑分与真实代码不一致。
  // 如确实需要跳过（例如重复调参），可显式传入 `--skip-build`。
  if (!skipBuild || !hasDist) {
    log.info("[LHCI] build（ACG_BASE=/）…");
    await run("npm", ["run", "build"], { ACG_BASE: "/" });
  } else {
    log.info("[LHCI] dist/ 已存在且显式跳过 build（--skip-build）");
  }

  log.info(`[LHCI] chromePath=${chromePath}`);
  await run(
    "npx",
    [
      "--yes",
      "@lhci/cli@0.15.1",
      "autorun",
      "--config",
      ".lighthouserc.json"
    ],
    { ACG_BASE: "/", LHCI_CHROME_PATH: chromePath }
  );
}

void main().catch((err) => {
  const log = createLogger();
  log.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
