import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inspectDocumentObjects as catalog } from "./document-objects";
import { getObjectCapabilities, removeObject } from "./object-edit";
import { moveDocumentObject } from "./document-edit";
import { createPreview } from "./html";
import { inspectTextRuns } from "./text-runs";
const sample = readFileSync(new URL("../docs/incoming/deepbrain-sample-report.html", import.meta.url), "utf8");
const objects = (source: string) => catalog(source)[0]!.objects;
describe("static report figures", () => {
  it("supports the revised nine-chart plus flowchart fixture with exact whole-figure removal", () => {
    const source = readFileSync(new URL("../docs/incoming/deepbrain-sample-report-9charts.html", import.meta.url), "utf8");
    const figures = objects(source).filter(o => o.tag === "figure");
    expect(figures).toHaveLength(10);
    expect(createPreview(source, "nine-chart-release", false).match(/<svg\b/g)).toHaveLength(10);
    for (const figure of figures) {
      expect(getObjectCapabilities(source, figure, catalog), figure.title).toMatchObject({ remove: true, reorder: true });
      const end = source.indexOf("</figure>", figure.start) + 9;
      expect(removeObject(source, figure, catalog)).toBe(source.slice(0, figure.start) + source.slice(end));
      const moved = moveDocumentObject(source, figure, -1);
      const selected = objects(moved.source).find(o => o.id === moved.objectId)!;
      expect(moveDocumentObject(moved.source, selected, 1).source).toBe(source);
    }
  });
  it("supports all five sample figures without granting SVG text editing or duplication", () => {
    const figures = objects(sample).filter(o => o.tag === "figure"); expect(figures).toHaveLength(5);
    for (const figure of figures) {
      expect(getObjectCapabilities(sample, figure, catalog)).toMatchObject({ remove: true, reorder: true, duplicate: false, textStyle: false });
      const end = sample.indexOf("</figure>", figure.start) + 9;
      expect(removeObject(sample, figure, catalog)).toBe(sample.slice(0, figure.start) + sample.slice(end));
    }
  });
  it("moves a figure and back without changing any bytes or evidence references", () => {
    const figure = objects(sample).find(o => o.tag === "figure")!;
    const moved = moveDocumentObject(sample, figure, -1);
    const selected = objects(moved.source).find(o => o.id === moved.objectId)!;
    expect(moveDocumentObject(moved.source, selected, 1).source).toBe(sample);
  });
  it.each(['<script>x()</script>', '<foreignObject><p>x</p></foreignObject>', '<animate/>', '<use href="#x"/>', '<a href="https://example.com">x</a>', '<text onclick="x()">x</text>', '<text id="referenced">x</text>'])("rejects complex or identity-bearing subtree %s", child => {
    const source = `<figure><svg>${child}</svg></figure>`, figure = objects(source)[0]!;
    expect(getObjectCapabilities(source, figure, catalog).remove).toBe(false);
    expect(() => removeObject(source, figure, catalog)).toThrow();
  });
  it("keeps static charts/styles/fragment anchors in preview and detects mixed text", () => {
    const preview = createPreview(sample, "test-channel-123", false);
    expect(preview.match(/<svg\b/g)).toHaveLength(5);
    expect(preview).toContain("prefers-color-scheme"); expect(preview).toContain('href="#ev-3"'); expect(preview).toContain('class="dbc-f-');
    const p = objects(sample).find(o => o.tag === "p" && inspectTextRuns(sample, o).raw.includes("<sup"))!;
    expect(inspectTextRuns(sample, p).reason).toBe(""); expect(inspectTextRuns(sample, p).runs.length).toBeGreaterThan(1);
  });
});
