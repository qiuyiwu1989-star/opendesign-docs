import { describe, it, expect } from 'vitest';
import { inspectHtml } from '../../src/html';
import { applyProposal } from '../../src/studio-model';
import { runTextEdit, type ModelRequest } from './run';
const version = { id: 'v1', label: 'test', source: '<h1>原始标题</h1><p>保留内容</p>' };
const targetId = inspectHtml(version.source).targets[0]!.id;
const request = { version, targetId, instruction: '改得清晰一些' };
const config = { apiKey: 'test-only' };
const model = (output: unknown[]): ModelRequest => async () => ({ output });
const call = (args: unknown, name = 'propose_text') => ({ type: 'function_call', name, arguments: JSON.stringify(args) });
describe('bounded text agent', () => {
  it('creates candidate without changing source; applies through existing revision checks', async () => {
    const result = await runTextEdit(request, config, undefined, model([call({ after: '明确的标题' })]));
    expect(version.source).toContain('原始标题');
    expect(applyProposal(version, result)).toBe('<h1>明确的标题</h1><p>保留内容</p>');
    expect(() => applyProposal({ ...version, id: 'v2' }, result)).toThrow();
  });
  it.each([[call({ after: '修改', targetId: 'other' })], [call({ after: '修改' }, 'apply_patch')], [call({ after: '修改' }), call({ after: '更多' })], []])('rejects malformed or out of scope output %#', async (...output) => {
    await expect(runTextEdit(request, config, undefined, model(output))).rejects.toThrow();
  });
  it('does not invoke provider on invalid selection', async () => {
    let invoked = false;
    await expect(runTextEdit({ ...request, targetId: 'missing' }, config, undefined, async () => { invoked = true; return { output: [] }; })).rejects.toThrow();
    expect(invoked).toBe(false);
  });
  it('honors cancellation before model work', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(runTextEdit(request, config, controller.signal, model([]))).rejects.toThrow();
  });
});
