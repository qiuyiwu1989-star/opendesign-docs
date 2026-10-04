import 'fake-indexeddb/auto';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { recoverCloudProject } from './studio-cloud-recovery';
import { readRemoteRecord, saveRemoteRecord, type RemoteProject } from './studio-remote-store';
import { listStudioTasks, saveStudioTask } from './studio-store';
import { proposeText } from './studio-model';
import { inspectHtml } from './html';
const makeProject = (): RemoteProject => {
  const source = '<h1>课程方案</h1><p>保留正文</p>', id = crypto.randomUUID();
  return { id: crypto.randomUUID(), headRevision:id, revisions:[{id,parentId:null,source,sourceHash:createHash('sha256').update(source).digest('hex'),createdAt:new Date().toISOString()}] };
};
describe('cloud rediscovery preserves local journals', () => {
  it('reopens the same project without creating a local draft or duplicate cache', async () => {
    const project=makeProject(), before=await listStudioTasks();
    const first=await recoverCloudProject(project), again=await recoverCloudProject(project);
    expect(again.id).toBe(first.id);
    expect((await readRemoteRecord(first.id))?.project).toEqual(project);
    expect(await listStudioTasks()).toEqual(before);
  });
  it('keeps the original pending save journal and original local draft',async()=>{
    const project=makeProject(), taskId=crypto.randomUUID(), base=project.revisions[0]!;
    const local=await saveStudioTask(taskId,{brief:{title:'本地原稿',audience:'',goal:'',materials:''},outline:[],versions:[{id:base.id,source:base.source,label:'原稿'}]},0);
    const old=await saveRemoteRecord({taskId,projectId:project.id,project,pending:{kind:'save',id:crypto.randomUUID(),baseRevision:base.id,source:'<h1>待恢复保存</h1>'},candidate:null},0);
    expect((await recoverCloudProject(project)).id).toBe(taskId);
    expect(await readRemoteRecord(taskId)).toEqual(old);
    expect((await listStudioTasks()).find(t=>t.id===taskId)).toEqual(local);
  });
  it('retains a matching candidate but discards an outdated candidate after an authorized refresh',async()=>{
    const project=makeProject(), taskId=crypto.randomUUID(), base=project.revisions[0]!;
    const candidate={jobId:crypto.randomUUID(),proposal:proposeText({...base,label:''},inspectHtml(base.source).targets[0]!.id,'新的标题')};
    await saveRemoteRecord({taskId,projectId:project.id,project,pending:null,candidate},0);
    await recoverCloudProject(project);
    expect((await readRemoteRecord(taskId))?.candidate).toEqual(candidate);
    const source='<h1>其他窗口的新版本</h1>', id=crypto.randomUUID();
    await recoverCloudProject({...project,headRevision:id,revisions:[...project.revisions,{id,parentId:base.id,source,sourceHash:createHash('sha256').update(source).digest('hex'),createdAt:new Date().toISOString()}]});
    expect((await readRemoteRecord(taskId))?.candidate).toBeNull();
  });
});
