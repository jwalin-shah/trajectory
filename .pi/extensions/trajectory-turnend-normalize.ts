/**
 * Turn-end → trajectory normalize.
 *
 * On each Pi turn_end, normalize the current session file through
 * scripts/normalize-session.mjs and write a compact receipt under
 * ~/.local/share/trajectory/turnend/.
 *
 * Failures are non-blocking: normalization is observe-only evidence.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const extensionFile = fileURLToPath(import.meta.url);
// .pi/extensions/<file> → repo root is ../..
const repoRoot = resolve(dirname(extensionFile), "../..");
const normalizeScript = join(repoRoot, "scripts/normalize-session.mjs");
const outRoot = join(homedir(), ".local/share/trajectory/turnend");

let inFlight = false;
let pending = false;

function runNormalize(sessionFile: string): void {
  if (!existsSync(normalizeScript)) return;
  if (!sessionFile || !existsSync(sessionFile)) return;

  if (inFlight) {
    pending = true;
    return;
  }
  inFlight = true;

  mkdirSync(outRoot, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = join(outRoot, `${stamp}.json`);

  const child = spawn(
    process.execPath, // node
    [
      normalizeScript,
      "--source",
      "pi",
      "--file",
      sessionFile,
      "--out",
      outFile,
      "--quiet",
    ],
    {
      stdio: "ignore",
      detached: true,
      env: process.env,
    },
  );
  child.unref();
  child.on("close", () => {
    inFlight = false;
    // receipt marker even if normalize wrote the full body
    try {
      writeFileSync(
        join(outRoot, "last.json"),
        `${JSON.stringify(
          {
            at: new Date().toISOString(),
            sessionFile,
            outFile,
            repoRoot,
          },
          null,
          2,
        )}\n`,
      );
    } catch {
      /* ignore */
    }
    if (pending) {
      pending = false;
      runNormalize(sessionFile);
    }
  });
  child.on("error", () => {
    inFlight = false;
  });
}

export default function (pi: ExtensionAPI) {
  pi.on("turn_end", (_event, ctx) => {
    try {
      const sessionFile = ctx.sessionManager.getSessionFile?.();
      if (typeof sessionFile === "string" && sessionFile.length > 0) {
        runNormalize(sessionFile);
      }
    } catch {
      /* observe-only */
    }
  });
}
