import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StitchToolClient } from "@google/stitch-sdk";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const keyFile = process.env.STITCH_API_KEY_FILE
  ? path.resolve(process.env.STITCH_API_KEY_FILE)
  : path.resolve(__dirname, "../tunnel-client/stitch-api-key.txt");

function loadApiKey() {
  const envKey = process.env.STITCH_API_KEY?.trim();
  if (envKey) return envKey;
  if (!fs.existsSync(keyFile)) {
    throw new Error(
      `Stitch API key not found. Set STITCH_API_KEY or STITCH_API_KEY_FILE, or create: ${keyFile}`,
    );
  }
  const apiKey = fs.readFileSync(keyFile, "utf8").trim();
  if (!apiKey) throw new Error("Stitch API key file is empty");
  return apiKey;
}

function textResult(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }] };
}

function slugify(value) {
  return String(value || "stitch-screen")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "stitch-screen";
}

function resolveSafeOutputDir(relativeDir) {
  const target = path.resolve(workspaceRoot, relativeDir);
  const rootWithSep = `${workspaceRoot}${path.sep}`;
  if (target !== workspaceRoot && !target.startsWith(rootWithSep)) {
    throw new Error("output_dir must stay inside the repository workspace");
  }
  return target;
}

function collectObjects(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    out.push(value);
    for (const item of Object.values(value)) collectObjects(item, out);
  }
  return out;
}

function primitiveStrings(obj) {
  return Object.values(obj)
    .filter((v) => typeof v === "string")
    .map((v) => v.trim());
}

function findObjectByExactText(root, text) {
  const wanted = String(text).trim().toLowerCase();
  return collectObjects(root).find((obj) =>
    primitiveStrings(obj).some((value) => value.toLowerCase() === wanted),
  );
}

function extractProjectId(obj) {
  if (!obj || typeof obj !== "object") return null;
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value !== "string") continue;
    const resourceMatch = value.match(/projects\/(\d+)/i);
    if (resourceMatch) return resourceMatch[1];
    if (/^(project_?id|id)$/i.test(key) && /^\d+$/.test(value)) return value;
  }
  return null;
}

function extractScreenId(obj) {
  if (!obj || typeof obj !== "object") return null;
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value !== "string") continue;
    const resourceMatch = value.match(/screens\/([a-z0-9_-]+)/i);
    if (resourceMatch) return resourceMatch[1];
    if (/^(screen_?id|id)$/i.test(key) && /^[a-z0-9_-]+$/i.test(value)) return value;
  }
  return null;
}

function collectHttpUrls(value, found = []) {
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) found.push(value);
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectHttpUrls(item, found);
    return found;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectHttpUrls(item, found);
  }
  return found;
}

function isAllowedArtifactHost(hostname) {
  const host = hostname.toLowerCase();
  return host === "googleusercontent.com" ||
    host.endsWith(".googleusercontent.com") ||
    host === "usercontent.google.com" ||
    host.endsWith(".usercontent.google.com");
}

function imageExtension(contentType) {
  const type = String(contentType || "").toLowerCase();
  if (type.includes("image/png")) return ".png";
  if (type.includes("image/jpeg")) return ".jpg";
  if (type.includes("image/webp")) return ".webp";
  return null;
}

