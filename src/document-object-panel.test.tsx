import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentObjectPanel } from "./DocumentObjectPanel";
import { inspectDocumentObjects } from "./document-objects";

function render(source: string) {
  const selected = inspectDocumentObjects(source)[0]!.objects[0]!.id;
  return renderToStaticMarkup(<DocumentObjectPanel source={source} selected={selected} disabled={false}
    onSelect={() => {}} onApply={() => {}} />);
}

describe("long-document object inspector", () => {
  it("renders the selected object's literal source styles instead of generic defaults", () => {
    const html = render('<p style="font-size:48px;color:#123456;font-weight:bold;text-align:right">Text</p>');
    expect(html).toContain('aria-label="字号"');
    expect(html).toContain('value="48"');
    expect(html).toContain('aria-label="文字颜色，#123456"');
    expect(html).toContain('value="#123456"');
    expect(html).toContain('title="加粗" aria-pressed="true"');
    expect(html).toContain('<option value="right" selected="">右对齐</option>');
  });

  it("labels unknown and mixed values without inventing a concrete source value", () => {
    const unknown = render('<p class="theme-default">Text</p>');
    expect(unknown).toContain('placeholder="未指定"');
    expect(unknown).toContain('文字颜色，未指定');
    expect(unknown).toContain('未指定对齐');
    const mixed = render('<p><span style="font-size:20px">A</span><span style="font-size:30px">B</span></p>');
    expect(mixed).toContain('placeholder="混合"');
  });
});
