import { afterEach, describe, expect, it, vi } from 'vitest';
import { agentJobRequest, validateJobCandidate, waitAgentJob } from './studio-agent-client';
const version={id:'v1',source:'<h1>old</h1>',label:'test'};
const candidate={baseId:'v1',baseSource:version.source,targetId:'t',before:'old',after:'new'};
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('recoverable agent client',()=>{
 it('rejects recovered candidate after document changes',()=>{expect(()=>validateJobCandidate({id:'job',status:'candidate',candidate},{...version,id:'v2'})).toThrow('草稿版本已变化');});
 it('does not treat interrupted run as candidate',()=>{expect(()=>validateJobCandidate({id:'job',status:'interrupted'},version)).toThrow('服务重启');});
 it('recovers an unchanged candidate without applying it',()=>{expect(validateJobCandidate({id:'job',status:'candidate',candidate},version)).toEqual(candidate);expect(version.source).toContain('old');});
 it('rejects unknown status and hides server error body',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({secret:'private'}),{status:500})));
  await expect(agentJobRequest('query',{id:'x'})).rejects.toThrow('生成任务操作失败');
 });
 it('returns terminal record from query without extra model generation',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({job:{id:'x',status:'candidate',candidate}})));
  vi.stubGlobal('fetch',fetcher);
  expect((await waitAgentJob('x',new AbortController().signal)).status).toBe('candidate');
  expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0]?.[0]).toBe('/api/studio-agent/jobs/query');
 });
});

describe('queued agent client polling',()=>{
 it('polls queued then running then candidate without another start',async()=>{
  vi.useFakeTimers();
  const fetcher=vi.fn();
  for(const status of ['queued','running','candidate'])fetcher.mockResolvedValueOnce(new Response(JSON.stringify({job:{id:'queue-job',status,...(status==='candidate'?{candidate}:{})}})));
  vi.stubGlobal('fetch',fetcher);
  const pending=waitAgentJob('queue-job',new AbortController().signal);
  await vi.runAllTimersAsync();
  expect((await pending).status).toBe('candidate');
  expect(fetcher).toHaveBeenCalledTimes(3);
  for(const [url,options] of fetcher.mock.calls){expect(url).toBe('/api/studio-agent/jobs/query');expect(JSON.parse(options.body)).toEqual({id:'queue-job'});}
 });
 it('aborts a queued wait and never submits another request',async()=>{
  vi.useFakeTimers();
  const fetcher=vi.fn().mockImplementation(async()=>new Response(JSON.stringify({job:{id:'queue-job',status:'queued'}})));
  vi.stubGlobal('fetch',fetcher);
  const controller=new AbortController();
  const pending=waitAgentJob('queue-job',controller.signal);
  const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});
  await vi.advanceTimersByTimeAsync(0);
  expect(fetcher).toHaveBeenCalledTimes(1);
  controller.abort();
  await rejected;
  await vi.runAllTimersAsync();
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
});
