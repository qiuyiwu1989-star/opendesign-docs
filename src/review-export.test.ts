import { describe, expect, it } from "vitest";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { Script } from "node:vm";
import { reviewExportHtml } from "./review-export";
import { inspectHtml } from "./html";
import { addThread, reviewMessage, type ReviewRecord } from "./review";

const source = '<h1>Original title</h1><script>PRIVATE_SCRIPT()</script><img src="https://example.com/private.png">';
const anchor = { kind: 'text' as const, id: inspectHtml(source).targets[0]!.id, quote: 'Original title' };
function nodes(node: DefaultTreeAdapterMap['node']): DefaultTreeAdapterMap['element'][] {
  return [...('tagName' in node ? [node] : []), ...('childNodes' in node ? node.childNodes.flatMap(nodes) : [])];
}
describe('review snapshot', () => {
  it('exports only the selected saved version and its saved threads as a safe standalone viewer', () => {
    let review: ReviewRecord = {id:'doc', revision:0, threads:[]};
    review = addThread(review, 'old', anchor, reviewMessage('Reviewer', '</script><img onerror="bad()">'));
    review = addThread(review, 'new', anchor, reviewMessage('Other', 'NOT_THIS_VERSION'));
    const html = reviewExportHtml('File </title>', {id:'old', label:'Version 1', source}, review);
    expect(html).not.toContain('NOT_THIS_VERSION');
    expect(html).not.toContain('PRIVATE_SCRIPT');
    expect(html).not.toContain('https://example.com');
    expect(html).toContain('File &lt;/title&gt;');
    expect(html).toContain('\\u003c/script>');
    expect(html).toContain('Copyright (c) 2026 The Bento authors');
    const all = nodes(parse(html));
    const scripts = all.filter(n => n.tagName === 'script');
    expect(scripts).toHaveLength(1);
    new Script(scripts[0]!.childNodes.map(n => 'value' in n ? n.value : '').join(''));
    const frame = all.find(n => n.tagName === 'iframe')!;
    expect(frame.attrs.find(a => a.name === 'sandbox')!.value).toBe('allow-scripts');
    const inside = frame.attrs.find(a => a.name === 'srcdoc')!.value;
    expect(inside).toContain('Original title');
    expect(inside).not.toContain('PRIVATE_SCRIPT');
    expect(inside).toContain("connect-src 'none'");
    expect(inside).not.toContain('cursor:crosshair');
    expect(inside).toContain('const annotating = reviewing && false');
  });
  it('rejects invalid anchors instead of exporting misleading positions', () => {
    const review = addThread({id:'doc', revision:0, threads:[]}, 'v', {...anchor, quote:'changed'}, reviewMessage('R','comment'));
    expect(() => reviewExportHtml('file', {id:'v', label:'v1', source}, review)).toThrow('文字已变化');
  });
});
