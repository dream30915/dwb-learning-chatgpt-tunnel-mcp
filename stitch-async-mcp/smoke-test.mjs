import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["server.mjs"],
  cwd: process.cwd(),
  stderr: "pipe",
});

const client = new Client({ name: "dwb-stitch-async-smoke", version: "0.1.0" });
await client.connect(transport);
const tools = await client.listTools();
console.log("TOOLS", tools.tools.map((t) => t.name).join(","));
const jobs = await client.callTool({ name: "stitch_list_jobs", arguments: { limit: 3 } });
console.log("LIST_JOBS_OK", jobs.isError !== true);
await client.close();
