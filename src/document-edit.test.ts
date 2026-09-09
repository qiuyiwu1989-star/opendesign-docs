import { describe, expect, it } from "vitest";
import { inspectDocumentObjects } from "./document-objects";
import { documentFlowCapabilities, insertDocumentObject, moveDocumentObject } from "./document-edit";
import { duplicateObject, getObjectCapabilities, patchObjectTextStyle, removeObject, replaceObjectImage } from "./object-edit";
import { createPreview } from "./html";
import { imageRepairIsCurrent } from "./image-import";
import { editHistory, historyOf, moveHistory } from "./history";

const catalog = inspectDocumentObjects;
const objects = (s: string) => catalog(s)[0]!.objects;
const wrap = (s: string) => `<!doctype html><html><head><style>p{color:red}</style></head><body><main>${s}</main></body></html>`;
describe("long-document source editing using the shared object engine", () => {
  it("catalogs actual blocks without introducing slide wrappers or entering active namespaces", () => {
    const source = wrap('<p>One <strong>two</strong></p><svg><text>skip</text></svg><script>skip</script><img src="missing.png"><template><p>skip</p></template>');
    expect(objects(source).map(o => o.tag)).toEqual(["p", "img"]);
    expect(objects(source)[0]!.raw).toBe("<p>");
  });
  it("reuses exact-source styling while preserving mixed inline markup", () => {
    const source = wrap('<p>Before <strong>bold</strong> and <a href="#x">link</a></p>');
    const next = patchObjectTextStyle(source, objects(source)[0]!, { fontSize: 30, color: "#112233" }, catalog);
    expect(next).toContain('href="#x"');
    expect(next).toContain("Before <strong style=");
    expect(next.match(/font-size:30px/g)).toHaveLength(3);
    expect(next.startsWith(source.slice(0, source.indexOf("<p>")))).toBe(true);
  });
  it("swaps whole siblings and preserves separator bytes with a current selection", () => {
    const source = wrap('<p>First</p>\n  <div><h2>Second</h2><p>Nested</p></div>\n<p>Last</p>');
    const target = objects(source)[0]!;
    const result = moveDocumentObject(source, target, 1);
    expect(result.source).toBe(wrap('<div><h2>Second</h2><p>Nested</p></div>\n  <p>First</p>\n<p>Last</p>'));
    const moved = objects(result.source).find(o => o.id === result.objectId)!;
    expect(moved.title).toBe("First");
    expect(moveDocumentObject(result.source, moved, -1).source).toBe(source);
  });
  it("does not cross comments, direct text or scripts", () => {
    for (const barrier of ['<!--keep-->', 'direct text', '<script>x()</script>']) {
      const source = wrap(`<p>First</p>${barrier}<p>Last</p>`);
      expect(documentFlowCapabilities(source, objects(source)[0]!).down).toBe(false);
      expect(() => moveDocumentObject(source, objects(source)[0]!, 1)).toThrow();
    }
  });
  it("can reorder referenced blocks without cloning or dropping their IDs", () => {
    const source = wrap('<p id="a">First</p>\n<p><a href="#a">Last</a></p>');
    expect(moveDocumentObject(source, objects(source)[0]!, 1).source).toBe(wrap('<p><a href="#a">Last</a></p>\n<p id="a">First</p>'));
  });
  it("uses existing clone/delete guards and stale target checks", () => {
    const source = wrap('<p>First</p><p>Last</p>'), target = objects(source)[0]!;
    const duplicated = duplicateObject(source, target, catalog);
    const copy = objects(duplicated.source).find(o => o.id === duplicated.objectId)!;
    expect(removeObject(duplicated.source, copy, catalog)).toBe(source);
    expect(() => removeObject(" " + source, target, catalog)).toThrow();
    const linked = wrap('<p id="original">First</p>');
    expect(getObjectCapabilities(linked, objects(linked)[0]!, catalog).duplicate).toBe(false);
  });
  it("inserts escaped text after a block, rejects list-invalid nesting and stays undoable", () => {
    const source = wrap('<p>First</p><p>Last</p>');
    const result = insertDocumentObject(source, objects(source)[0]!, { text: '<script>unsafe & "text"</script>' });
    expect(result.source).toContain('<p>&lt;script&gt;unsafe &amp; &quot;text&quot;&lt;/script&gt;</p>');
    expect(objects(result.source).find(o => o.id === result.objectId)?.tag).toBe("p");
    const history = editHistory(historyOf(source), result.source);
    expect(moveHistory(history, "undo").present).toBe(source);
    const list = wrap('<ul><li>A</li><li>B</li></ul>');
    expect(documentFlowCapabilities(list, objects(list)[1]!).insert).toBe(false);
    expect(() => insertDocumentObject(list, objects(list)[1]!, { text: "bad" })).toThrow();
  });
  it("rejects incomplete markup and source overflow", () => {
    const partial = '<div><p>Unclosed';
    expect(documentFlowCapabilities(partial, objects(partial)[0]!).insert).toBe(false);
    expect(() => insertDocumentObject(wrap('<p>A</p>'), objects(wrap('<p>A</p>'))[0]!, { text: "x".repeat(100001) })).toThrow();
    const large = wrap('<p>A</p>') + " ".repeat(5 * 1024 * 1024);
    expect(() => insertDocumentObject(large, objects(large)[0]!, { text: "x" })).toThrow("5 MB");
  });
  it("does not insert after malformed or active targets", () => {
    for (const body of ['<p onclick="x()">A</p>', '<p class="a" class="b">A</p>']) {
      const source = wrap(body), target = objects(source)[0]!;
      expect(documentFlowCapabilities(source, target).insert).toBe(false);
      expect(() => insertDocumentObject(source, target, { text: "blocked" })).toThrow();
      expect(source).toContain(body);
    }
  });
  it("invalidates a late image even when selection returns A to B to A", () => {
    const captured = { source: "same", contextKey: "object-a", epoch: 1 };
    expect(imageRepairIsCurrent(captured, { ...captured, epoch: 3, disabled: false })).toBe(false);
  });
  it("reuses validated local image insertion/replacement and removes old srcset", () => {
    const image = { dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR8sAAAAASUVORK5CYII=", width: 1, height: 1, alt: 'local "image"' };
    const source = wrap('<img alt="original" src="broken.jpg" srcset="old.jpg 2x"><p>End</p>');
    const next = replaceObjectImage(source, objects(source)[0]!, image, { width: 200, height: 100 }, catalog);
    expect(next).not.toContain('srcset=');
    expect(next).toContain('alt="original"');
    expect(next).toContain('width:200px!important');
    const added = insertDocumentObject(source, objects(source)[0]!, { image });
    expect(added.source).toContain('alt="local &quot;image&quot;"');
    expect(objects(added.source).find(o => o.id === added.objectId)?.tag).toBe("img");
  });
  it("only adds object metadata to inert preview, with authenticated bridge controls", () => {
    const source = wrap('<p data-doc-object="forged">First</p>');
    const preview = createPreview(source, "test-channel-123", true, 0, false, node => {
      if (node.tagName === "p") node.attrs.push({ name: "data-doc-object", value: "doc-77" });
    });
    expect(preview).toContain('data-doc-object="doc-77"');
    expect(preview).not.toContain('data-doc-object="forged"');
    expect(preview).toContain("e.source !== parent || e.data?.channel !== channel");
    expect(preview).toContain("object-focus");
    const script = preview.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)![1]!;
    expect(() => new Function(script)).not.toThrow();
  });
});
