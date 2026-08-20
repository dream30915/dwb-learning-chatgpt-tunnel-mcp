import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");

const serenaExe = process.env.SERENA_EXE || "serena";
const serenaContext = process.env.SERENA_CONTEXT?.trim() || "";
const artifactServer = path.join(__dirname, "artifact-server.mjs");
const serenaArgs = ["start-mcp-server", "--project", workspaceRoot];
if (serenaContext) serenaArgs.push("--context", serenaContext);
serenaArgs.push("--transport", "stdio");

function mirrorChildStderr(label, transport) {
  const stream = transport.stderr;
  if (!stream) return;
  stream.setEncoding?.("utf8");
  stream.on("data", (chunk) => {
    const text = String(chunk).trimEnd();
    if (text) console.error(`[${label}] ${text}`);
  });
}

async function connectChild({ name, command, args, cwd }) {
  const transport = new StdioClientTransport({
    command,
    args,
    cwd,
    stderr: "pipe",
  });
  mirrorChildStderr(name, transport);

  const client = new Client({ name: `dwb-combo-${name}`, version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  const listed = await client.listTools();
  return { name, client, transport, tools: listed.tools ?? [] };
}

const children = [];
try {
  children.push(await connectChild({
    name: "serena",
    command: serenaExe,
    args: serenaArgs,
    cwd: workspaceRoot,
  }));

  children.push(await connectChild({
    name: "stitch",
    command: process.execPath,
    args: [artifactServer],
    cwd: __dirname,
  }));
} catch (error) {
  console.error(`[dwb-combo] child startup failed: ${error?.stack || error}`);
  for (const child of children) {
    try { await child.client.close(); } catch {}
  }
  process.exit(1);
}

const toolRoutes = new Map();
const mergedTools = [];
for (const child of children) {
  for (const tool of child.tools) {
    if (toolRoutes.has(tool.name)) {
      throw new Error(`Duplicate MCP tool name across child servers: ${tool.name}`);
    }
    toolRoutes.set(tool.name, child);
    mergedTools.push(tool);
  }
}

const server = new Server(
  { name: "dwb-workspace-stitch-combo", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mergedTools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const route = toolRoutes.get(request.params.name);
  if (!route) throw new Error(`Unknown tool: ${request.params.name}`);
  return route.client.callTool({
    name: request.params.name,
    arguments: request.params.arguments ?? {},
  });
});

async function shutdown() {
  for (const child of children) {
    try { await child.client.close(); } catch {}
  }
  try { await server.close(); } catch {}
}

process.stdout.on("error", (error) => {
  if (error?.code === "EPIPE") process.exit(0);
  throw error;
});
process.on("SIGINT", async () => { await shutdown(); process.exit(0); });
process.on("SIGTERM", async () => { await shutdown(); process.exit(0); });

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[dwb-combo] running: Serena ${children[0].tools.length} tools + Stitch ${children[1].tools.length} tools = ${mergedTools.length} total`);
