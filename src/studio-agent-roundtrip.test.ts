import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { applyProposal, createStructure, proposeText, type Brief } from './studio-model';
import { inspectHtml, patchText } from './html';
import { inspectSlides } from './slides';
import { htmlExportBlob, htmlExportName } from './html-export';
import { readDocumentFile } from './document-import';
import { listDocuments, saveDocument, type DocumentRecord } from './store';

// Authored fixtures and local candidate generation; no model or native download is simulated as successful.
const cases: { scenario: string; brief: Brief; replacement: string }[] = [
  { scenario: '企业提案', brief: { title: '企业服务交接试点', audience: '业务负责人', goal: '确认四周试点范围', materials: '现有流程与访谈摘要' }, replacement: '四周试点：验证效率与交付质量' },
  { scenario: '课程创作', brief: { title: '信息判断课', audience: '初中学生', goal: '学会辨别信息来源', materials: '课堂案例与活动记录' }, replacement: '信息判断：从观点走向证据' },
];
const timestamp = '2026-09-28T00:00:00.000Z';

describe('Studio candidate → version → export file → independent import', () => {
  it.each(cases)('$scenario preserves edited source and the original document through a file roundtrip', async ({ brief, replacement }) => {
    const source = createStructure(brief, [brief.title, '目标与受众', '已有材料']);
    const original: DocumentRecord = {
      id: crypto.randomUUID(), name: `${brief.title}.html`,
      versions: [{ id: crypto.randomUUID(), label: '结构草稿', source, createdAt: timestamp }],
    };
    await saveDocument(original);
    const v1 = original.versions[0]!;
    const material = inspectHtml(source).targets.find(t => t.text === brief.materials)!;
    const manualText = '人工核实：A & B <示例>，保留这条依据。';
    const manuallyEdited = patchText(source, material, manualText);
    const working = { id: crypto.randomUUID(), label: '人工编辑后', source: manuallyEdited, createdAt: timestamp };
    const title = inspectHtml(manuallyEdited).targets.find(t => t.tag === 'h1')!;
    const candidate = proposeText(working, title.id, replacement);
    expect(working.source).toBe(manuallyEdited);
    expect((await listDocuments()).find(d => d.id === original.id)).toEqual(original);
    const edited = applyProposal(working, candidate);
    expect(edited).toBe(manuallyEdited.replace(`<h1>${brief.title}</h1>`, `<h1>${replacement}</h1>`));
    const saved = { ...original, versions: [...original.versions, { ...working, source: edited, label: '已接受候选' }] };
    await saveDocument(saved, v1.id);
    const reopened = (await listDocuments()).find(d => d.id === original.id)!;
    expect(reopened).toEqual(saved);
    expect(reopened.versions[0]!.source).toBe(source);

    // Exercises the same Blob and file-reading APIs as export/import, not an OS download.
    const blob = htmlExportBlob(reopened.versions.at(-1)!.source);
    const file = new File([blob], htmlExportName(original.name), { type: blob.type });
    const imported = await readDocumentFile(file);
    expect(imported.source).toBe(edited);
    expect(imported.bytes).toBe(new TextEncoder().encode(edited).byteLength);
    expect(imported.name).toBe(`${brief.title}-edited.html`);
    const independent: DocumentRecord = {
      id: crypto.randomUUID(), name: imported.name,
      versions: [{ id: crypto.randomUUID(), label: '重新导入', source: imported.source, createdAt: timestamp }],
    };
    await saveDocument(independent);
    const records = await listDocuments();
    const reimported = records.find(d => d.id === independent.id)!;
    expect(reimported).toEqual(independent);
    expect(records.find(d => d.id === original.id)).toEqual(saved);
    expect(reimported.id).not.toBe(original.id);
    const finalSource = reimported.versions[0]!.source;
    expect(inspectSlides(finalSource).map(page => page.title)).toEqual([replacement, '目标与受众', '已有材料']);
    expect(inspectHtml(finalSource).targets.find(t => t.tag === 'h1')!.text).toBe(replacement);
    expect(inspectHtml(finalSource).targets.some(t => t.text === manualText)).toBe(true);
    expect(finalSource).not.toMatch(/data-doc-object|data-doc-slide|contenteditable|Content-Security-Policy/);
  });
});
