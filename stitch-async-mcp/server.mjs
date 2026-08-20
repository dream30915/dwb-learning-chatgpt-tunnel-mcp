import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StitchToolClient } from "@google/stitch-sdk";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const jobsDir = path.join(__dirname, "jobs");
const workerFile = path.join(__dirname, "worker.mjs");
const keyFile = process.env.STITCH_API_KEY_FILE
  ? path.resolve(process.env.STITCH_API_KEY_FILE)
  : path.resolve(__dirname, "../tunnel-client/stitch-api-key.txt");
fs.mkdirSync(jobsDir, { recursive: true });

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

function jobPath(jobId) {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error("Invalid job_id");
  return path.join(jobsDir, `${jobId}.json`);
}

function readJob(jobId) {
  const file = jobPath(jobId);
  if (!fs.existsSync(file)) throw new Error(`Job not found: ${jobId}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJob(job) {
  const file = jobPath(job.id);
  fs.writeFileSync(file, JSON.stringify(job, null, 2), "utf8");
}

const apiKey = loadApiKey();
const stitch = new StitchToolClient({ apiKey, timeout: 90000 });

const server = new McpServer(
  { name: "dwb-stitch-async", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.registerTool(
  "stitch_start_generate",
  {
    title: "Start Stitch generation",
    description:
      "Start a long-running Google Stitch generate_screen_from_text job in a detached worker and return a job_id immediately. Use stitch_job_status to poll it. Do not call generate repeatedly for the same request.",
    inputSchema: {
      projectId: z.string().min(1),
      prompt: z.string().min(1),
      deviceType: z.enum(["DESKTOP", "MOBILE", "TABLET", "AGNOSTIC"]).default("DESKTOP"),
      modelId: z.enum(["GEMINI_3_FLASH", "GEMINI_3_1_PRO"]).default("GEMINI_3_FLASH"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ projectId, prompt, deviceType, modelId }) => {
    const id = randomUUID();
    const now = new Date().toISOString();
    const job = {
      id,
      type: "generate_screen_from_text",
      status: "queued",
      createdAt: now,
      updatedAt: now,
      input: { projectId, prompt, deviceType, modelId },
      result: null,
      error: null,
    };
    writeJob(job);

    const child = spawn(process.execPath, [workerFile, jobPath(id)], {
      cwd: __dirname,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();

    return textResult({
      job_id: id,
      status: "queued",
      next: `Call stitch_job_status with job_id ${id}. Do not start another generation for the same request.`,
    });
  },
);

server.registerTool(
  "stitch_job_status",
  {
    title: "Check Stitch job status",
    description: "Check a Stitch async job. Returns queued, running, completed, or failed.",
    inputSchema: { job_id: z.string().uuid() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ job_id }) => {
    const job = readJob(job_id);
    return textResult({
      job_id: job.id,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt ?? null,
      completedAt: job.completedAt ?? null,
      failedAt: job.failedAt ?? null,
      error: job.error ?? null,
      has_result: job.result != null,
    });
  },
);

server.registerTool(
  "stitch_job_result",
  {
    title: "Get Stitch job result",
    description: "Return the completed result of a Stitch async job. If still running, returns the current status instead.",
    inputSchema: { job_id: z.string().uuid() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ job_id }) => {
    const job = readJob(job_id);
    if (job.status !== "completed") {
      return textResult({ job_id: job.id, status: job.status, error: job.error ?? null });
    }
    return textResult({ job_id: job.id, status: job.status, result: job.result });
  },
);

server.registerTool(
  "stitch_list_jobs",
  {
    title: "List recent Stitch jobs",
    description: "List recent local async Stitch jobs, newest first.",
    inputSchema: { limit: z.number().int().min(1).max(20).default(10) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ limit }) => {
    const jobs = fs
      .readdirSync(jobsDir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => JSON.parse(fs.readFileSync(path.join(jobsDir, name), "utf8")))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit)
      .map((job) => ({ id: job.id, status: job.status, createdAt: job.createdAt, projectId: job.input?.projectId }));
    return textResult(jobs);
  },
);

server.registerTool(
  "stitch_create_project",
  {
    title: "Create Stitch project",
    description: "Create a Google Stitch project. This is normally a quick synchronous operation.",
    inputSchema: { title: z.string().min(1) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ title }) => textResult(await stitch.callTool("create_project", { title })),
);

server.registerTool(
  "stitch_list_projects",
  {
    title: "List Stitch projects",
    description: "List Google Stitch projects owned by the current API-key account.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async () => textResult(await stitch.callTool("list_projects", { filter: "view=owned" })),
);

server.registerTool(
  "stitch_list_screens",
  {
    title: "List Stitch screens",
    description: "List screens in a Stitch project. Useful after an async generation finishes or times out remotely.",
    inputSchema: { projectId: z.string().min(1) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ projectId }) => textResult(await stitch.callTool("list_screens", { projectId })),
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
console.error("[dwb-stitch-async] MCP server running on stdio");
