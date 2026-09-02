import path from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { ALLOWED_COMMAND_IDS, runAllowedCommand } from "./lib/allowed-commands.mjs";
import { listWorkspace, MAX_FILE_BYTES, readTextFile, writeTextFile } from "./lib/files.mjs";
import { ensureWorkspaceRoot } from "./lib/paths.mjs";
import {
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  runPowershellUnsafe,
} from "./lib/powershell.mjs";
import {
  getPublicToolNames,
  isUnrestrictedShellEnabled,
  UNRESTRICTED_SHELL_ENV,
} from "./lib/shell-gate.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultRoot = path.resolve(__dirname, "../computer-workspace");
const configuredRoot = process.env.COMPUTER_MCP_ROOT
  ? path.resolve(process.env.COMPUTER_MCP_ROOT)
  : defaultRoot;
const workspaceRoot = ensureWorkspaceRoot(configuredRoot);

function textResult(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }] };
}

const server = new McpServer(
  { name: "woravej-computer", version: "0.2.0" },
  { capabilities: { tools: {} } },
);

server.registerTool(
  "computer_status",
  {
    title: "Computer workspace status",
    description:
      "Show the local computer workspace ChatGPT is allowed to use: OS, user, sandboxed working folder, and whether unrestricted PowerShell is enabled.",
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () =>
    textResult({
      os: process.platform,
      node: process.version,
      user: process.env.USERNAME || process.env.USER || null,
      workspace_root: workspaceRoot,
      unrestricted_shell: isUnrestrictedShellEnabled(),
      tools: getPublicToolNames(),
      note: "File tools stay inside this folder after resolving junctions and symlinks. Standard mode has no freeform PowerShell. Unrestricted shell requires COMPUTER_MCP_ALLOW_UNRESTRICTED_SHELL=1.",
    }),
);

server.registerTool(
  "list_workspace",
  {
    title: "List workspace files",
    description: "List files and folders inside computer-workspace. Optional relative path, max depth 3. Junctions and symlinks that resolve outside the workspace are omitted.",
    inputSchema: {
      relative_path: z.string().min(1).optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ relative_path }) => textResult(listWorkspace(workspaceRoot, relative_path)),
);

server.registerTool(
  "read_text_file",
  {
    title: "Read a workspace text file",
    description: "Read a UTF-8 text file inside computer-workspace. Paths that resolve outside the workspace, including via junctions, are rejected.",
    inputSchema: {
      relative_path: z.string().min(1),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ relative_path }) => textResult(readTextFile(workspaceRoot, relative_path)),
);

server.registerTool(
  "write_text_file",
  {
    title: "Write a workspace text file",
    description: "Create or overwrite a UTF-8 text file inside computer-workspace. Parent folders are created as needed. Writes through junctions that escape the workspace are rejected.",
    inputSchema: {
      relative_path: z.string().min(1),
      content: z.string(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ relative_path, content }) => {
    if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
      throw new Error("content is too large");
    }
    return textResult(writeTextFile(workspaceRoot, relative_path, content));
  },
);

server.registerTool(
  "run_allowed_command",
  {
    title: "Run an allowlisted read-only command",
    description:
      "Run a named read-only operation. Standard mode does not accept PowerShell strings. Allowed command_id values: get_date, os_info.",
    inputSchema: {
      command_id: z.enum(ALLOWED_COMMAND_IDS),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ command_id }) =>
    textResult(runAllowedCommand(command_id, { workspaceRoot })),
);

if (isUnrestrictedShellEnabled()) {
  server.registerTool(
    "run_powershell_unsafe",
    {
      title: "UNSAFE: run unrestricted PowerShell",
      description:
        "Admin/unsafe tool. Off by default. Registered only when COMPUTER_MCP_ALLOW_UNRESTRICTED_SHELL=1 on the Node process. Runs arbitrary PowerShell as the Windows user. MCP destructiveHint and ChatGPT confirmation text are not a server-side control. Default timeout is 30 seconds. Timeout kills the process tree with taskkill /T.",
      inputSchema: {
        command: z.string().min(1).max(8000),
        timeout_ms: z.number().int().min(1000).max(MAX_TIMEOUT_MS).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ command, timeout_ms }) => {
      const result = await runPowershellUnsafe(command, {
        timeoutMs: timeout_ms || DEFAULT_TIMEOUT_MS,
        cwd: workspaceRoot,
        env: process.env,
      });
      return textResult(result);
    },
  );
}

process.stdout.on("error", (error) => {
  if (error?.code === "EPIPE") process.exit(0);
  throw error;
});

process.on("SIGINT", async () => {
  try { await server.close(); } catch {}
  process.exit(0);
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(
  `[woravej-computer] MCP server running on stdio, workspace=${workspaceRoot}, unrestricted_shell=${isUnrestrictedShellEnabled()}, ${UNRESTRICTED_SHELL_ENV}=${process.env[UNRESTRICTED_SHELL_ENV] ?? ""}`,
);
