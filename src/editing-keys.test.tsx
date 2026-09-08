import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { composingKey } from "./editing-keys";
import { TextRunInspector } from "./TextRunInspector";
import { inspectTextRuns } from "./text-runs";
import { inspectSlides } from "./slides";

describe("spec029 quiet editing controls", () => {
  it("recognizes modern and legacy composition keys, not ordinary keys", () => {
    expect(composingKey({ isComposing: true })).toBe(true);
    expect(composingKey({ keyCode: 229 })).toBe(true);
    expect(composingKey({ isComposing: false, keyCode: 27 })).toBe(false);
    expect(composingKey({})).toBe(false);
  });
  it("does not show redundant apply controls for pristine text", () => {
    const html = '<section class="slide"><h1>标题</h1></section>';
    const target = inspectTextRuns(
      html,
      inspectSlides(html)[0]!.objects.find((o) => o.tag === "h1")!,
    );
    const markup = renderToStaticMarkup(
      <TextRunInspector
        target={target}
        disabled={false}
        onDraft={() => {}}
        onApply={() => {}}
      />,
    );
    expect(markup).toContain("标题");
    expect(markup).not.toContain("应用文字");
    expect(markup).not.toContain("文字未应用");
  });
});
