import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { inspectPictureTargets, replacePictureImage } from "./responsive-image";
import { inspectResources } from "./resource-diagnostics";
import { ResourcePanelBody as ResourcePanel } from "./ResourcePanelBody";
import { createPreview } from "./html";
import { historyOf, editHistory, moveHistory } from "./history";
import { saveDocument, listDocuments, exportProjectBackup } from "./store";
import { parseProjectBackup, serializeProjectBackup } from "./project-backup";
import { MAX_DOCUMENT_BYTES } from "./slide-insert";
import { imageRepairIsCurrent } from "./image-import";

const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5mQAAAAASUVORK5CYII=";
const image = { dataUrl, width: 1, height: 1, alt: "local.png" };
const picture = `<picture class='cover'><source media="(min-width:800px)" type="image/webp" srcset="wide.webp 2x"><!-- keep --><source srcset="narrow.png"><IMG width='240' height="180" style="object-fit:cover" alt="Keep" src="fallback.png" srcset="fallback2.png 2x" /></picture>`;
const target = (source: string) => inspectPictureTargets(source)[0]!;

describe("spec025 explicit responsive image unification", () => {
  it("groups candidate diagnostics without hiding CSS resource issues", () => {
    const issues = inspectResources(picture.replace("class='cover'", `style="background:url(bg.png)"`));
    expect(issues.map(i => i.kind)).toEqual(["图片", "CSS 资源"]);
    expect(issues[0]!.pictureOffset).toBe(0);
    expect(issues[0]!.imageOffset).toBeUndefined();
  });
  it("preserves exact unrelated bytes, comments, wrapper and IMG layout", () => {
    const prefix = `<!doctype html><style>.cover{display:block}</style>`;
    const suffix = `<script>const a='fallback.png'</script><p>keep</p>`;
    const source = prefix + picture + suffix;
    const next = replacePictureImage(source, target(source), image, true);
    expect(next.startsWith(prefix)).toBe(true);
    expect(next.endsWith(suffix)).toBe(true);
    expect(next).toContain("<picture class='cover'><!-- keep --><IMG");
    expect(next).toContain(`width='240' height="180" style="object-fit:cover" alt="Keep"`);
    expect(next).not.toContain('<source');
    expect(next).not.toContain('srcset=');
    expect(next).toContain(`src="${dataUrl}"`);
    expect(inspectResources(next)).toEqual([]);
    expect(createPreview(next, "picture-check", false)).toContain(dataUrl);
    expect(createPreview(next, "picture-check", false)).not.toContain("const a=");
  });
  it("requires explicit confirmation and rejects changed raw source and offsets", () => {
    expect(() => replacePictureImage(picture, target(picture), image, false)).toThrow("确认");
    expect(() => replacePictureImage(picture.replace('fallback.png', 'changed.png'), target(picture), image, true)).toThrow("变化");
    expect(() => replacePictureImage(' ' + picture, target(picture), image, true)).toThrow("变化");
  });
  it("rejects late image results after version, source, mode or epoch changes", () => {
    const captured = { source: picture, contextKey: "v1", epoch: 1 };
    const current = { ...captured, disabled: false };
    expect(imageRepairIsCurrent(captured, current)).toBe(true);
    for (const change of [{ source: "changed" }, { contextKey: "v2" }, { disabled: true }, { epoch: 3 }])
      expect(imageRepairIsCurrent(captured, { ...current, ...change })).toBe(false);
  });
  it.each([
    '<picture><img src="a"><img src="b"></picture>',
    '<picture><img src="a"><source srcset="b"></picture>',
    '<picture><div><img src="a"></div></picture>',
    '<picture><picture><img src="a"></picture></picture>',
    '<picture>unexpected text<img src="a"></picture>',
    '<picture><source srcset="a" SRCSET="b"><img src="c"></picture>',
    '<picture><img src="a" SRC="b"></picture>',
    '<picture class="a" CLASS="b"><img src="a"></picture>',
    '<picture><img src="a">',
    '<picture><source srcset="a"></source><img src="b"></picture>',
    '<picture><img src="a"></img></picture>',
    '<picture><script>change()</script><img src="a"></picture>',
    '<picture onclick="change()"><img src="a"></picture>',
    '<picture><img src="a" onload="change()"></picture>',
    '<picture><source id="referenced" srcset="a"><img src="b"></picture>',
    '<picture><source data-state="a" srcset="a"><img src="b"></picture>',
    '<template><picture><img src="a"></picture></template>',
    '<svg><foreignObject><picture><img src="a"></picture></foreignObject></svg>',
  ])("does not edit ambiguous, scripted or inert markup: %s", source => {
    expect(inspectPictureTargets(source)).toEqual([]);
  });
  it("handles missing fallback, embedded fallback with candidates, and multiple independent pictures", () => {
    expect(inspectPictureTargets('<picture><img alt="Empty"></picture>')).toHaveLength(1);
    expect(inspectPictureTargets(`<picture><img src="${dataUrl}"></picture>`)).toEqual([]);
    expect(inspectPictureTargets(`<picture><source srcset="other.png"><img src="${dataUrl}"></picture>`)).toHaveLength(1);
    const source = picture + picture;
    const next = replacePictureImage(source, inspectPictureTargets(source)[1]!, image, true);
    expect(next.startsWith(picture)).toBe(true);
    expect(inspectPictureTargets(next)).toHaveLength(1);
  });
  it("enforces bitmap and final HTML limits", () => {
    expect(() => replacePictureImage(picture, target(picture), { ...image, dataUrl: 'data:image/svg+xml,evil' }, true)).toThrow();
    const source = '<picture><img></picture>' + ' '.repeat(MAX_DOCUMENT_BYTES - 23);
    expect(() => replacePictureImage(source, target(source), image, true)).toThrow("5 MiB");
  });
  it("keeps saved source and originals exact through history and project backup", async () => {
    const next = replacePictureImage(picture, target(picture), image, true);
    const history = editHistory(historyOf(picture), next);
    expect(moveHistory(history, 'undo').present).toBe(picture);
    expect(moveHistory(moveHistory(history, 'undo'), 'redo').present).toBe(next);
    const record = { id: crypto.randomUUID(), name: "Picture QA.html", versions: [{ id: crypto.randomUUID(), source: picture, createdAt: new Date().toISOString(), label: 'Original' }] };
    await saveDocument(record);
    await saveDocument({ ...record, versions: [...record.versions, { id: crypto.randomUUID(), source: next, createdAt: new Date().toISOString(), label: 'Unified' }] }, record.versions[0]!.id);
    expect((await listDocuments()).find(d => d.id === record.id)!.versions.map(v => v.source)).toEqual([picture, next]);
    const backup = parseProjectBackup(serializeProjectBackup(await exportProjectBackup(record.id)));
    expect(backup.document.versions.map(v => v.source)).toEqual([picture, next]);
  });
  it("offers a bounded read-only action, without implicit confirmation or extra page chrome", () => {
    const html = renderToStaticMarkup(<ResourcePanel source={picture} contextKey="test" disabled onApply={() => { throw new Error('must not write'); }} />);
    expect(html).toContain('统一图片：Keep');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('确认并选图');
    expect(html).not.toContain('<details open');
  });
});
