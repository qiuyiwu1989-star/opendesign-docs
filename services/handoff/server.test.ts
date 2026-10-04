import { afterAll, beforeAll, expect, it } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createServer, request } from "node:http";
import { clientAddress, createHandoffService } from "./server";
let base: string, service: ReturnType<typeof createHandoffService>;
beforeAll(async () => {
  const probe = createServer();
  await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  base = `http://127.0.0.1:${port}`;
  service = createHandoffService({ publicUrl: base, docsUrl: "http://127.0.0.1:5191/" });
  await new Promise<void>(resolve => service.http.listen(port, "127.0.0.1", resolve));
});
afterAll(async () => { await service?.close(); });
const post = (path: string, data: unknown, headers: Record<string, string> = {}) => fetch(base + path, {
  method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(data),
});
it("real MCP client initializes, discovers, calls, reads exact source and cleans up", async () => {
  const client = new Client({ name: "acceptance", version: "1.0.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(base + "/mcp")));
    const { tools } = await client.listTools();
    expect(tools.map(tool => tool.name)).toEqual(["opendesign_create_document_handoff"]);
    const html = '<!doctype html>\r\n<h1>你好 &amp; MCP</h1><svg><rect width="20"/></svg>';
    const result = await client.callTool({ name: tools[0]!.name, arguments: { name: "MCP验收.html", html } });
    expect(result.isError).not.toBe(true);
    const data = result.structuredContent as { status: string; open_url: string; expires_at: string };
    expect(data.status).toBe("ready");
    const url = new URL(data.open_url); expect(url.search).toBe("");
    const landing = await fetch(url); expect(landing.status).toBe(200);
    expect(await landing.text()).not.toContain(html); // Link previews cannot consume or execute the document.
    const token = url.hash.slice(1);
    const read = await post("/api/read", { token });
    expect(read.headers.get("cache-control")).toBe("no-store");
    expect((await read.json()).html).toBe(html);
    expect((await post("/api/read", { token })).status).toBe(200); // cancellation/retry supported
    expect((await post("/api/complete", { token })).status).toBe(200);
    expect((await post("/api/read", { token })).status).toBe(404);
    expect((await post("/api/complete", { token })).status).toBe(200);
    const invalid = await client.callTool({ name: tools[0]!.name, arguments: { name: "x", html: "" } });
    expect(invalid.isError).toBe(true);
  } finally { await client.close(); }
});
it("rejects foreign origins, rebinding hosts, bad payloads and unsupported requests", async () => {
  expect((await post("/api/handoffs", { name: "x", html: "x" }, { Origin: "https://evil.example" })).status).toBe(403);
  // Node fetch rewrites Host; use a real raw HTTP header for DNS rebinding coverage.
  const hostStatus = await new Promise<number | undefined>((resolve, reject) => {
    const req = request(base + "/healthz", { headers: { Host: "evil.example" } }, res => { res.resume(); resolve(res.statusCode); });
    req.on("error", reject); req.end();
  });
  expect(hostStatus).toBe(403);
  expect((await post("/api/handoffs", { name: "x", html: "\ud800" })).status).toBe(400);
  expect((await post("/api/read", { token: "x".repeat(1500) })).status).toBe(413);
  expect((await post("/api/read", { token: "bad" })).status).toBe(404);
  expect((await fetch(base + "/mcp")).status).toBe(405);
  const response = await fetch(base + "/open");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
});
it("REST accepts source with origin fixed by configuration and no source URL fetching", async () => {
  const response = await post("/api/handoffs", { name: "x", html: "<h1>REST</h1>", sourceUrl: "http://private.invalid" }, { "X-Forwarded-Host": "evil.example" });
  expect(response.status).toBe(201); expect((await response.json()).open_url).toMatch(base);
});

it("only explicitly trusted loopback proxies supply a single valid client IP", () => {
  const req = (peer: string, real: string) => ({ socket: { remoteAddress: peer }, headers: { "x-real-ip": real } }) as Parameters<typeof clientAddress>[0];
  expect(clientAddress(req("127.0.0.1", "203.0.113.4"))).toBe("127.0.0.1");
  expect(clientAddress(req("192.0.2.4", "203.0.113.4"), true)).toBe("192.0.2.4");
  expect(clientAddress(req("127.0.0.1", "203.0.113.4"), true)).toBe("203.0.113.4");
  expect(() => clientAddress(req("127.0.0.1", "203.0.113.4, 203.0.113.5"), true)).toThrow();
});

it("serves a mounted path with working relative assets and canonical handoff URLs", async () => {
 const mounted = createHandoffService({ publicUrl: "https://docs.example/connect/", docsUrl: "https://docs.example/" });
 await new Promise<void>(r => mounted.http.listen(0,"127.0.0.1",r));
 const port = (mounted.http.address() as {port:number}).port;
 const call = (path:string, method="GET", body?:string) => new Promise<{status:number;body:string}>((resolve,reject) => {
  const req = request(`http://127.0.0.1:${port}${path}`, { method, headers: {Host:"docs.example", Accept:"application/json, text/event-stream", "Content-Type":"application/json"} }, res=>{
   let text="";res.on("data",chunk=>text+=chunk);res.on("end",()=>resolve({status:res.statusCode!,body:text}));
  });req.on("error",reject);req.end(body);
 });
 try {
  expect((await call("/healthz")).status).toBe(404);
  expect((await call("/connect/healthz")).status).toBe(200);
  expect((await call("/connect/open")).body).toContain('src="./open.js"');
  expect((await call("/connect/open.js")).body).toContain("fetch('./config')");
  const result=await call("/connect/api/handoffs","POST",JSON.stringify({name:"x",html:"<h1>Mounted</h1>"}));
  expect(result.status).toBe(201);
  expect(JSON.parse(result.body).open_url).toMatch(/^https:\/\/docs.example\/connect\/open#/);
  const rpc=await call("/connect/mcp","POST",JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/list"}));
  expect(rpc.status).toBe(200);
 } finally {await mounted.close();}
});
