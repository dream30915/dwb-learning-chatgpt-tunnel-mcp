import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  capOutput,
  extraDenylistHit,
  MAX_OUTPUT_CHARS,
  runPowershellUnsafe,
} from "../lib/powershell.mjs";
import { makeTempWorkspace, pidExists, waitUntil } from "./helpers.mjs";

test("output cap helper truncates at 80k", () => {
  const over = "a".repeat(MAX_OUTPUT_CHARS + 25);
  const capped = capOutput(over);
  assert.equal(capped.length, MAX_OUTPUT_CHARS);
});

test("unsafe spawn truncates stdout at 80k", async () => {
  const root = makeTempWorkspace();
  const result = await runPowershellUnsafe(
    "$s = 'x' * 90000; Write-Output $s",
    { timeoutMs: 15000, cwd: root },
  );
  assert.ok(result.stdout.length <= MAX_OUTPUT_CHARS);
  assert.ok(result.stdout.length >= MAX_OUTPUT_CHARS - 2);
});

test("timeout kills the PowerShell process tree on Windows", async (t) => {
  if (process.platform !== "win32") {
    t.skip("taskkill tree test is Windows-only");
    return;
  }

  const root = makeTempWorkspace();
  const pidFile = path.join(root, "child.pid");
  const pidPath = pidFile.replaceAll("'", "''");
  const command = [
    `$p = Start-Process -FilePath powershell.exe -ArgumentList '-NoProfile','-NonInteractive','-Command','Start-Sleep -Seconds 120' -PassThru -WindowStyle Hidden`,
    `Set-Content -LiteralPath '${pidPath}' -Value $p.Id -Encoding ascii`,
    "Start-Sleep -Seconds 120",
  ].join("; ");

  const result = await runPowershellUnsafe(command, { timeoutMs: 4000, cwd: root });
  assert.equal(result.timed_out, true);

  const pidReady = await waitUntil(() => fs.existsSync(pidFile), 3000);
  assert.equal(pidReady, true, "child pid file should have been written before timeout");
  const childPid = Number(fs.readFileSync(pidFile, "utf8").trim());
  assert.ok(Number.isInteger(childPid) && childPid > 0);

  const gone = await waitUntil(() => !pidExists(childPid), 8000);
  assert.equal(gone, true, `child pid ${childPid} should be gone after taskkill /T`);
});

test("extra denylist is not the security boundary but still rejects obvious volume wipes", () => {
  assert.equal(extraDenylistHit("Get-Date"), false);
  assert.equal(extraDenylistHit("Format-Volume -DriveLetter C"), true);
});
