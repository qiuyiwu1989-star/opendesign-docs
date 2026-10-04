import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { applyWorkspaceChange, objectPreviewPage } from './studio-workspace-model';
import { historyOf, moveHistory } from './history';
import { inspectDocumentObjects } from './document-objects';
import { patchDocumentGeometry } from './document-geometry';
import { applyProposal, proposeText, type StudioDraft } from './studio-model';
import { inspectHtml } from './html';
import { listStudioTasks, saveStudioTask } from './studio-store';

const source = `<!doctype html><main><!-- keep exact --><div style='position:absolute;left:10px;top:20px;width:300px;height:200px'>标题</div><p data-original='yes'>正文保持文档流</p></main>`;
const patched = () => patchDocumentGeometry(source, inspectDocumentObjects(source)[0]!.objects.find(o => o.tag === 'div')!, { x: 30, y: 20, width: 300, height: 200 });
describe('Studio shared object editing session', () => {
  it('keeps unedited source byte-for-byte and supports undo/redo without conversion', () => {
    const next = applyWorkspaceChange(historyOf(source), source, patched());
    expect(next.present).toBe(source.replace('left:10px', 'left:30px'));
    const undone = moveHistory(next, 'undo');
    expect(undone.present).toBe(source);
    expect(moveHistory(undone, 'redo').present).toBe(next.present);
    expect(() => applyWorkspaceChange(next, source, patched())).toThrow('作品已变化');
  });
  it('rejects oversized edits before they enter unsavable history', () => {
    expect(() => applyWorkspaceChange(historyOf(source), source, 'x'.repeat(200001))).toThrow('200000');
  });
  it('persists a Studio version, rejects stale AI and prevents a second window overwriting it', async () => {
    const version = { id: crypto.randomUUID(), source, label: '初稿' };
    const draft: StudioDraft = { brief: { title: '课程', audience: '学生', goal: '学习', materials: '' }, outline: [], versions: [version] };
    const task = await saveStudioTask(crypto.randomUUID(), draft, 0);
    const candidate = proposeText(version, inspectHtml(source).targets.find(t => t.text === '标题')!.id, '新标题');
    const savedVersion = { id: crypto.randomUUID(), source: patched(), label: '对象排版修改' };
    await saveStudioTask(task.id, { ...draft, versions: [version, savedVersion] }, task.revision);
    expect(() => applyProposal(savedVersion, candidate)).toThrow('草稿版本已变化');
    await expect(saveStudioTask(task.id, draft, task.revision)).rejects.toThrow();
    expect((await listStudioTasks()).find(t => t.id === task.id)!.draft.versions).toEqual([version, savedVersion]);
  });
});

it('maps document object offsets to the correct slide without assuming shared IDs', () => {
  const html = '<section class="slide"><h1>First</h1></section><section class="slide"><h2>Second</h2><img src="x"></section>';
  const objects = inspectDocumentObjects(html)[0]!.objects;
  expect(objectPreviewPage(html, objects.find(o => o.tag === 'h2')!.id)).toBe('page-1');
  expect(objectPreviewPage(html, objects.find(o => o.tag === 'img')!.id)).toBe('page-1');
  expect(objectPreviewPage(html, objects.filter(o => o.tag === 'section')[1]!.id)).toBe('page-1');
  expect(objectPreviewPage(html, 'missing')).toBeUndefined();
  const long = '<main><p>Flow</p></main>';
  expect(objectPreviewPage(long, inspectDocumentObjects(long)[0]!.objects[0]!.id)).toBeUndefined();
});
