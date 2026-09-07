import { describe, expect, it } from "vitest";
import { parse } from "parse5";
import { inspectSlides, patchPlacement } from "./slides";
import {
  duplicateObject,
  getObjectCapabilities,
  patchObjectTextStyle,
  removeObject,
  replaceObjectImage,
} from "./object-edit";
import { MAX_DOCUMENT_BYTES } from "./slide-insert";

const wrap = (body: string) =>
  `<!doctype html><html><head><style>.slide{position:relative}</style></head><body><!--keep--><section class='slide'>${body}</section></body></html>`;
const first = (source: string) => inspectSlides(source)[0]!.objects[0]!;
function image() {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([73, 72, 68, 82], 12);
  new DataView(bytes.buffer).setUint32(16, 1);
  new DataView(bytes.buffer).setUint32(20, 1);
  return {
    dataUrl: `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`,
    width: 1,
    height: 1,
    alt: "new",
  };
}
describe("spec017 source object operations", () => {
  it("copies exact complete sibling bytes and returns the new selectable ID", () => {
    const fragment = `<h1 class='title' style='left:20px'>Hello <strong>world</strong><br>again &amp; more</h1>`;
    const source = wrap(`${fragment}\n<p>Next</p>`);
    const next = duplicateObject(source, first(source));
    expect(next.source).toBe(wrap(`${fragment}${fragment}\n<p>Next</p>`));
    const added = inspectSlides(next.source)[0]!.objects.find(
      (o) => o.id === next.objectId,
    )!;
    expect(added.start).toBe(first(source).start + fragment.length);
    expect(added.title).toBe(first(source).title);
  });
  it("removes one full nested object without serializing surrounding source", () => {
    const source = wrap(
      `<div class='card'>intro<h2>A</h2><p>B</p></div>\n<p>C</p>`,
    );
    expect(removeObject(source, first(source))).toBe(wrap("\n<p>C</p>"));
    const target = inspectSlides(source)[0]!.objects.find(
      (o) => o.tag === "h2",
    )!;
    expect(removeObject(source, target)).toBe(source.replace("<h2>A</h2>", ""));
  });
  it("permits local edits but never duplicates/removes IDs or dependency references", () => {
    for (const attributes of [
      `id='a'`,
      `id='same'`,
      `aria-labelledby='a'`,
      `style='color:var(--ink)'`,
    ]) {
      const source = wrap(`<h1 ${attributes}>A</h1><p id='same'>B</p>`);
      const capabilities = getObjectCapabilities(source, first(source));
      expect(capabilities.duplicate).toBe(false);
      expect(capabilities.remove).toBe(false);
      expect(capabilities.textStyle).toBe(true);
      expect(() => duplicateObject(source, first(source))).toThrow();
      expect(() => removeObject(source, first(source))).toThrow();
    }
  });
  it("rejects SVG, table, scripts, active handlers and partial HTML", () => {
    for (const fragment of [
      "<svg><text>A</text></svg>",
      "<table><tr><td>A</td></tr></table>",
      "<div>A<script>alert(1)</script></div>",
      "<p onclick='x()'>A</p>",
      "<p>A",
      "<h1 style='x' style='y'>A</h1>",
    ]) {
      const source = wrap(fragment);
      const capabilities = getObjectCapabilities(source, first(source));
      expect(capabilities.duplicate).toBe(false);
      expect(capabilities.textStyle).toBe(false);
      expect(capabilities.remove).toBe(false);
    }
  });
  it("rejects stale targets after a source shift, start tag or title change", () => {
    const source = wrap("<h1>A</h1>");
    const target = first(source);
    for (const changed of [
      " " + source,
      source.replace("<h1>", "<h1 title='x'>"),
      source.replace(">A<", ">B<"),
    ]) {
      expect(() => removeObject(changed, target)).toThrow("对象已变化");
      expect(() => duplicateObject(changed, target)).toThrow("对象已变化");
      expect(() =>
        patchObjectTextStyle(changed, target, { bold: true }),
      ).toThrow("对象已变化");
    }
  });
  it("styles all inline runs while preserving tags, entities, line breaks and unrelated attributes", () => {
    const source = wrap(
      `<h1 class='title' style='left:20px;color:red'>One <strong title='emphasis' style='color:blue!important'>two</strong><br> &amp; three</h1><p>untouched</p>`,
    );
    const next = patchObjectTextStyle(source, first(source), {
      fontSize: 40,
      color: "#aAbBcC",
      bold: false,
      align: "center",
    });
    expect(next).toContain(
      "<strong title='emphasis' style=\"color:blue!important;",
    );
    expect(next).toContain("<br> &amp; three</h1><p>untouched</p>");
    expect(next.match(/font-size:40px!important/g)).toHaveLength(2);
    expect(next.match(/color:#aabbcc!important/g)).toHaveLength(2);
    expect(next.match(/font-weight:400!important/g)).toHaveLength(2);
    expect(next.match(/text-align:center!important/g)).toHaveLength(2);
    expect(first(next).title).toBe(first(source).title);
  });
  it("coalesces repeated formatting while retaining independently changed properties", () => {
    let source = wrap(
      `<h1 style='background:url(&quot;x;a&quot;);color:red'>A <em>B</em></h1>`,
    );
    source = patchObjectTextStyle(source, first(source), {
      fontSize: 42,
      color: "#123456",
    });
    const size = source.length;
    for (let i = 0; i < 30; i++)
      source = patchObjectTextStyle(source, first(source), { fontSize: 42 });
    expect(source.length).toBe(size);
    expect(source.match(/--docs-text-style-start/g)).toHaveLength(2);
    expect(source.match(/color:#123456!important/g)).toHaveLength(2);
    expect(source).toContain("background:url(&quot;x;a&quot;);color:red;");
  });
  it("whitelists styles and rejects CSS/attribute escapes", () => {
    const source = wrap("<h1>A</h1>");
    for (const patch of [
      { fontSize: NaN },
      { fontSize: 201 },
      { fontSize: 7 },
      { color: "#fff;position:fixed" },
      { color: '\" onerror=\"x' },
      { align: "left; color:red" },
      { bold: "true" },
      { position: "fixed" },
    ]) {
      expect(() =>
        patchObjectTextStyle(source, first(source), patch as never),
      ).toThrow();
    }
    expect(patchObjectTextStyle(source, first(source), {})).toBe(source);
  });
  it("coalesces one hundred alternating placement and text-format patches", () => {
    let source = wrap("<h1 style='left:20px;color:red'>A <em>B</em></h1>");
    const edit = () => {
      source = patchPlacement(source, first(source), {
        x: 16,
        y: 24,
        scale: 1.2,
      });
      source = patchObjectTextStyle(source, first(source), {
        fontSize: 42,
        color: "#123456",
      });
    };
    edit();
    const expected = source;
    for (let i = 0; i < 100; i++) edit();
    expect(source).toBe(expected);
    expect(source.match(/translate:16px 24px/g)).toHaveLength(1);
    expect(source.match(/--docs-text-style-start/g)).toHaveLength(2);
  });
  it("does not append text declarations inside malformed imported CSS", () => {
    for (const style of [
      "font-family:&quot;unfinished",
      "background:url(open",
      "color:red;/*open",
      "color:red;\\",
      "color:red;}",
    ]) {
      const source = wrap(`<h1 style='${style}'>A</h1>`);
      expect(getObjectCapabilities(source, first(source)).textStyle).toBe(
        false,
      );
      expect(() =>
        patchObjectTextStyle(source, first(source), { color: "#fff" }),
      ).toThrow();
    }
  });
  it("replaces src while preserving identity, dimensions, placement and original alt; clears responsive overrides", () => {
    const source = wrap(
      `<img id='photo' src='old.png' srcset='old@2x.png 2x' sizes='50vw' alt='original' width='200' height='100' style='width:200px!important;height:100px!important;translate:12px 4px'/>`,
    );
    const next = replaceObjectImage(source, first(source), image());
    expect(next).toContain(`id='photo' src="${image().dataUrl}"`);
    expect(next).not.toContain("srcset=");
    expect(next).not.toContain("sizes=");
    expect(next).toContain(
      "alt='original' width='200' height='100' style='width:200px!important;height:100px!important;translate:12px 4px'/>",
    );
    expect(first(next).id).toBe(first(source).id);
  });
  it("validates bitmap input and refuses picture-driven source switching", () => {
    const source = wrap("<img src='old.png'>");
    expect(() =>
      replaceObjectImage(source, first(source), {
        ...image(),
        dataUrl: "javascript:alert(1)",
      }),
    ).toThrow();
    // inspectSlides currently excludes picture subtrees: forged targets fail closed.
    const other = wrap(
      "<picture><source srcset='old.webp'><img src='old.png'></picture>",
    );
    expect(getObjectCapabilities(other, first(source)).replaceImage).toBe(
      false,
    );
  });
  it("freezes measured CSS dimensions for intrinsic-size images and rejects unavailable geometry", () => {
    const source = wrap("<img src='old.png' style='margin:4px'>");
    expect(getObjectCapabilities(source, first(source)).replaceImage).toBe(
      true,
    );
    expect(() => replaceObjectImage(source, first(source), image())).toThrow(
      "尺寸尚未就绪",
    );
    expect(() =>
      replaceObjectImage(source, first(source), image(), {
        width: NaN,
        height: 100,
      }),
    ).toThrow();
    const next = replaceObjectImage(source, first(source), image(), {
      width: 203.25,
      height: 102.5,
    });
    expect(next).toContain(
      "margin:4px;--docs-image-size-start:1;width:203.25px!important;height:102.5px!important;",
    );
    expect(replaceObjectImage(next, first(next), image())).toBe(next);
  });
  it("uses measured CSS size instead of attributes overridden by imported styles", () => {
    const source = wrap(
      `<style>img{width:auto!important;height:auto!important}</style><img src='old.png' width='900' height='400' style='box-sizing:border-box;scale:1.2'>`,
    );
    expect(() => replaceObjectImage(source, first(source), image())).toThrow(
      "尺寸尚未就绪",
    );
    const size = { width: 200, height: 150 };
    const next = replaceObjectImage(source, first(source), image(), size);
    expect(next).toContain("width='900' height='400'");
    expect(next).toContain("box-sizing:border-box;scale:1.2;");
    expect(next).toContain("width:200px!important;height:150px!important;");
    expect(replaceObjectImage(next, first(next), image(), size)).toBe(next);
    const positioned = patchPlacement(next, first(next), {
      x: 15,
      y: 20,
      scale: 1.2,
    });
    expect(
      replaceObjectImage(positioned, first(positioned), image(), size),
    ).toBe(positioned);
  });
  it("enforces final UTF-8 byte budgets and the per-page object ceiling", () => {
    const large = wrap(
      `<h1>${"中".repeat(Math.ceil(MAX_DOCUMENT_BYTES / 6))}</h1>`,
    );
    expect(() => duplicateObject(large, first(large))).toThrow("5 MB");
    const crowded = wrap("<p>A</p>".repeat(400));
    expect(getObjectCapabilities(crowded, first(crowded)).duplicate).toBe(
      false,
    );
    expect(() => duplicateObject(crowded, first(crowded))).toThrow();
    const oversized = wrap(
      `<h1>A</h1><!--${"x".repeat(MAX_DOCUMENT_BYTES)}-->`,
    );
    expect(() =>
      patchObjectTextStyle(oversized, first(oversized), { bold: true }),
    ).toThrow("5 MB");
  });
  it("attribute escaping never creates a second style or executable attribute", () => {
    const source = wrap(`<h1 style='font-family:"a &amp; b"'>A</h1>`);
    const next = patchObjectTextStyle(source, first(source), { color: "#fff" });
    expect(next).toContain("font-family:&quot;a &amp; b&quot;");
    expect(first(next).style).toContain('font-family:"a & b"');
    const errors: string[] = [];
    parse(next, { onParseError: (e) => errors.push(e.code) });
    expect(errors).not.toContain("duplicate-attribute");
  });
});
