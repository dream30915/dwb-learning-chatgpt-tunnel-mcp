import assert from "node:assert/strict";
import { test } from "node:test";

import { ALLOWED_COMMAND_IDS, runAllowedCommand } from "../lib/allowed-commands.mjs";
import { getPublicToolNames, isUnrestrictedShellEnabled } from "../lib/shell-gate.mjs";

test("allowlist accepts get_date and os_info", () => {
  const date = runAllowedCommand("get_date");
  assert.equal(date.command_id, "get_date");
  assert.match(date.iso, /^\d{4}-\d{2}-\d{2}T/);

  const info = runAllowedCommand("os_info", { workspaceRoot: "C:\\tmp\\ws" });
  assert.equal(info.command_id, "os_info");
  assert.equal(info.platform, process.platform);
  assert.equal(info.workspace_root, "C:\\tmp\\ws");
});

test("allowlist rejects unknown command IDs", () => {
  assert.throws(() => runAllowedCommand("Get-Date"), /not allowed/);
  assert.throws(() => runAllowedCommand("run_powershell"), /not allowed/);
  assert.throws(() => runAllowedCommand("format-volume"), /not allowed/);
  assert.ok(ALLOWED_COMMAND_IDS.includes("get_date"));
  assert.ok(!ALLOWED_COMMAND_IDS.includes("Get-Date"));
});

test("shell is disabled by default", () => {
  const env = { ...process.env };
  delete env.COMPUTER_MCP_ALLOW_UNRESTRICTED_SHELL;
  assert.equal(isUnrestrictedShellEnabled(env), false);
  assert.equal(isUnrestrictedShellEnabled({}), false);
  assert.equal(isUnrestrictedShellEnabled({ COMPUTER_MCP_ALLOW_UNRESTRICTED_SHELL: "true" }), false);
  assert.equal(isUnrestrictedShellEnabled({ COMPUTER_MCP_ALLOW_UNRESTRICTED_SHELL: "yes" }), false);
  const names = getPublicToolNames(env);
  assert.ok(names.includes("run_allowed_command"));
  assert.ok(!names.includes("run_powershell"));
  assert.ok(!names.includes("run_powershell_unsafe"));
});

test("unrestricted shell tool is named unsafe and requires env=1", () => {
  const names = getPublicToolNames({ COMPUTER_MCP_ALLOW_UNRESTRICTED_SHELL: "1" });
  assert.ok(names.includes("run_powershell_unsafe"));
  assert.ok(!names.includes("run_powershell"));
});
