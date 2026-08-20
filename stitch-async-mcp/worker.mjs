import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StitchToolClient } from "@google/stitch-sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jobFile = process.argv[2];
if (!jobFile) process.exit(2);

const keyFile = process.env.STITCH_API_KEY_FILE
  ? path.resolve(process.env.STITCH_API_KEY_FILE)
  : path.resolve(__dirname, "../tunnel-client/stitch-api-key.txt");

function readJob() {
  return JSON.parse(fs.readFileSync(jobFile, "utf8"));
}

function writeJob(next) {
  const tmp = `${jobFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  fs.renameSync(tmp, jobFile);
}

function update(patch) {
  const current = readJob();
  writeJob({ ...current, ...patch, updatedAt: new Date().toISOString() });
}

let client;
try {
  const apiKey = process.env.STITCH_API_KEY?.trim()
    || (fs.existsSync(keyFile) ? fs.readFileSync(keyFile, "utf8").trim() : "");
  if (!apiKey) {
    throw new Error(
      `Stitch API key not found. Set STITCH_API_KEY or STITCH_API_KEY_FILE, or create: ${keyFile}`,
    );
  }

  const job = readJob();
  update({ status: "running", startedAt: new Date().toISOString(), workerPid: process.pid });

  client = new StitchToolClient({ apiKey, timeout: 300000 });
  const result = await client.callTool("generate_screen_from_text", {
    projectId: job.input.projectId,
    prompt: job.input.prompt,
    deviceType: job.input.deviceType,
    modelId: job.input.modelId,
  });

  update({
    status: "completed",
    completedAt: new Date().toISOString(),
    result,
    error: null,
  });
} catch (error) {
  try {
    update({
      status: "failed",
      failedAt: new Date().toISOString(),
      error: {
        name: error?.name ?? "Error",
        message: error?.message ?? String(error),
      },
    });
  } catch {
    // Nothing else to do if the job file itself is unavailable.
  }
  process.exitCode = 1;
} finally {
  try {
    await client?.close();
  } catch {
    // Best-effort cleanup only.
  }
}
