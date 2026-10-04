import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentLayers } from "./DocumentLayers";
import { documentLayers, layerAncestors } from "./document-layers";

describe("document layer ancestry", () => {
  it("does not mistake filtered-wrapper siblings for descendants", () => {
    const layers = documentLayers('<main><section><p>A</p></section><aside><p>B</p></aside></main>');
    const [section, a, b] = layers;
    expect(section!.parent).toBeNull();
    expect(a!.parent).toBe(section!.object.id);
    expect(b!.parent).toBeNull();
    expect(layerAncestors(layers, b!.object.id)).toEqual([]);
  });
  it("finds the nearest supported ancestor through filtered wrappers", () => {
    const layers = documentLayers('<section><main><aside><p>A</p></aside></main><figure><img src="x"></figure></section>');
    expect(layers.map(layer => layer.level)).toEqual([0, 1, 1, 2]);
    expect(layerAncestors(layers, layers[3]!.object.id)).toEqual([layers[2]!.object.id, layers[0]!.object.id]);
    expect(layerAncestors(layers, "missing")).toEqual([]);
  });
  it("excludes SVG internals and keeps root siblings separate", () => {
    const layers = documentLayers('<p>A</p><svg><text>B</text></svg><div><p>C</p></div>');
    expect(layers.map(layer => layer.object.tag)).toEqual(["p", "div", "p"]);
    expect(layers.map(layer => layer.parent)).toEqual([null, null, layers[1]!.object.id]);
  });
  it("renders selectable, collapsible buttons and disables every action for pending input", () => {
    const source = '<section><p>A</p></section>';
    const selected = documentLayers(source)[1]!.object.id;
    const html = renderToStaticMarkup(<DocumentLayers source={source} selected={selected} disabled onSelect={() => {}} />);
    expect(html).toContain('aria-label="内容层级"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-pressed="true"');
    const buttons = html.match(/<button\b[^>]*>/g)!;
    expect(buttons.length).toBe(4);
    expect(buttons.every(button => button.includes('disabled=""'))).toBe(true);
  });
});