async function downloadArtifact(url, outputDir, imageIndex = 0) {
  const parsed = new URL(url);
  if (!isAllowedArtifactHost(parsed.hostname)) {
    return { skipped: true, source_url: url, reason: `host not allowed: ${parsed.hostname}` };
  }

  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Artifact download failed: HTTP ${response.status}`);

  const contentType = response.headers.get("content-type") || "";
  const bytes = Buffer.from(await response.arrayBuffer());
  const maxBytes = 20 * 1024 * 1024;
  if (bytes.length > maxBytes) throw new Error(`Artifact too large: ${bytes.length} bytes`);

  const preview = bytes.subarray(0, Math.min(bytes.length, 256)).toString("utf8").trimStart().toLowerCase();
  const looksLikeHtml = contentType.toLowerCase().includes("text/html") || preview.startsWith("<!doctype html") || preview.startsWith("<html");
  const imgExt = imageExtension(contentType);

  let filename = null;
  if (looksLikeHtml) filename = "screen.html";
  else if (imgExt) filename = `screenshot${imageIndex > 0 ? `-${imageIndex + 1}` : ""}${imgExt}`;
  else return { skipped: true, source_url: url, reason: `unsupported content-type: ${contentType || "unknown"}` };

  const file = path.join(outputDir, filename);
  fs.writeFileSync(file, bytes);
  return {
    skipped: false,
    file,
    relative_path: path.relative(workspaceRoot, file),
    bytes: bytes.length,
    content_type: contentType,
    source_url: url,
  };
}

const stitch = new StitchToolClient({ apiKey: loadApiKey(), timeout: 30000 });
const server = new McpServer(
  { name: "dwb-stitch-artifacts", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.registerTool(
  "stitch_list_projects",
  {
    title: "List Stitch projects",
    description: "List Google Stitch projects owned by the API-key account.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async () => textResult(await stitch.callTool("list_projects", { filter: "view=owned" })),
);

server.registerTool(
  "stitch_list_screens",
  {
    title: "List Stitch screens",
    description: "List screens in a Stitch project, including artifact metadata and download URLs when available.",
    inputSchema: { projectId: z.string().min(1) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ projectId }) => textResult(await stitch.callTool("list_screens", { projectId })),
);

server.registerTool(
  "stitch_pull_screen_artifacts",
  {
    title: "Pull Stitch screen into local workspace",
    description:
      "Find a Stitch project and screen by title, download its HTML and screenshot artifacts, and save them directly inside the local repository workspace. Use this instead of asking the user to download files manually.",
    inputSchema: {
      project_title: z.string().min(1),
      screen_title: z.string().min(1).optional(),
      output_dir: z.string().min(1).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ project_title, screen_title, output_dir }) => {
    const projects = await stitch.callTool("list_projects", { filter: "view=owned" });
    const projectObj = findObjectByExactText(projects, project_title);
    if (!projectObj) throw new Error(`Project not found by exact title: ${project_title}`);

    const projectId = extractProjectId(projectObj);
    if (!projectId) throw new Error(`Could not extract project ID for: ${project_title}`);

    const screens = await stitch.callTool("list_screens", { projectId });
    const chosenTitle = screen_title || project_title;
    let screenObj = findObjectByExactText(screens, chosenTitle);
    if (!screenObj && !screen_title) {
      const candidates = collectObjects(screens).filter((obj) => extractScreenId(obj));
      if (candidates.length === 1) screenObj = candidates[0];
    }
    if (!screenObj) throw new Error(`Screen not found by exact title: ${chosenTitle}`);

    const screenId = extractScreenId(screenObj);
    if (!screenId) throw new Error(`Could not extract screen ID for: ${chosenTitle}`);

    const urls = [...new Set(collectHttpUrls(screenObj))];
    if (urls.length === 0) throw new Error("No downloadable artifact URLs found on the selected screen");

    const relativeDir = output_dir || path.join("stitch-output", slugify(project_title));
    const outputDir = resolveSafeOutputDir(relativeDir);
    fs.mkdirSync(outputDir, { recursive: true });

    const downloads = [];
    let imageIndex = 0;
    for (const url of urls) {
      const result = await downloadArtifact(url, outputDir, imageIndex);
      if (!result.skipped && String(result.content_type).toLowerCase().startsWith("image/")) imageIndex += 1;
      downloads.push(result);
    }

    const saved = downloads.filter((item) => !item.skipped);
    if (saved.length === 0) throw new Error("Artifact URLs were found, but no supported HTML/image files were saved");

    return textResult({
      project_title,
      project_id: projectId,
      screen_title: chosenTitle,
      screen_id: screenId,
      output_dir: path.relative(workspaceRoot, outputDir),
      saved_files: saved,
      skipped: downloads.filter((item) => item.skipped),
    });
  },
);

process.stdout.on("error", (error) => {
  if (error?.code === "EPIPE") process.exit(0);
  throw error;
});

process.on("SIGINT", async () => {
  try { await stitch.close(); } catch {}
  try { await server.close(); } catch {}
  process.exit(0);
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[dwb-stitch-artifacts] MCP server running on stdio");
