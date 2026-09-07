import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { fontResultIsCurrent, inspectFontHeader, MAX_FONT_BYTES, prepareLocalFont } from "./font-import";
import { inspectFontTargets, replaceFontSource } from "./font-repair";
import { ResourcePanel } from "./ResourcePanel";
import { inspectResources } from "./resource-diagnostics";
import { createPreview } from "./html";
import { editHistory, historyOf, moveHistory } from "./history";
import { MAX_DOCUMENT_BYTES } from "./slide-insert";
import { exportProjectBackup, listDocuments, restoreProjectBackup, saveDocument } from "./store";

// Only a structural header fixture; mocked FontFace supplies the decoder gate.
function header(format = 'woff2') {
  const bytes = new Uint8Array(80), view = new DataView(bytes.buffer);
  view.setUint32(0, format === 'woff2' ? 0x774f4632 : 0x774f4646);
  view.setUint32(4, 0x10000); view.setUint32(8, 80); view.setUint16(12, 1); view.setUint32(16, 44);
  if (format === 'woff2') view.setUint32(20, 16);
  else { view.setUint32(48, 64); view.setUint32(52, 16); view.setUint32(56, 16); }
  return bytes;
}
const file = (bytes = header(), name = 'sample.woff2') => new File([bytes as Uint8Array<ArrayBuffer>], name);
function decoder(load: () => Promise<unknown> = () => Promise.resolve()) {
  const mock = vi.fn(load);
  vi.stubGlobal('FontFace', class { load = mock; });
  return mock;
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const source = `<!doctype html><style>/* intact */ @font-face {font-family: 'Demo'; font-style: italic; font-weight: 600; src: url('https://example.test/font.woff2') format('woff2'); font-display: swap; unicode-range: U+0-FF;} p{font-family:'Demo';color:red}</style><p>Keep</p><script>const x='src: url(x)'</script>`;

describe('spec024 local font repair', () => {
  it('rejects late results after context, source, permission or editing state changes', async () => {
    let finish!: () => void;
    decoder(() => new Promise<void>(resolve => { finish = resolve; }));
    const captured = { source: 'before', epoch: 1 };
    const pending = prepareLocalFont(file());
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    finish(); await pending;
    const current = { ...captured, disabled: false, fontRights: true };
    expect(fontResultIsCurrent(captured, current)).toBe(true);
    for (const changed of [{ epoch: 2 }, { source: 'after' }, { disabled: true }, { fontRights: false }])
      expect(fontResultIsCurrent(captured, { ...current, ...changed })).toBe(false);
  });
  it('checks both supported signatures before the browser decode gate', async () => {
    const load = decoder();
    for (const format of ['woff', 'woff2']) {
      expect(inspectFontHeader(header(format))).toBe(format);
      const font = await prepareLocalFont(file(header(format), `sample.${format}`));
      expect(font.dataUrl).toMatch(new RegExp(`^data:font/${format};base64,`));
      expect(Object.isFrozen(font)).toBe(true);
    }
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('rejects extension mismatch, incomplete headers, collections, inflated sizes and out-of-bounds blocks', async () => {
    const load = decoder();
    await expect(prepareLocalFont(file(header(), 'font.ttf'))).rejects.toThrow();
    await expect(prepareLocalFont(file(header(), 'font.woff'))).rejects.toThrow('不一致');
    await expect(prepareLocalFont(file(new Uint8Array(MAX_FONT_BYTES + 1)))).rejects.toThrow('2 MiB');
    expect(() => inspectFontHeader(new Uint8Array(8))).toThrow();
    for (const [offset, value] of [[0, 0], [4, 0x74746366], [8, 79], [16, 16 * 1024 * 1024], [20, 81], [28, 79], [36, 16 * 1024 * 1024]]) {
      const bytes = header(); new DataView(bytes.buffer).setUint32(offset!, value!);
      expect(() => inspectFontHeader(bytes)).toThrow();
    }
    expect(load).not.toHaveBeenCalled();
  });
  it('rejects decoder failures, missing FontFace and timeouts without applying source', async () => {
    decoder(() => Promise.reject(new Error('bad font')));
    await expect(prepareLocalFont(file())).rejects.toThrow('无法解码');
    vi.stubGlobal('FontFace', undefined);
    await expect(prepareLocalFont(file())).rejects.toThrow('无法验证');
    vi.useFakeTimers(); decoder(() => new Promise(() => {}));
    const pending = expect(prepareLocalFont(file())).rejects.toThrow('超时');
    await vi.advanceTimersByTimeAsync(15001); await pending;
  });
  it('finds top-level font faces and preserves all descriptors and unrelated source exactly', async () => {
    decoder();
    const target = inspectFontTargets(source)[0]!;
    expect(target).toMatchObject({ family: 'Demo', weight: '600', style: 'italic', embedded: false });
    const font = await prepareLocalFont(file());
    const next = replaceFontSource(source, target, font);
    expect(next.slice(0, target.start)).toBe(source.slice(0, target.start));
    expect(next.endsWith(source.slice(target.end))).toBe(true);
    expect(next).toContain(`font-weight: 600`);
    expect(next).toContain(`unicode-range: U+0-FF`);
    expect(inspectFontTargets(next)[0]!.embedded).toBe(true);
    expect(inspectResources(next).filter(i => i.kind === '字体')).toEqual([]);
    expect(createPreview(next, 'font-check-channel', false)).toContain(font.dataUrl);
    expect(createPreview(next, 'font-check-channel', false)).not.toContain("const x=");
    const history = editHistory(historyOf(source), next);
    expect(moveHistory(history, 'undo').present).toBe(source);
    expect(moveHistory(moveHistory(history, 'undo'), 'redo').present).toBe(next);
  });
  it('ignores fake rules in strings/comments/inert nodes and excludes nested/ambiguous/escaped declarations', () => {
    const rule = `@font-face{font-family:Demo;src:url(x)}`;
    for (const css of [`/* ${rule} */`, `p{content:"${rule}"}`, `@media screen {${rule}}`, rule.replace('src:', 'src:url(y);src:'), rule.replace('font-family', 'font-\\66 amily'), rule.slice(0,-1), rule.replace('font-family:Demo', 'font-family:var(--family)')])
      expect(inspectFontTargets(`<style>${css}</style>`)).toEqual([]);
    expect(inspectFontTargets(`<template><style>${rule}</style></template><script>'${rule}'</script><svg><style>${rule}</style></svg>`)).toEqual([]);
  });
  it('does not split quoted semicolons or braces into editable descriptors', () => {
    const input = `<style>@font-face{font-family:'Demo';src:url('x;y{z}.woff2');}</style>`;
    expect(inspectFontTargets(input)).toHaveLength(1);
    expect(inspectFontTargets(input)[0]!.raw).toBe("url('x;y{z}.woff2')");
  });
  it('rejects unverified forged fonts, stale spans and oversized final documents', async () => {
    decoder(); const font = await prepareLocalFont(file());
    const target = inspectFontTargets(source)[0]!;
    expect(() => replaceFontSource(source, target, { ...font })).toThrow('重新选择');
    expect(() => replaceFontSource(source.replace('Demo', 'Other'), target, font)).toThrow('变化');
    const large = source + ' '.repeat(MAX_DOCUMENT_BYTES - new TextEncoder().encode(source).byteLength);
    expect(() => replaceFontSource(large, target, font)).toThrow('5 MiB');
  });
  it('requires explicit embedding acknowledgment and never renders remote font links', () => {
    const html = renderToStaticMarkup(<ResourcePanel source={source} disabled={false} contextKey="v1" onApply={() => { throw new Error('write'); }} />);
    expect(html).toContain('我有权在此文档中嵌入该字体');
    expect(html).toContain('aria-label="替换字体：Demo"');
    expect(html).toMatch(/<button disabled="" aria-label="替换字体：Demo"/);
    expect(html).not.toContain('href=');
    expect(html).not.toContain('checked=""');
  });
  it('preserves embedded bytes through saved versions and project backup restore', async () => {
    decoder();
    const font = await prepareLocalFont(file());
    const next = replaceFontSource(source, inspectFontTargets(source)[0]!, font);
    const id = crypto.randomUUID();
    const record = { id, name: 'Font QA.html', versions: [
      { id: crypto.randomUUID(), source, label: 'Original', createdAt: new Date().toISOString() },
      { id: crypto.randomUUID(), source: next, label: 'Local font', createdAt: new Date().toISOString() },
    ] };
    await saveDocument(record);
    const backup = await exportProjectBackup(id);
    const restored = await restoreProjectBackup(backup);
    expect(restored.id).not.toBe(id);
    expect(restored.versions.map(v=>v.source)).toEqual([source, next]);
    expect((await listDocuments()).find(d=>d.id===restored.id)!.versions[1]!.source).toContain(font.dataUrl);
  });
});
