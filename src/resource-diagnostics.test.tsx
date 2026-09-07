import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cssReferences, inspectResources, replaceResourceImage } from "./resource-diagnostics";
import { ResourcePanelBody as ResourcePanel } from "./ResourcePanelBody";
import { createPreview } from "./html";
import { historyOf, editHistory, moveHistory } from "./history";
import { saveDocument, listDocuments } from "./store";
import { MAX_DOCUMENT_BYTES } from "./slide-insert";

const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5mQAAAAASUVORK5CYII=";
const image = { dataUrl, width: 1, height: 1, alt: "local.png" };
const imageOffset = (source: string) => inspectResources(source).find(i => i.imageOffset !== undefined)!.imageOffset!;

describe("spec023 resource diagnostics", () => {
  it("distinguishes isolated remote refs from unpackaged local paths without claiming network failure", () => {
    const issues = inspectResources(`<img alt="封面" src="https://example.test/a.png"><img src="assets/b.png"><img><img src="${dataUrl}">`);
    expect(issues.map(i => i.reason)).toEqual(["预览不加载外部资源", "本地路径未随 HTML 导入", "未提供资源地址"]);
    expect(issues[0]!.label).toBe("封面");
    expect(issues.every(i => i.imageOffset !== undefined)).toBe(true);
  });
  it("finds font face, CSS URL, imports and linked stylesheets without reading comments or ordinary strings", () => {
    const source = `<link rel="alternate stylesheet" href="/theme.css"><style>
      /* url(ignored.png) */ @import 'https://example.test/fonts.css';
      @font-face {font-family: Test; src: url('/fonts/local.woff2') format('woff2');}
      .a {content:'url(ignored.png)';background: URL(https://example.test/bg.png)}
      </style><div style="background:url(./inline.png)"></div>`;
    expect(inspectResources(source).map(i => i.kind)).toEqual(["样式", "样式", "字体", "CSS 资源", "CSS 资源"]);
    expect(inspectResources(source).some(i => i.label.includes("ignored"))).toBe(false);
  });
  it("handles quoted URLs, parentheses, escapes and nested font-face scope", () => {
    expect(cssReferences(`@media screen {@font-face {src:url('f\\6f nt.woff2')}} .a{background:url("a(b).png")} @import url('x.css');`))
      .toEqual([{ url: "font.woff2", font: true, stylesheet: false }, { url: "a(b).png", font: false, stylesheet: false }, { url: "x.css", font: false, stylesheet: true }]);
  });
  it("ignores inert script/template/svg content and groups supported picture separately from standalone IMG", () => {
    const source = `<script>"<img src='secret'>"</script><template><img src="secret"></template><svg><image href="secret"/></svg><picture><source srcset="x.png 2x"><img src="fallback.png"></picture>`;
    const issues = inspectResources(source);
    expect(issues).toHaveLength(1);
    expect(issues.every(i => i.imageOffset === undefined)).toBe(true);
    expect(issues[0]!.pictureOffset).toBe(source.indexOf('<picture>'));
    expect(() => replaceResourceImage(source, source.indexOf('<img src="fallback'), image)).toThrow();
  });
  it("reports responsive candidates even with an embedded fallback and bounds embedded labels", () => {
    expect(inspectResources(`<img src="${dataUrl}" srcset="a.png 2x">`)[0]!.reason).toBe("响应式候选未验证");
    expect(inspectResources(`<img src="${dataUrl}" srcset="a.png 2x">`)[0]!.label).toBe("内嵌图片");
    expect(inspectResources(`<img src="data:image/svg+xml,abc">`)[0]!.label).toBe("内嵌资源");
    expect(inspectResources(`<style>.a{background:url('data:image/svg+xml,abc')}</style>`)[0]!.reason).toBe("内嵌 CSS 资源未验证");
  });
  it("replaces only the target source and candidates while preserving layout and unrelated exact bytes", () => {
    const prefix = `<!doctype html><!-- unchanged --><style>.x{color:red}</style>`;
    const tag = `<IMG width='240' height="180" style="object-fit:cover" src='old.png' srcset="old2.png 2x" alt="Keep">`;
    const suffix = `<script>const source='old.png'</script><p>old.png</p>`;
    const source = prefix + tag + suffix;
    const next = replaceResourceImage(source, imageOffset(source), image);
    expect(next.startsWith(prefix)).toBe(true);
    expect(next.endsWith(suffix)).toBe(true);
    expect(next).toContain(`width='240' height="180" style="object-fit:cover"`);
    expect(next).toContain(`alt="Keep"`);
    expect(next).not.toContain('srcset=');
    expect(next).toContain(`src="${dataUrl}"`);
    expect(inspectResources(next)).toEqual([]);
    expect(createPreview(next, "resource-test-channel", false)).toContain(dataUrl);
    expect(createPreview(next, "resource-test-channel", false)).not.toContain("const source=");
  });
  it("supports absent src and self-closing syntax, rejects duplicate attrs and stale offsets", () => {
    const original = `<p>keep</p><img alt="Empty" />`;
    const next = replaceResourceImage(original, imageOffset(original), image);
    expect(next).toContain('alt="Empty" />');
    expect(() => replaceResourceImage(original, 0, image)).toThrow("变化");
    const duplicate = `<img src="one" SRC="two">`;
    expect(() => replaceResourceImage(duplicate, 0, image)).toThrow("重复");
  });
  it("enforces valid bitmap and final document size at the mutation boundary", () => {
    expect(() => replaceResourceImage('<img>', 0, { ...image, dataUrl: 'data:image/svg+xml,evil' })).toThrow();
    const large = '<img>' + ' '.repeat(MAX_DOCUMENT_BYTES - 5);
    expect(() => replaceResourceImage(large, 0, image)).toThrow("5 MiB");
  });
  it("keeps repair undoable and persists exact source as a distinct saved version", async () => {
    const source = '<img src="cover.png" width="80"><p>Keep</p>';
    const next = replaceResourceImage(source, 0, image);
    const history = editHistory(historyOf(source), next);
    expect(moveHistory(history, 'undo').present).toBe(source);
    expect(moveHistory(moveHistory(history, 'undo'), 'redo').present).toBe(next);
    const record = { id: crypto.randomUUID(), name: "Resource QA.html", versions: [{ id: crypto.randomUUID(), source, createdAt: new Date().toISOString(), label: 'Original' }] };
    await saveDocument(record);
    await saveDocument({ ...record, versions: [...record.versions, { id: crypto.randomUUID(), source: next, createdAt: new Date().toISOString(), label: 'Repaired' }] }, record.versions[0]!.id);
    expect((await listDocuments()).find(d => d.id === record.id)!.versions.map(v => v.source)).toEqual([source, next]);
  });
  it("keeps the panel collapsed, bounded, non-networking and read-only when disabled", () => {
    const html = renderToStaticMarkup(<ResourcePanel source={'<img src="missing.png">'.repeat(32)} contextKey="test" disabled onApply={() => { throw new Error('must not write'); }} />);
    expect(html).not.toContain('<details open');
    expect(html).toContain('共 32 项');
    expect(html.match(/选本机图片/g)).toHaveLength(30);
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('href=');
  });
});
