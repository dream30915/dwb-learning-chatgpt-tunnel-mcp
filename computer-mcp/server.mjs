import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultRoot = path.resolve(__dirname, "../computer-workspace");
const workspaceRoot = process.env.COMPUTER_MCP_ROOT
  ? path.resolve(process.env.COMPUTER_MCP_ROOT)
  : defaultRoot;
const maxFileBytes = 1 * 1024 * 1024;
const maxOutputChars = 80_000;
const defaultTimeoutMs = 30_000;
const maxTimeoutMs = 60_000;

function textResult(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }] };
}

function resolveSafePath(relativePath = ".") {
  const target = path.resolve(workspaceRoot, relativePath);
  const rootWithSep = `${workspaceRoot}${path.sep}`;
  if (target !== workspaceRoot && !target.startsWith(rootWithSep)) {
    throw new Error("path must stay inside computer-workspace");
  }
  return target;
}

function ensureWorkspace() {
  fs.mkdirSync(workspaceRoot, { recursive: true });
}

function listEntry(fullPath, relativePath) {
  const stats = fs.statSync(fullPath);
  return {
    path: relativePath.replaceAll("\\", "/"),
    type: stats.isDirectory() ? "directory" : "file",
    bytes: stats.isFile() ? stats.size : undefined,
  };
}

function walkDir(dir, relativeDir, depth, maxDepth, out) {
  if (depth > maxDepth) return;
  const names = fs.readdirSync(dir);
  for (const name of names) {
    const fullPath = path.join(dir, name);
    const relativePath = relativeDir ? `${relativeDir}/${name}` : name;
    const stats = fs.statSync(fullPath);
    out.push(listEntry(fullPath, relativePath));
    if (stats.isDirectory()) {
      walkDir(fullPath, relativePath, depth + 1, maxDepth, out);
    }
  }
}

function runPowershell(command, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      {
        cwd: workspaceRoot,
        windowsHide: true,
        env: process.env,
      },
    );

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (stdout.length < maxOutputChars) stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < maxOutputChars) stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        exit_code: code,
        signal,
        timed_out: timedOut,
        cwd: workspaceRoot,
        stdout: stdout.slice(0, maxOutputChars),
        stderr: stderr.slice(0, maxOutputChars),
      });
    });
  });
}

ensureWorkspace();

const server = new McpServer(
  { name: "woravej-computer", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.registerTool(
  "computer_status",
  {
    title: "Computer workspace status",
    description:
      "Show the local computer workspace ChatGPT is allowed to use: OS, user, and the sandboxed working folder.",
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
      note: "File tools stay inside this folder. PowerShell starts here, but a command can still affect the rest of the machine.",
    }),
);

server.registerTool(
  "list_workspace",
  {
    title: "List workspace files",
    description: "List files and folders inside computer-workspace. Optional relative path, max depth 3.",
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
  async ({ relative_path }) => {
    const target = resolveSafePath(relative_path || ".");
    if (!fs.existsSync(target)) throw new Error(`Not found: ${relative_path || "."}`);
    const stats = fs.statSync(target);
    if (stats.isFile()) return textResult([listEntry(target, relative_path || path.basename(target))]);
    const entries = [];
    walkDir(target, relative_path ? relative_path.replaceAll("\\", "/") : "", 1, 3, entries);
    return textResult({ workspace_root: workspaceRoot, entries });
  },
);

server.registerTool(
  "read_text_file",
  {
    title: "Read a workspace text file",
    description: "Read a UTF-8 text file inside computer-workspace.",
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
  async ({ relative_path }) => {
    const file = resolveSafePath(relative_path);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      throw new Error(`File not found: ${relative_path}`);
    }
    const bytes = fs.statSync(file).size;
    if (bytes > maxFileBytes) throw new Error(`File too large: ${bytes} bytes`);
    return textResult({
      relative_path,
      content: fs.readFileSync(file, "utf8"),
    });
  },
);

server.registerTool(
  "write_text_file",
  {
    title: "Write a workspace text file",
    description: "Create or overwrite a UTF-8 text file inside computer-workspace. Parent folders are created as needed.",
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
    if (Buffer.byteLength(content, "utf8") > maxFileBytes) {
      throw new Error("content is too large");
    }
    const file = resolveSafePath(relative_path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
    return textResult({
      relative_path,
      bytes: Buffer.byteLength(content, "utf8"),
      saved: true,
    });
  },
);

server.registerTool(
  "run_powershell",
  {
    title: "Run PowerShell on this computer",
    description:
      "Run a PowerShell command with computer-workspace as the working directory. Use this when the user wants ChatGPT to act on the local computer, such as creating files, starting programs, or inspecting the machine. Commands can affect the rest of Windows, not only the workspace folder. Keep commands short. Default timeout is 30 seconds.",
    inputSchema: {
      command: z.string().min(1).max(8000),
      timeout_ms: z.number().int().min(1000).max(maxTimeoutMs).optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ command, timeout_ms }) => {
    const result = await runPowershell(command, timeout_ms || defaultTimeoutMs);
    return textResult(result);
  },
);

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
console.error(`[woravej-computer] MCP server running on stdio, workspace=${workspaceRoot}`);
