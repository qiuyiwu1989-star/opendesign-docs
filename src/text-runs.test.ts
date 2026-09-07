import { describe, expect, it } from "vitest";
import { inspectSlides } from "./slides";
import { inspectTextRuns, patchTextRuns } from "./text-runs";
import { editHistory, historyOf, moveHistory } from "./history";

const wrap = (html: string) => `<section class="slide">${html}</section>`;
const read = (source: string) =>
  inspectTextRuns(source, inspectSlides(source)[0]!.objects[0]!);
describe("structure-preserving text runs", () => {
  it("edits mixed direct text and nested emphasis atomically, preserving tags and br", () => {
    const source = wrap(
      '<h1 class="title">Alpha<br><span style="color:red;font-size:.55em">Beta <em>Gamma</em></span> Delta</h1>',
    );
    const target = read(source);
    expect(target.runs.map((r) => [r.text, r.line])).toEqual([
      ["Alpha", 1],
      ["Beta ", 2],
      ["Gamma", 2],
      [" Delta", 2],
    ]);
    const next = patchTextRuns(source, target, [
      "New",
      "Beta ",
      "Bold",
      " End",
    ]);
    expect(next).toBe(
      source
        .replace("Alpha", "New")
        .replace("Gamma", "Bold")
        .replace(" Delta", " End"),
    );
    expect(
      moveHistory(editHistory(historyOf(source), next), "undo").present,
    ).toBe(source);
  });
  it("preserves untouched entities, whitespace and comments byte for byte", () => {
    const source = wrap(
      "<p> A &#38; B <!--keep--> <strong>C</strong> &nbsp; D </p>",
    );
    const target = read(source);
    expect(
      patchTextRuns(
        source,
        target,
        target.runs.map((r) => (r.text === "C" ? "E" : r.text)),
      ),
    ).toBe(source.replace("<strong>C", "<strong>E"));
    expect(
      patchTextRuns(
        source,
        target,
        target.runs.map((r) => r.text),
      ),
    ).toBe(source);
  });
  it("escapes input instead of accepting active markup", () => {
    const source = wrap("<h1>A<span>B</span></h1>");
    expect(
      patchTextRuns(source, read(source), ['<img onerror="bad()"> &', "B"]),
    ).toBe(wrap('<h1>&lt;img onerror="bad()"&gt; &amp;<span>B</span></h1>'));
  });
  it("rejects stale source, length mismatch, overlapping anchors and oversized input", () => {
    const source = wrap("<h1>A<span>B</span></h1>"),
      target = read(source);
    expect(() =>
      patchTextRuns(source.replace("B", "C"), target, ["D", "E"]),
    ).toThrow("已经变化");
    expect(() => patchTextRuns(source, target, ["D"])).toThrow("无效");
    expect(() =>
      patchTextRuns(source, target, ["x".repeat(100001), "E"]),
    ).toThrow("过长");
    expect(() =>
      patchTextRuns(
        source,
        { ...target, runs: [target.runs[1]!, target.runs[0]!] },
        ["D", "E"],
      ),
    ).toThrow("锚点");
  });
  it("does not flatten blocks, scripts, SVG, images or template content", () => {
    for (const html of [
      "<div><h1>Title</h1><p>Text</p></div>",
      "<div>A<script>bad()</script></div>",
      "<div>A<svg><text>B</text></svg></div>",
      '<p>A<img src="x"></p>',
      "<div>A<template>B</template></div>",
    ]) {
      expect(read(wrap(html)).runs).toEqual([]);
    }
  });
  it("supports refilling a cleared styled leaf and an empty heading", () => {
    const source = wrap('<h1>A<span style="color:red">B</span></h1>');
    const cleared = patchTextRuns(source, read(source), ["A", ""]);
    expect(patchTextRuns(cleared, read(cleared), ["A", "C"])).toBe(
      source.replace(">B<", ">C<"),
    );
    expect(
      patchTextRuns(wrap("<h1></h1>"), read(wrap("<h1></h1>")), ["Title"]),
    ).toBe(wrap("<h1>Title</h1>"));
  });
  it("limits segment count and rejects a stale object opening tag", () => {
    expect(read(wrap(`<h1>${"<span>A</span>".repeat(41)}</h1>`)).runs).toEqual(
      [],
    );
    const source = wrap("<h1>A</h1>"),
      object = inspectSlides(source)[0]!.objects[0]!;
    expect(
      inspectTextRuns(source.replace("<h1>", '<h1 class="x">'), object).runs,
    ).toEqual([]);
  });
});
