import { describe, expect, it } from "vitest";
import { inspectDocumentObjects } from "./document-objects";
import { patchObjectTextStyle } from "./object-edit";
import { readObjectTextStyle } from "./object-style-read";

const catalog = inspectDocumentObjects;
const target = (source: string) => catalog(source)[0]!.objects[0]!;
const read = (source: string) => readObjectTextStyle(source, target(source), catalog);
const unknown = { fontSize: undefined, color: undefined, bold: undefined, align: undefined };

describe("source-only selected object style hints", () => {
  it("reads literal px, normalized hex, weight and alignment without changing source", () => {
    const source = '<p style="font-size:48px;color:#AbC;font-weight:700;text-align:center">Title</p>';
    const before = target(source);
    expect(read(source)).toEqual({ fontSize: 48, color: "#aabbcc", bold: true, align: "center" });
    expect(target(source)).toEqual(before);
  });
  it("does not invent stylesheet, class, relative, variable or browser defaults", () => {
    expect(read('<style>p{font-size:50px}</style><p class="large">Text</p>')).toEqual(unknown);
    expect(read('<p style="font-size:2em;color:var(--ink);font-weight:bolder;text-align:start">Text</p>')).toEqual(unknown);
    expect(read('<p style="font-size:calc(20px + 2px);color:rgb(1,2,3)">Text</p>')).toEqual(unknown);
  });
  it("respects duplicate declaration order and important priority, including managed spans", () => {
    expect(read('<p style="font-size:30px!important;font-size:40px;color:#fff!important;color:#000">Text</p>'))
      .toMatchObject({ fontSize: 30, color: "#ffffff" });
    const source = '<p style="font-size:30px!important">Text <span>inside</span></p>';
    const changed = patchObjectTextStyle(source, target(source), { fontSize: 42, bold: false, color: "#102030", align: "right" }, catalog);
    expect(read(changed)).toEqual({ fontSize: 42, color: "#102030", bold: false, align: "right" });
    expect(read('<p style="--docs-text-style-start:1;font-size:20px!important;--docs-text-style-end:1;font-size:31px!important">X</p>').fontSize).toBe(31);
  });
  it("ignores declaration-looking text inside quotes, comments and functions", () => {
    expect(read('<p style="--label:\'font-size:99px;color:red\';/*font-size:90px;*/font-size:20px;background:url(\'a;color:red\');color:#123">Text</p>'))
      .toMatchObject({ fontSize: 20, color: "#112233" });
    expect(read('<p style="font-size:20px ! /* note */ IMPORTANT;color:#1234">Text</p>'))
      .toMatchObject({ fontSize: 20, color: "#11223344" });
  });
  it("treats ambiguous escapes conservatively and rejects incomplete style syntax", () => {
    expect(read('<p style="font-size:20px;font-s\\69ze:50px">Text</p>')).toEqual(unknown);
    for (const style of ["font-size:20px;/*", "font-size:20px;--x:'open", "font-size:20px;--x:(open", "font-size:20px;}"])
      expect(() => read(`<p style="${style}">Text</p>`)).toThrow();
  });
  it("does not retain known values when unresolved shorthands/resets override them", () => {
    expect(read('<p style="font-size:20px;font-weight:bold;color:#abc;font:italic 12px serif">Text</p>'))
      .toEqual({ ...unknown, color: "#aabbcc" });
    expect(read('<p style="font-size:20px;color:#abc;all:initial">Text</p>')).toEqual(unknown);
    expect(read('<p style="font-size:20px!important;all:initial">Text</p>').fontSize).toBe(20);
  });
  it("aggregates actual text runs with bounded inline inheritance and mixed values", () => {
    expect(read('<p style="font-size:24px;color:#abc">A <span>B</span></p>'))
      .toMatchObject({ fontSize: 24, color: "#aabbcc" });
    expect(read('<p style="font-size:24px;color:#abc">A <span style="font-size:32px;color:var(--ink)">B</span></p>'))
      .toMatchObject({ fontSize: "mixed", color: "mixed" });
    expect(read('<p style="font-size:24px">A <span style="font-size:inherit">B</span></p>').fontSize).toBe(24);
    expect(read('<p><span style="font-size:24px">A</span><span style="font-size:24px">B</span></p>').fontSize).toBe(24);
  });
  it("does not guess semantic element defaults or include empty runs", () => {
    expect(read('<p style="font-weight:400;font-size:24px;color:#abc">A<strong>B</strong><small>C</small><a href="#x">D</a></p>'))
      .toMatchObject({ bold: "mixed", fontSize: "mixed", color: "mixed" });
    expect(read('<p style="font-size:24px"> A <span style="font-size:30px"> </span><br></p>').fontSize).toBe(24);
  });
  it("strictly rejects stale, forged, ambiguous or unsupported objects", () => {
    const source = '<p style="font-size:24px">Text</p>';
    const current = target(source);
    expect(() => readObjectTextStyle(" " + source, current, catalog)).toThrow();
    expect(() => readObjectTextStyle(source, { ...current, style: "font-size:99px" }, catalog)).toThrow();
    const forged = { ...current, raw: '<p style="font-size:99px">', style: "font-size:99px" };
    expect(() => readObjectTextStyle(source, forged, s => [{ ...catalog(s)[0]!, objects: [forged] }])).toThrow();
    expect(() => readObjectTextStyle(source, current, s => [{ ...catalog(s)[0]!, objects: [current, current] }])).toThrow();
    for (const unsupported of ['<p onclick="run()">Text</p>', '<p style="color:red" style="color:blue">Text</p>', '<img src="x">'])
      expect(() => read(unsupported)).toThrow();
  });
  it("supports explicit normal/decimal px and reports unsupported negative/relative values as unknown", () => {
    expect(read('<p style="font-size:.5px;font-weight:normal;color:red;text-align:left">Text</p>'))
      .toEqual({ fontSize: 0.5, bold: false, color: "#ff0000", align: "left" });
    expect(read('<p style="font-size:-2px;font-weight:2000;color:currentColor;text-align:justify">Text</p>')).toEqual(unknown);
  });
});
