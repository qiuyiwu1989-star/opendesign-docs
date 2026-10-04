import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { runTextEdit, type EditRequest } from './run';

export const AGENT_REQUEST_TIMEOUT_MS = 90000;
export const AGENT_BODY_LIMIT = 250000;
class BodyTooLarge extends Error {}

// Decode once, after collecting bytes: UTF-8 characters may span network chunks.
function readBody(req: IncomingMessage, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    const cleanup = () => {
      req.off('data', data); req.off('end', end); req.off('error', fail);
      signal.removeEventListener('abort', abort);
    };
    const fail = (error: unknown) => { cleanup(); reject(error); };
    const abort = () => fail(new Error('cancelled'));
    const data = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > AGENT_BODY_LIMIT) { fail(new BodyTooLarge()); return; }
      chunks.push(chunk);
    };
    const end = () => { cleanup(); resolve(Buffer.concat(chunks).toString('utf8')); };
    if (signal.aborted) { abort(); return; }
    req.on('data', data); req.once('end', end); req.once('error', fail);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(new Error('cancelled')); };
    if (signal.aborted) { work.catch(() => {}); abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Development-only endpoint. No public deployment or authentication contract implied. */
export function studioAgentDevPlugin(): Plugin {
  let running = false;
  return { name: 'studio-agent-local', apply: 'serve', configureServer(server) {
    server.middlewares.use('/api/studio-agent/edit', async (req: IncomingMessage, res: ServerResponse) => {
      const json = (status: number, value: unknown) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(value)); };
      const peer = req.socket.remoteAddress;
      const host = req.headers.host;
      if (!peer || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer) || !host || !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) || req.headers.origin !== `http://${host}`) { json(403, { error: '仅允许本机同源请求。' }); return; }
      if (req.method !== 'POST' || req.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') { json(400, { error: '请求格式无效。' }); return; }
      if (!process.env.ARK_API_KEY) { json(503, { error: '服务端尚未配置模型。' }); return; }
      if (running) { json(429, { error: '已有生成任务，请稍后重试。' }); return; }
      running = true;
      const controller = new AbortController();
      let timedOut = false;
      const cancel = () => { if (!res.writableEnded) controller.abort(); };
      res.on('close', cancel);
      req.on('aborted', cancel);
      const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, AGENT_REQUEST_TIMEOUT_MS);
      try {
        const input = await readBody(req, controller.signal);
        const request = JSON.parse(input) as EditRequest;
        const candidate = await abortable(runTextEdit(request, { apiKey: process.env.ARK_API_KEY }, controller.signal), controller.signal);
        if (!res.destroyed && !controller.signal.aborted) json(200, { candidate });
      } catch (error) {
        if (!res.destroyed) {
          res.setHeader('Connection', 'close');
          if (error instanceof BodyTooLarge) json(413, { error: '请求过大。' });
          else if (timedOut) json(408, { error: '请求超时，请重试。作品未修改。' });
          else if (!controller.signal.aborted) json(422, { error: '未生成可用候选，请检查选区或稍后重试。作品未修改。' });
        }
      }
      finally { running = false; clearTimeout(timeout); res.off('close', cancel); req.off('aborted', cancel); }
    });
  } };
}
