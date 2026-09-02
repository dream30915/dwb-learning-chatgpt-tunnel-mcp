import os from "node:os";

export const ALLOWED_COMMAND_IDS = Object.freeze(["get_date", "os_info"]);

export function runAllowedCommand(commandId, extras = {}) {
  switch (commandId) {
    case "get_date":
      return {
        command_id: "get_date",
        iso: new Date().toISOString(),
      };
    case "os_info":
      return {
        command_id: "os_info",
        platform: process.platform,
        arch: process.arch,
        release: os.release(),
        node: process.version,
        user: process.env.USERNAME || process.env.USER || null,
        workspace_root: extras.workspaceRoot ?? null,
      };
    default: {
      const unexpected = commandId;
      throw new Error(`command_id is not allowed: ${unexpected}`);
    }
  }
}
