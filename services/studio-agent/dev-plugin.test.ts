import { EventEmitter } from 'node:events';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ViteDevServer } from 'vite';
import { AGENT_BODY_LIMIT, AGENT_REQUEST_TIMEOUT_MS, studioAgentDevPlugin } from './dev-plugin';
const { run } = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('./run', () => ({ runTextEdit: run }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); vi.useRealTimers(); });
async function withServer(test: (url: string) => Promise<void>) {
  let handler!: (req: IncomingMessage, res: ServerResponse) => void;
  const plugin = studioAgentDevPlugin();
  const configure = plugin.configureServer as (server: ViteDevServer) => void;
  configure({ middlewares: { use: (_path: string, fn: typeof handler) => { handler = fn; } } } as unknown as ViteDevServer);
  const server = createServer((req,res) => handler(req,res));
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  const addr = server.address() as {port:number};
  try { await test(`http://127.0.0.1:${addr.port}`); } finally { await new Promise<void>((resolve,reject) => server.close(e=>e?reject(e):resolve())); }
}
describe('local agent endpoint', () => {
  it('rejects cross-origin without model call', async () => {
    await withServer(async url => { expect((await fetch(url,{method:'POST',headers:{Origin:'https://other.example','Content-Type':'application/json'},body:'{}'})).status).toBe(403); });
    expect(run).not.toHaveBeenCalled();
  });
  it('reports absent server credentials without calling model', async () => {
    vi.stubEnv('ARK_API_KEY','');
    await withServer(async url => { expect((await fetch(url,{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:'{}'})).status).toBe(503); });
  });
  it('returns a candidate without persistence', async () => {
    vi.stubEnv('ARK_API_KEY','test-secret');run.mockResolvedValue({after:'candidate'});
    await withServer(async url => { const res=await fetch(url,{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:'{}'});expect(res.status).toBe(200);expect(await res.json()).toEqual({candidate:{after:'candidate'}}); });
  });
  it('does not expose provider errors', async () => {
    vi.stubEnv('ARK_API_KEY','test-secret');run.mockRejectedValue(new Error('test-secret private-provider-body'));
    await withServer(async url => { const res=await fetch(url,{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:'{}'});expect(res.status).toBe(422);expect(await res.text()).not.toContain('test-secret'); });
  });
});

function mockEndpoint() {
  let handler!: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  const plugin = studioAgentDevPlugin();
  (plugin.configureServer as (server: ViteDevServer) => void)({ middlewares: {
    use: (_path: string, fn: typeof handler) => { handler = fn; },
  } } as unknown as ViteDevServer);
  return () => {
    const req = Object.assign(new EventEmitter(), {
      socket: { remoteAddress: '127.0.0.1' },
      headers: { host: 'localhost:5199', origin: 'http://localhost:5199', 'content-type': 'application/json' },
      method: 'POST',
    });
    const res = Object.assign(new EventEmitter(), {
      destroyed: false, writableEnded: false, statusCode: 0,
      setHeader: vi.fn(), end: vi.fn((_body: string) => { res.writableEnded = true; }),
    });
    const done = handler(req as unknown as IncomingMessage, res as unknown as ServerResponse);
    return { req, res, done };
  };
}
describe('request stream boundaries', () => {
  it('preserves multibyte UTF-8 split across chunks', async () => {
    vi.stubEnv('ARK_API_KEY', 'test-only'); run.mockResolvedValue({ after: 'ok' });
    const { req, done } = mockEndpoint()();
    const body = Buffer.from(JSON.stringify({ instruction: '中文标题' }));
    // Byte-at-a-time delivery splits every Chinese code point.
    for (const byte of body) req.emit('data', Buffer.from([byte]));
    req.emit('end'); await done;
    expect(run.mock.calls[0]![0]).toEqual({ instruction: '中文标题' });
  });
  it('limits bytes and rejects before waiting for the end of an oversized body', async () => {
    vi.stubEnv('ARK_API_KEY', 'test-only');
    const { req, res, done } = mockEndpoint()();
    req.emit('data', Buffer.alloc(AGENT_BODY_LIMIT + 1)); await done;
    expect(res.statusCode).toBe(413); expect(run).not.toHaveBeenCalled();
    expect(req.listenerCount('data')).toBe(0);
  });
  it('times out incomplete upload and releases the single-task slot', async () => {
    vi.useFakeTimers(); vi.stubEnv('ARK_API_KEY', 'test-only'); run.mockResolvedValue({ after: 'ok' });
    const start = mockEndpoint(); const slow = start();
    slow.req.emit('data', Buffer.from('{'));
    await vi.advanceTimersByTimeAsync(AGENT_REQUEST_TIMEOUT_MS); await slow.done;
    expect(slow.res.statusCode).toBe(408); expect(run).not.toHaveBeenCalled();
    expect(slow.req.listenerCount('data')).toBe(0);
    const next = start(); next.req.emit('data', Buffer.from('{}')); next.req.emit('end'); await next.done;
    expect(next.res.statusCode).toBe(200); expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels disconnected uploads without invoking the model', async () => {
    vi.stubEnv('ARK_API_KEY', 'test-only');
    const { req, res, done } = mockEndpoint()();
    res.destroyed = true; res.emit('close'); await done;
    expect(run).not.toHaveBeenCalled(); expect(res.end).not.toHaveBeenCalled();
    expect(req.listenerCount('data')).toBe(0);
  });
  it('times out pending model work and rejects concurrent requests', async () => {
    vi.useFakeTimers(); vi.stubEnv('ARK_API_KEY', 'test-only'); run.mockReturnValue(new Promise(() => {}));
    const start = mockEndpoint(); const first = start();
    first.req.emit('data', Buffer.from('{}')); first.req.emit('end'); await Promise.resolve();
    const concurrent = start(); await concurrent.done; expect(concurrent.res.statusCode).toBe(429);
    await vi.advanceTimersByTimeAsync(AGENT_REQUEST_TIMEOUT_MS); await first.done;
    expect(first.res.statusCode).toBe(408);
    expect((run.mock.calls[0]![2] as AbortSignal).aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('aborts a running model and releases slot even if the model never settles', async () => {
    vi.useFakeTimers(); vi.stubEnv('ARK_API_KEY', 'test-only'); run.mockReturnValue(new Promise(() => {}));
    const start = mockEndpoint(); const first = start();
    first.req.emit('data', Buffer.from('{}')); first.req.emit('end');
    await Promise.resolve();
    const signal = run.mock.calls[0]![2] as AbortSignal;
    first.res.destroyed = true; first.res.emit('close'); await first.done;
    expect(signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
    run.mockResolvedValue({ after: 'ok' });
    const next = start(); next.req.emit('data', Buffer.from('{}')); next.req.emit('end'); await next.done;
    expect(next.res.statusCode).toBe(200);
  });
});
