import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { StitchToolClient, toolDefinitions } from "@google/stitch-sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY_FILE = path.resolve(__dirname, "../secrets/stitch-api-key.txt");
const WORKSPACE_ROOT = path.resolve(__dirname, "../../workspace");
const PULL_TOOL = "stitch_pull_screen_artifacts";

function readSecret(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing secret file: ${file}`);
  const value = fs.readFileSync(file, "utf8").trim();
  if (!value || value.startsWith("PASTE_")) throw new Error(`Secret not configured: ${file}`);
  return value;
}

function slugify(value) {
  return String(value || "screen")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "screen";
}

function safeOutputDir(relativeDir) {
  const target = path.resolve(WORKSPACE_ROOT, relativeDir);
  const root = `${WORKSPACE_ROOT}${path.sep}`;
  if (target !== WORKSPACE_ROOT && !target.startsWith(root)) {
    throw new Error("outputDir must stay inside workspace");
  }
  return target;
}

async function download(url, file) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
}

const stitch = new StitchToolClient({ apiKey: readSecret(API_KEY_FILE), timeout: 300_000 });

async function saveScreen(screen, { projectId, screenId, outputDir } = {}) {
  const resolvedProjectId = String(projectId || screen?.name?.match(/projects\/(\d+)/)?.[1] || "");
  const resolvedScreenId = String(screenId || screen?.name?.match(/screens\/([a-z0-9_-]+)/i)?.[1] || "");
  const title = screen?.title || `screen-${resolvedScreenId}`;

  if (!screen?.htmlCode?.downloadUrl || !screen?.screenshot?.downloadUrl) {
    throw new Error("Screen has no downloadable HTML or screenshot");
  }

  const relativeDir = outputDir || path.join(
    "handoff",
    "stitch",
    `${slugify(title)}-${resolvedScreenId.slice(0, 8)}`,
  );
  const target = safeOutputDir(relativeDir);
  fs.mkdirSync(target, { recursive: true });

  const htmlFile = path.join(target, "screen.html");
  const screenshotFile = path.join(target, "screenshot.png");
  const manifestFile = path.join(target, "screen.json");

  await download(screen.htmlCode.downloadUrl, htmlFile);
  await download(`${screen.screenshot.downloadUrl}=s0`, screenshotFile);

  const manifest = {
    status: "ready",
    projectId: resolvedProjectId,
    screenId: resolvedScreenId,
    title,
    deviceType: screen?.deviceType ?? null,
    width: screen?.width ?? null,
    height: screen?.height ?? null,
    files: { html: "screen.html", screenshot: "screenshot.png" },
    exportedAt: new Date().toISOString(),
  };
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    workspace: WORKSPACE_ROOT,
    outputDir: path.relative(WORKSPACE_ROOT, target),
    files: ["screen.html", "screenshot.png", "screen.json"],
  };
}

const stitchTools = toolDefinitions.map((tool) => ({
  ...tool,
  name: `stitch_${tool.name}`,
  description: `${tool.description ?? tool.name} [Google Stitch via Workshop Tunnel]`,
}));

const routes = new Map(toolDefinitions.map((tool) => [`stitch_${tool.name}`, tool.name]));

const pullToolDefinition = {
  name: PULL_TOOL,
  description: "Pull a Stitch screen into workspace/handoff/stitch for Serena to continue.",
  inputSchema: {
    type: "object",
    properties: {
      projectId: { type: "string" },
      screenId: { type: "string" },
      outputDir: { type: "string", description: "Optional path relative to workspace" },
    },
    required: ["projectId", "screenId"],
    additionalProperties: false,
  },
};

const server = new Server(
  { name: "workshop-stitch-tunnel", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [...stitchTools, pullToolDefinition],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (request.params.name === PULL_TOOL) {
      const { projectId, screenId, outputDir } = request.params.arguments ?? {};
      const screen = await stitch.callTool("get_screen", {
        name: `projects/${projectId}/screens/${screenId}`,
        projectId,
        screenId,
      });
      const handoff = await saveScreen(screen, { projectId, screenId, outputDir });
      return { content: [{ type: "text", text: JSON.stringify(handoff, null, 2) }] };
    }

    const upstream = routes.get(request.params.name);
    if (!upstream) throw new Error(`Unknown tool: ${request.params.name}`);

    const args = request.params.arguments ?? {};
    const result = await stitch.callTool(upstream, args);

    // Auto-pull whenever ChatGPT asks Stitch for a screen.
    if (upstream === "get_screen") {
      try {
        const localHandoff = await saveScreen(result, args);
        if (result && typeof result === "object") return { ...result, localHandoff };
      } catch (error) {
        console.error(`[auto-pull] ${error.message}`);
      }
    }

    return result;
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: error?.message || String(error) }],
    };
  }
});

process.stdout.on("error", (error) => {
  if (error?.code === "EPIPE") process.exit(0);
  throw error;
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[stitch] ready — workspace: ${WORKSPACE_ROOT}`);
