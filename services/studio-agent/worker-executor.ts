import { fork, type ChildProcess, type ForkOptions } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ArkRequestError, ARK_TIMEOUT_MS } from './ark';
import { buildCandidate, selectionContext } from './candidate';
import type { EditRequest } from './run';
import type { TextProposal } from '../../src/studio-model';
const codes = ['configuration','cancelled','timeout','provider','invalid_output','network'] as const;
type Options = { workerPath?: string; timeoutMs?: number; killGraceMs?: number; forkProcess?: (path: string, args: string[], options: ForkOptions) => ChildProcess };
/** Test/server construction seam only. Never map HTTP fields to these options. */
export function createWorkerExecutor(options: Options = {}) {
  return async (request: EditRequest, signal?: AbortSignal): Promise<TextProposal> => {
    if (signal?.aborted) throw new ArkRequestError('cancelled');
    selectionContext(request.version, request.targetId);
    if (typeof request.instruction !== 'string' || !request.instruction.trim() || request.instruction.length > 2000) throw new Error('无效的修改请求。');
    const input = structuredClone(request);
    const path = options.workerPath ?? fileURLToPath(new URL(import.meta.url.endsWith('.ts') ? './worker-child.ts' : './worker-child.mjs', import.meta.url));
    return new Promise<TextProposal>((resolve, reject) => {
      let child: ChildProcess;
      try { child = (options.forkProcess ?? fork)(path, [], { execArgv: path.endsWith('.ts') ? ['--import','tsx'] : [], stdio: ['ignore','ignore','ignore','ipc'], serialization: 'json', env: process.env }); }
      catch { reject(new Error('Worker 启动失败。')); return; }
      let done = false, outcome: { candidate?: TextProposal; error?: Error } | undefined;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const timer = setTimeout(() => stop({ error: new ArkRequestError('timeout') }), options.timeoutMs ?? ARK_TIMEOUT_MS + 10000);
      const abort = () => stop({ error: new ArkRequestError('cancelled') });
      const complete = () => {
        if (done) return; done = true; clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', abort);
        child.removeAllListeners('message'); child.removeAllListeners('exit'); child.removeAllListeners('error');
        if (outcome?.candidate) resolve(outcome.candidate); else reject(outcome?.error ?? new Error('Worker 意外退出。'));
      };
      const stop = (result: NonNullable<typeof outcome>) => {
        if (done || outcome) return; outcome = result;
        if (child.exitCode !== null || child.signalCode !== null) { complete(); return; }
        child.kill('SIGTERM');
        killTimer = setTimeout(() => { if (!done) child.kill('SIGKILL'); }, options.killGraceMs ?? 1000);
      };
      child.on('error', () => { outcome = outcome ?? { error: new Error('Worker 执行失败。') }; if (!child.pid) complete(); else stopAfterError(); });
      const stopAfterError = () => { child.kill('SIGTERM'); killTimer ??= setTimeout(() => { if (!done) child.kill('SIGKILL'); }, options.killGraceMs ?? 1000); };
      child.once('exit', complete);
      child.on('message', (value: unknown) => {
        if (done || outcome) return;
        try {
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
          const message = value as Record<string, unknown>;
          if (message.type === 'candidate' && Object.keys(message).length === 2) {
            const raw = message.candidate as TextProposal;
            if (!raw || raw.baseId !== input.version.id || raw.baseSource !== input.version.source || raw.targetId !== input.targetId) throw new Error();
            const candidate = buildCandidate(input.version, input.targetId, raw.after);
            if (candidate.before !== raw.before) throw new Error();
            stop({ candidate }); return;
          }
          if (message.type === 'failure' && Object.keys(message).every(key => ['type','failureCode','providerStatus'].includes(key))) {
            if (message.failureCode === 'execution') { stop({ error: new Error('Worker 执行失败。') }); return; }
            if (!codes.includes(message.failureCode as typeof codes[number])) throw new Error();
            const code = message.failureCode as typeof codes[number];
            const status = code === 'provider' && typeof message.providerStatus === 'number' && Number.isInteger(message.providerStatus) && message.providerStatus >= 100 && message.providerStatus <= 599 ? message.providerStatus : undefined;
            stop({ error: new ArkRequestError(code, status) }); return;
          }
          throw new Error();
        } catch { stop({ error: new ArkRequestError('invalid_output') }); }
      });
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      try { child.send({ type: 'edit', request: input }, error => { if (error) stop({ error: new Error('Worker 通信失败。') }); }); }
      catch { stop({ error: new Error('Worker 通信失败。') }); }
    });
  };
}
export const runInWorker = createWorkerExecutor();
