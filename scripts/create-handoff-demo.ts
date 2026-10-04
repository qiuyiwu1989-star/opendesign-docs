import { readFile } from "node:fs/promises";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
// Synthetic fixture only; never silently upload a user's private file.
const html = await readFile(new URL("../docs/incoming/deepbrain-sample-report.html", import.meta.url), "utf8");
const client = new Client({ name: "opendesign-handoff-demo", version: "0.1.0" });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL("http://127.0.0.1:5192/mcp")));
  const result = await client.callTool({ name: "opendesign_create_document_handoff",
    arguments: { name: "MCP-深脑合成报告.html", html } });
  if (result.isError) throw new Error(JSON.stringify(result.content));
  console.log(JSON.stringify(result.structuredContent, null, 2));
} finally { await client.close(); }
