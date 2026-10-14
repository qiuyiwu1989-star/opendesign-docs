import {describe, expect, it} from 'vitest';
import {confirmIntent, confirmOutline, defaultBrief, projectStage, updateBrief, validateBrief} from './thinking-project';

const now = '2026-10-13T12:00:00.000Z';
const ready = () => confirmOutline(confirmIntent(updateBrief(defaultBrief(), {
  intent: '说明人如何学习与成长', requirements: '保留原顺序和原意', outline: '1. 个人 AGI\n2. 学习与成长',
}), now), now);

describe('project intent and outline agreement', () => {
  it('requires explicit agreement in order and survives JSON persistence', () => {
    const initial = defaultBrief();
    expect(projectStage(initial)).toBe('intent');
    expect(() => confirmIntent(initial)).toThrow();
    const written = updateBrief(initial, {intent: '学习', requirements: '忠实原稿', outline: '第一页'});
    expect(() => confirmOutline(written)).toThrow();
    const agreed = confirmIntent(written, now);
    expect(projectStage(agreed)).toBe('outline');
    const final = JSON.parse(JSON.stringify(confirmOutline(agreed, now)));
    expect(validateBrief(final)).toBe(true);
    expect(projectStage(final)).toBe('ready');
    expect(initial.intent).toBe('');
  });

  it('invalidates dependent agreements while preserving the draft and linked document', () => {
    const original = updateBrief(ready(), {outlineDocumentId: 'doc-1', linkedDocumentIds: ['doc-1']});
    const changed = updateBrief(original, {requirements: '允许轻度整理'});
    expect(projectStage(changed)).toBe('intent');
    expect(changed.intentConfirmedAt).toBeUndefined();
    expect(changed.outlineConfirmedAt).toBeUndefined();
    expect(changed.outline).toBe(original.outline);
    expect(changed.outlineDocumentId).toBe('doc-1');
    expect(projectStage(original)).toBe('ready');
    const revisedOutline = updateBrief(original, {outline: '新提纲'});
    expect(projectStage(revisedOutline)).toBe('outline');
    expect(revisedOutline.intentConfirmedAt).toBe(now);
    expect(projectStage(updateBrief(original, {intent: original.intent}))).toBe('ready');
  });

  it('rejects incomplete or corrupt saved approvals', () => {
    expect(validateBrief({...ready(), intent: ' '})).toBe(false);
    expect(validateBrief({...ready(), intentConfirmedAt: undefined})).toBe(false);
    expect(validateBrief({...ready(), outlineConfirmedAt: 'not a date'})).toBe(false);
    expect(validateBrief({...ready(), linkedDocumentIds: [3]})).toBe(false);
    expect(validateBrief({...ready(), outlineDocumentId: ''})).toBe(false);
    expect(() => confirmOutline(confirmIntent(updateBrief(defaultBrief(), {intent: 'x', requirements: 'y'})))).toThrow();
  });
});
