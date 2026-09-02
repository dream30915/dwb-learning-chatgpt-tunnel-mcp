import { spawn, spawnSync } from "node:child_process";

export const MAX_OUTPUT_CHARS = 80_000;
export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_TIMEOUT_MS = 60_000;

const EXTRA_DENY_PATTERNS = [
  /format-volume/i,
  /clear-disk/i,
  /stop-computer/i,
  /restart-computer/i,
  /remove-computer/i,
  /reset-computer/i,
];

export function capOutput(text, max = MAX_OUTPUT_CHARS) {
  const value = typeof text === "string" ? text : String(text ?? "");
  if (value.length <= max) return value;
  return value.slice(0, max);
}

export function extraDenylistHit(command) {
  return EXTRA_DENY_PATTERNS.some((pattern) => pattern.test(command));
}

export function killProcessTree(pid) {
  if (pid == null || Number.isNaN(Number(pid))) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // Process group kill is best-effort on POSIX.
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Already gone.
  }
}

export function runPowershellUnsafe(command, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cwd = options.cwd;
  const env = options.env ?? process.env;

  if (typeof command !== "string" || command.length < 1) {
    throw new Error("command is required");
  }
  if (extraDenylistHit(command)) {
    throw new Error(
      "command matches an extra denylist pattern; this denylist is not the security boundary",
    );
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      {
        cwd,
        windowsHide: true,
        env,
      },
    );

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child.pid);
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (stdout.length < MAX_OUTPUT_CHARS) stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < MAX_OUTPUT_CHARS) stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exit_code: code,
        signal,
        timed_out: timedOut,
        cwd,
        stdout: capOutput(stdout),
        stderr: capOutput(stderr),
      });
    });
  });
}
