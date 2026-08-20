import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["artifact-server.mjs"],
  cwd: process.cwd(),
  stderr: "pipe",
});

const client = new Client({ name: "dwb-stitch-artifact-smoke", version: "0.1.0" });
await client.connect(transport);
const tools = await client.listTools();
console.log("TOOLS", tools.tools.map((t) => t.name).join(","));
const result = await client.callTool({
  name: "stitch_pull_screen_artifacts",
  arguments: {
    project_title: "Bebz Coffee Landing Page",
    screen_title: "Bebz Coffee Landing Page",
    output_dir: "stitch-output/bebz-coffee",
  },
});
console.log("PULL_ERROR", result.isError === true);
console.log(result.content?.map((c) => c.type === "text" ? c.text : "").join("\n") || "");
await client.close();
