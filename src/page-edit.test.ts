import { describe, expect, it } from "vitest";
import { editPage, getPageTarget, pageCapabilities } from "./page-edit";
import { inspectSlides } from "./slides";
import { MAX_DOCUMENT_BYTES } from "./slide-insert";

const a =
  '<section class="slide" style="position:absolute"><h1>A &amp; 中</h1><p><b>Bold</b><br>tail</p></section>';
const b =
  '<section data-slide style="position:absolute"><h1>B</h1><img src="data:image/png;base64,AA==" alt="B"></section>';
const c = '<section class="ppt-slide"><h1>C</h1></section>';
const prefix =
  "<!DOCTYPE html>\n<html><head><style>.slide:nth-child(2){color:red}</style></head><body><main>";
const gap =
  "\n<!-- Keep this between slots -->\n<style>.slide{margin:0}</style>\n";
const suffix =
  '</main><script>const pages = document.querySelectorAll(".slide");</script></body></html>';
const doc = prefix + a + gap + b + "\n" + c + suffix;

describe("spec 018 source-preserving page operations", () => {
  it("duplicates only a whole page and selects its rebuilt path ID", () => {
    const result = editPage(doc, "page-0", "duplicate");
    expect(result.source).toBe(prefix + a + a + gap + b + "\n" + c + suffix);
    expect(result.pageId).toBe("page-1");
    expect(inspectSlides(result.source)).toHaveLength(4);
    expect(inspectSlides(result.source)[1]!.objects[0]!.id).toBe("object-1-0");
  });
  it("deleting a fresh copy restores every original byte", () => {
    const copy = editPage(doc, "page-0", "duplicate");
    expect(editPage(copy.source, copy.pageId, "remove").source).toBe(doc);
  });
  it("moves only page nodes, keeping gap comments, CSS and scripts untouched", () => {
    const result = editPage(doc, "page-0", "down");
    expect(result.source).toBe(prefix + b + gap + a + "\n" + c + suffix);
    expect(result.pageId).toBe("page-1");
    expect(editPage(result.source, result.pageId, "up").source).toBe(doc);
  });
  it("deletes exact spans and selects the next page or previous at the end", () => {
    const middle = editPage(doc, "page-1", "remove");
    expect(middle.source).toBe(prefix + a + gap + "\n" + c + suffix);
    expect(middle.pageId).toBe("page-1");
    const last = editPage(doc, "page-2", "remove");
    expect(last.pageId).toBe("page-1");
    expect(last.source).toBe(prefix + a + gap + b + "\n" + suffix);
  });
  it("retains at least one page and rejects boundary moves", () => {
    expect(pageCapabilities(a, "page-0")).toMatchObject({
      duplicate: true,
      remove: false,
      moveUp: false,
      moveDown: false,
    });
    expect(() => editPage(a, "page-0", "remove")).toThrow("至少保留一页");
    expect(() => editPage(doc, "page-0", "up")).toThrow();
    expect(() => editPage(doc, "page-2", "down")).toThrow();
  });
  it("does not blanket-disable external scripts or ordered CSS but warns", () => {
    expect(pageCapabilities(doc, "page-0")).toMatchObject({
      duplicate: true,
      remove: true,
      moveDown: true,
    });
    expect(pageCapabilities(doc, "page-0").warning).toContain("原导航脚本");
  });
  it("rejects copies with identity, cross references or nonempty slide identity", () => {
    for (const attr of [
      'id="slide-a"',
      'name="slide-a"',
      'data-slide="1"',
      'data-index="0"',
    ]) {
      const source = `<section class="slide" ${attr}><h1>A</h1></section>` + b;
      expect(pageCapabilities(source, "page-0")).toMatchObject({
        duplicate: false,
        remove: true,
        moveDown: true,
      });
      expect(() => editPage(source, "page-0", "duplicate")).toThrow();
    }
    for (const child of [
      '<p id="label">A</p>',
      '<a href="#next">A</a>',
      '<p aria-describedby="next">A</p>',
      '<p style="clip-path:url(#shape)">A</p>',
    ]) {
      const source = `<section class="slide">${child}</section>` + b;
      expect(pageCapabilities(source, "page-0").duplicate).toBe(false);
    }
  });
  it("refuses local executable or cascade-changing content without touching source", () => {
    for (const child of [
      "<style>.slide{color:red}</style>",
      "<script>run()</script>",
      '<iframe src="x"></iframe>',
      "<template><p>A</p></template>",
      '<svg><path d="M 0 0"/></svg>',
      "<custom-box>A</custom-box>",
      '<p onclick="run()">A</p>',
    ]) {
      const source = `<section class="slide">${child}</section>` + b;
      expect(pageCapabilities(source, "page-0")).toMatchObject({
        duplicate: false,
        remove: false,
        moveDown: false,
      });
      expect(() => editPage(source, "page-0", "remove")).toThrow();
      // Also do not move a safe page across a complex neighbor.
      expect(pageCapabilities(source, "page-1").moveUp).toBe(false);
    }
  });
  it("rejects malformed or implicitly repaired page structures", () => {
    for (const child of [
      '<p title="a" title="b">A</p>',
      "<p>A<div>B</div>",
      "<table><tr><td>A</td></tr></table>",
    ]) {
      expect(
        pageCapabilities(
          `<section class="slide">${child}</section>` + b,
          "page-0",
        ).duplicate,
      ).toBe(false);
    }
    const explicit =
      '<section class="slide"><table><tbody><tr><td>A</td></tr></tbody></table></section>';
    expect(pageCapabilities(explicit, "page-0").duplicate).toBe(true);
  });
  it("checks exact expected page span, not just its path", () => {
    const expected = getPageTarget(doc, "page-0");
    expect(() =>
      editPage(doc.replace("Bold", "Changed"), "page-0", "duplicate", expected),
    ).toThrow("页面已变化");
    expect(() => editPage(" " + doc, "page-0", "duplicate", expected)).toThrow(
      "页面已变化",
    );
    expect(editPage(doc, "page-0", "duplicate", expected).pageId).toBe(
      "page-1",
    );
  });
  it("rejects unknown and differently parented pages", () => {
    expect(() => editPage(doc, "page-99", "remove")).toThrow("页面已变化");
    expect(
      pageCapabilities("<div>" + a + "</div><div>" + b + "</div>", "page-0")
        .remove,
    ).toBe(false);
  });
  it("caps duplicate count at 100 while allowing deletion and safe reorder", () => {
    const full = a.repeat(100);
    expect(pageCapabilities(full, "page-0")).toMatchObject({
      duplicate: false,
      remove: true,
      moveDown: true,
    });
    expect(() => editPage(full, "page-0", "duplicate")).toThrow("100");
    expect(
      inspectSlides(editPage(full, "page-0", "remove").source),
    ).toHaveLength(99);
  });
  it("enforces final UTF-8 size, including multi-byte content", () => {
    const largePage =
      '<section class="slide"><p>' + "中".repeat(900_000) + "</p></section>";
    expect(largePage.length * 2).toBeLessThan(MAX_DOCUMENT_BYTES);
    expect(pageCapabilities(largePage, "page-0").duplicate).toBe(false);
    expect(() => editPage(largePage, "page-0", "duplicate")).toThrow("5 MiB");
    expect(
      pageCapabilities("x".repeat(MAX_DOCUMENT_BYTES + 1), "page-0").remove,
    ).toBe(false);
  });
  it("retains accepted markup and text entities through a multi-step round trip", () => {
    const down = editPage(doc, "page-0", "down");
    const copy = editPage(down.source, down.pageId, "duplicate");
    const deleted = editPage(copy.source, copy.pageId, "remove");
    const up = editPage(deleted.source, "page-1", "up");
    expect(up.source).toBe(doc);
  });
});
