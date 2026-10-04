import { describe, expect, it } from "vitest";
import { inspectDocumentObjects } from "./document-objects";
import { readDocumentGeometry, patchDocumentGeometry } from "./document-geometry";
const html = `<main><div data-keep='yes' style='color:red; position:absolute; left:10px; top:20px; width:300px; height:200px; padding:8px'>Hello <b>world</b></div></main>`;
const target = (source: string) => inspectDocumentObjects(source)[0]!.objects.find(o => o.tag === "div")!;
describe("inline absolute geometry", () => {
  it("changes only requested numeric source spans in one edit", () => {
    const next = patchDocumentGeometry(html, target(html), { x: -12, y: 20, width: 420, height: 200 });
    expect(next).toBe(html.replace('left:10px', 'left:-12px').replace('width:300px', 'width:420px'));
    expect(readDocumentGeometry(next, target(next)).geometry).toEqual({ x: -12, y: 20, width: 420, height: 200 });
  });
  it("leaves flow, relative, transforms, shorthand constraints and relative units unsupported", () => {
    for (const style of ['position:relative;left:10px;top:20px;width:300px;height:200px', 'position:absolute;left:10%;top:20px;width:300px;height:200px', 'position:absolute;left:10px;top:20px;width:300px;height:200px;transform:rotate(5deg)', 'position:absolute;left:10px;top:20px;width:300px;height:200px;right:0']) {
      const source = `<div style="${style}">Test</div>`;
      expect(readDocumentGeometry(source, target(source)).geometry).toBeUndefined();
    }
  });
  it("rejects stale targets and invalid sizes", () => {
    expect(() => patchDocumentGeometry(html.replace('Hello', 'Changed'), target(html), { x: 1, y: 2, width: 3, height: 4 })).toThrow();
    expect(() => patchDocumentGeometry(html.replace('10px', '11px'), target(html), { x: 1, y: 2, width: 3, height: 4 })).toThrow();
    for (const width of [0, -1, NaN, Infinity, 20001]) expect(() => patchDocumentGeometry(html, target(html), { x: 1, y: 2, width, height: 4 })).toThrow();
  });
  it("rejects duplicate declarations, attributes and unsafe external coordinate rules", () => {
    for (const source of [html.replace('color:red', 'left:1px'), html.replace("data-keep='yes'", "style='color:blue'"), '<style>div {transform:scale(2)}</style>'+html, '<link rel="stylesheet" href="x.css">'+html]) expect(readDocumentGeometry(source, target(source)).geometry).toBeUndefined();
  });
});
