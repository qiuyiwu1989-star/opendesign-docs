import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARK_TIMEOUT_MS, ArkRequestError, requestArk } from './ark';
const config = { apiKey: 'test-secret-only' };
const call = { type: 'function_call', call_id: 'call-1', name: 'propose_text', arguments: '{"after":"新标题"}' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('Ark Responses adapter', () => {
  it.each([99, 600, NaN, 401.5])('omits invalid diagnostic status %s', status => { expect(new ArkRequestError('provider', status).status).toBeUndefined(); });
  it('posts a non-stored Responses request and returns function calls and usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ status: 'completed', output: [call], usage: { total_tokens: 12 } }));
    vi.stubGlobal('fetch', fetchMock);
    const input = [{ role: 'user', content: '请优化标题' }];
    const tools = [{ type: 'function', name: 'propose_text' }];
    expect(await requestArk(config, input, tools)).toEqual({ output: [call], usage: { total_tokens: 12 } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://ark.cn-beijing.volces.com/api/v3/responses');
    expect(JSON.parse(init.body)).toEqual({ model: 'deepseek-v4-1-flash-260910', input, tools, stream: false, store: false });
    expect(init.redirect).toBe('error');
  });
  it('uses explicit deployment endpoint and model overrides', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ output: [] })); vi.stubGlobal('fetch', fetchMock);
    await requestArk({ ...config, baseURL: 'https://example.test/api/v3/', model: 'deployment-test' }, [], []);
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://example.test/api/v3/responses');
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).model).toBe('deployment-test');
  });
  it.each([401, 429, 500])('redacts HTTP %s error bodies', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ error: config.apiKey }, status)));
    await expect(requestArk(config, [], [])).rejects.toMatchObject({ code: 'provider', status, message: '模型请求失败（provider）' });
  });
  it('redacts transport errors including their cause', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(config.apiKey)));
    try { await requestArk(config, [], []); expect.fail('must reject'); }
    catch (error) { expect(String(error)).not.toContain(config.apiKey); expect(error).not.toHaveProperty('cause'); }
  });
  it.each([null, {}, { output: [null] }, { output: [{ type: 'function_call', name: 'x' }] }, { output: [], status: 'incomplete' }, { output: [], error: { message: 'private' } }])('rejects invalid or incomplete output %#', async body => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(body)));
    await expect(requestArk(config, [], [])).rejects.toMatchObject({ code: 'invalid_output' });
  });
  it('rejects non-JSON output', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private debug response')));
    await expect(requestArk(config, [], [])).rejects.toMatchObject({ code: 'invalid_output' });
  });
  it('rejects cancellation before any network request', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController(); controller.abort();
    await expect(requestArk(config, [], [], controller.signal)).rejects.toMatchObject({ code: 'cancelled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  const pendingFetch = () => vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal!.addEventListener('abort', () => reject(new Error('private transport error')), { once: true });
  })));
  it('propagates cancellation while waiting', async () => {
    pendingFetch(); const controller = new AbortController();
    const result = requestArk(config, [], [], controller.signal);
    controller.abort(); await expect(result).rejects.toMatchObject({ code: 'cancelled' });
  });
  it('times out and aborts the underlying fetch', async () => {
    vi.useFakeTimers(); pendingFetch();
    const assertion = expect(requestArk(config, [], [])).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(ARK_TIMEOUT_MS); await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects invalid config without a request', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(requestArk({ apiKey: '' }, [], [])).rejects.toMatchObject({ code: 'configuration' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
