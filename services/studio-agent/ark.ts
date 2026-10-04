/** Server-side only. Credentials must never be returned to the browser. */
export const ARK_TIMEOUT_MS = 120_000;
export type ArkConfig = { apiKey: string; baseURL?: string; model?: string };
export type ArkResult = { output: unknown[]; usage?: unknown };
export class ArkRequestError extends Error {
  readonly status?: number;
  constructor(public readonly code: 'configuration' | 'cancelled' | 'timeout' | 'provider' | 'invalid_output' | 'network', status?: number) {
    super(`模型请求失败（${code}）`);
    this.name = 'ArkRequestError';
    if (typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599) this.status = status;
  }
}
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function validateResult(value: unknown): ArkResult {
  if (!record(value) || value.error || (value.status !== undefined && value.status !== 'completed') || !Array.isArray(value.output)) {
    throw new ArkRequestError('invalid_output');
  }
  for (const item of value.output) {
    if (!record(item) || typeof item.type !== 'string' || !item.type) throw new ArkRequestError('invalid_output');
    if (item.type === 'function_call' && (
      typeof item.name !== 'string' || !item.name || typeof item.arguments !== 'string' ||
      typeof item.call_id !== 'string' || !item.call_id
    )) throw new ArkRequestError('invalid_output');
  }
  return { output: value.output, ...(value.usage === undefined ? {} : { usage: value.usage }) };
}

/** One Responses API turn; tool execution and authorization belong to the caller. */
export async function requestArk(config: ArkConfig, input: unknown[], tools: unknown[], signal?: AbortSignal): Promise<ArkResult> {
  if (signal?.aborted) throw new ArkRequestError('cancelled');
  let endpoint: URL;
  try {
    endpoint = new URL(`${(config.baseURL ?? 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '')}/responses`);
    if (!config.apiKey?.trim() || /[\r\n]/.test(config.apiKey) || !['https:', 'http:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      throw new Error();
    }
  } catch { throw new ArkRequestError('configuration'); }
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, ARK_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model ?? 'deepseek-v4-1-flash-260910', input, tools,
        stream: false, store: false,
      }),
      signal: controller.signal,
      redirect: 'error',
    });
    if (!response.ok) throw new ArkRequestError('provider', response.status);
    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new ArkRequestError('invalid_output'); }
    if (controller.signal.aborted) throw new ArkRequestError(timedOut ? 'timeout' : 'cancelled');
    return validateResult(payload);
  } catch (error) {
    // Never retain provider bodies, transport messages or causes: these can contain secrets.
    if (controller.signal.aborted) throw new ArkRequestError(timedOut ? 'timeout' : 'cancelled');
    if (error instanceof ArkRequestError) throw error;
    throw new ArkRequestError('network');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}
