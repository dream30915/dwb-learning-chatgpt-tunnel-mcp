export const UNRESTRICTED_SHELL_ENV = "COMPUTER_MCP_ALLOW_UNRESTRICTED_SHELL";

export const DEFAULT_TOOL_NAMES = Object.freeze([
  "computer_status",
  "list_workspace",
  "read_text_file",
  "write_text_file",
  "run_allowed_command",
]);

export function isUnrestrictedShellEnabled(env = process.env) {
  return env[UNRESTRICTED_SHELL_ENV] === "1";
}

export function getPublicToolNames(env = process.env) {
  const names = [...DEFAULT_TOOL_NAMES];
  if (isUnrestrictedShellEnabled(env)) {
    names.push("run_powershell_unsafe");
  }
  return names;
}
