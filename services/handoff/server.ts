import { createServer, type IncomingMessage } from "node:http";
import { isIP } from "node:net";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { ImportError } from "../../src/document-import";
import { MAX_DOCUMENT_BYTES } from "../../src/document-limits";
import { HandoffStore, RateLimit, ServiceError } from "./store";

export type Config = { publicUrl: string; docsUrl: string; trustLoopbackProxy?: boolean };
function endpoint(raw: string) {
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))))
    throw new Error("Use HTTPS, or loopback HTTP, without credentials, query or fragment.");
  return url;
}
export function clientAddress(req: { socket: { remoteAddress: string | undefined }; headers: IncomingMessage["headers"] }, trustProxy = false) {
  const peer = req.socket.remoteAddress ?? "unknown";
  if (!trustProxy || !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer)) return peer;
  // The dedicated nginx vhost overwrites this header with $remote_addr.
  const real = req.headers["x-real-ip"];
  if (typeof real !== "string" || !isIP(real)) throw new ServiceError(403, "Invalid proxy client address.");
  return real;
}
export function createHandoffService(config: Config, store = new HandoffStore()) {
  const base = endpoint(config.publicUrl);
  const docs = endpoint(config.docsUrl);
  if (!base.pathname.endsWith("/") || !/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base.pathname))
    throw new Error("publicUrl must use a simple path with a trailing slash.");
  const limits = new RateLimit();
  const assets = new Map([
    ["/", { type: "text/html; charset=utf-8", body: readFileSync(new URL("./open.html", import.meta.url)) }],
    ["/open", { type: "text/html; charset=utf-8", body: readFileSync(new URL("./open.html", import.meta.url)) }],
    ["/open.js", { type: "text/javascript; charset=utf-8", body: readFileSync(new URL("./open.js", import.meta.url)) }],
    ["/sdk/opendesign.js", { type: "text/javascript; charset=utf-8", body: readFileSync(new URL("../../public/sdk/opendesign.js", import.meta.url)) }],
  ]);
  const create = (name: unknown, html: unknown) => {
    if (typeof name !== "string" || name.length > 1024) throw new ServiceError(400, "文件名无效或过长。");
    const entry = store.create(name, html);
    return { status: "ready" as const, open_url: `${base.href}open#${entry.token}`,
      expires_at: new Date(entry.expiresAt).toISOString() };
  };
  const mcp = createMcpHandler(() => {
    const server = new McpServer({ name: "opendesign-docs", version: "0.1.0" });
    server.registerTool("opendesign_create_document_handoff", {
      title: "Open HTML in OpenDesign Docs",
      description: "Create a temporary 15-minute link for user-supplied HTML (up to 5 MiB UTF-8). " +
        "Uploads HTML to this service's temporary memory. Anyone holding the link can read it. " +
        "Return the open_url to the user; they must click and confirm import. Ready is not imported. " +
        "No URL fetching, cloud document storage or editing. Do not send secrets or HTML without permission.",
      inputSchema: z.object({ name: z.string().max(1024).describe("HTML filename"),
        html: z.string().min(1).max(MAX_DOCUMENT_BYTES).describe("Complete UTF-8 HTML source, not a website URL") }),
      outputSchema: z.object({ status: z.literal("ready"), open_url: z.string(), expires_at: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    }, async ({ name, html }) => {
      try {
        const result = create(name, html);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result };
      } catch (error) {
        return { isError: true, content: [{ type: "text" as const,
          text: error instanceof ImportError || error instanceof ServiceError ? error.message : "无法创建交接，请稍后重试。" }] };
      }
    });
    return server;
  }, { responseMode: "json" });
  let active = 0;
  const http = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const json = (status: number, data: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(data));
    };
    // Explicit configured origin; forwarded headers never decide the destination or trust boundary.
    if (req.headers.host !== base.host || (req.headers.origin !== undefined && req.headers.origin !== base.origin)) {
      json(403, { error: "来源不受支持。" }); return;
    }
    if (active >= 4) { json(503, { error: "服务繁忙，请稍后再试。" }); return; }
    active++;
    try {
      const requestedPath = new URL(req.url ?? "/", base).pathname;
      if (!requestedPath.startsWith(base.pathname)) { json(404, { error: "Not found" }); return; }
      const path = "/" + requestedPath.slice(base.pathname.length);
      if (req.method === "GET") {
        const asset = assets.get(path);
        if (asset) { res.writeHead(200, { "Content-Type": asset.type }); res.end(asset.body); return; }
        if (path === "/config") { json(200, { docsUrl: docs.href }); return; }
        if (path === "/healthz") { json(200, { ok: true }); return; }
        if (path === "/mcp") { res.setHeader("Allow", "POST"); json(405, { error: "Use MCP Streamable HTTP POST." }); return; }
      }
      if (req.method !== "POST" || !["/mcp", "/api/handoffs", "/api/read", "/api/complete"].includes(path)) {
        json(404, { error: "Not found" }); return;
      }
      limits.take(clientAddress(req, config.trustLoopbackProxy));
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] ?? "")) {
        json(415, { error: "Use application/json." }); return;
      }
      // JSON escapes can expand a 5 MiB document by six times. Small token routes stay small.
      const body = await readBody(req, path === "/api/read" || path === "/api/complete" ? 1024 : 32 * 1024 * 1024);
      if (path === "/mcp") {
        let rpc;
        try { rpc = JSON.parse(body); } catch { throw new ServiceError(400, "JSON 格式无效。"); }
        // This service offers one tool and no long-lived subscriptions or server-initiated requests.
        if (!rpc || typeof rpc !== "object" || Array.isArray(rpc) ||
            !["initialize", "notifications/initialized", "notifications/cancelled", "ping", "tools/list", "tools/call"].includes(rpc.method)) {
          json(200, { jsonrpc: "2.0", id: typeof rpc?.id === "string" || typeof rpc?.id === "number" ? rpc.id : null,
            error: { code: -32601, message: "Method not supported by this handoff service." } }); return;
        }
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) if (value !== undefined)
          headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        const response = await mcp.fetch(new Request(`${base.href}mcp`, { method: "POST", headers, body }));
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      let data: Record<string, unknown>;
      try { data = JSON.parse(body); if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(); }
      catch { throw new ServiceError(400, "JSON 格式无效。"); }
      if (path === "/api/handoffs") json(201, create(data.name, data.html));
      else if (path === "/api/read") json(200, store.read(data.token));
      else {
        // Possession authorizes deletion. This is a cleanup acknowledgement, not proof of import.
        if (typeof data.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(data.token)) throw new ServiceError(400, "无效链接。");
        store.delete(data.token); json(200, { ok: true });
      }
    } catch (error) {
      json(error instanceof ServiceError ? error.status : error instanceof ImportError ? (error.reason === "too_large" ? 413 : 400) : 500,
        { error: error instanceof ServiceError || error instanceof ImportError ? error.message : "服务暂不可用，请重试。" });
    } finally { active--; }
  });
  http.requestTimeout = 20_000;
  http.headersTimeout = 10_000;
  const sweep = setInterval(() => store.prune(), 30_000); sweep.unref();
  return { http, close: async () => {
    clearInterval(sweep); store.clear(); await mcp.close();
    await new Promise<void>((resolve, reject) => { http.close(error => error ? reject(error) : resolve()); http.closeIdleConnections(); });
  } };
}

async function readBody(req: IncomingMessage, limit: number) {
  if (Number(req.headers["content-length"] ?? 0) > limit) throw new ServiceError(413, "请求超过大小限制。");
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk); size += bytes.length;
    if (size > limit) throw new ServiceError(413, "请求超过大小限制。");
    chunks.push(bytes);
  }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)); }
  catch { throw new ServiceError(400, "请求必须使用 UTF-8。"); }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.HANDOFF_PORT ?? 5192);
  const service = createHandoffService({ publicUrl: process.env.HANDOFF_PUBLIC_URL ?? `http://127.0.0.1:${port}`,
    docsUrl: process.env.HANDOFF_DOCS_URL ?? "http://127.0.0.1:5191/",
    trustLoopbackProxy: process.env.HANDOFF_TRUST_LOOPBACK_PROXY === "1" });
  service.http.listen(port, process.env.HANDOFF_BIND ?? "127.0.0.1", () => console.log(`OpenDesign handoff listening on port ${port}`));
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void service.close(); });
}
