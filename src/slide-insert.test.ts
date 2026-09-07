import { describe, expect, it } from "vitest";
import {
  insertSlideText,
  insertSlideImage,
  slideInsertionAvailability,
  MAX_DOCUMENT_BYTES,
} from "./slide-insert";
import { inspectSlides, patchPlacement } from "./slides";
import { inspectHtml, patchText } from "./html";
import { slideDemo } from "./demo";

const png = (width = 1, height = 1) => {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
};
describe("spec 016 local slide insertion", () => {
  it("inserts a selectable text object without changing any original bytes", () => {
    const next = insertSlideText(
      slideDemo,
      "page-0",
      "hello <b>world</b> & more",
    );
    const added = next.source.match(
      /\n<p data-docs-inserted[\s\S]*?<\/p>\n/,
    )![0];
    expect(next.source.replace(added, "")).toBe(slideDemo);
    const object = inspectSlides(next.source)[0]!.objects.find(
      (o) => o.id === next.objectId,
    )!;
    expect(object.tag).toBe("p");
    expect(object.title).toBe("hello <b>world</b> & more");
    expect(next.source).toContain("&lt;b&gt;world&lt;/b&gt; &amp; more");
    expect(
      patchPlacement(next.source, object, { x: 10, y: 20, scale: 1.2 }),
    ).toContain("translate:10px 20px!important");
    const target = inspectHtml(next.source).targets.find(
      (t) => t.text === object.title,
    )!;
    expect(patchText(next.source, target, "edited")).toContain(">edited</p>");
  });
  it("keeps existing IDs stable through repeated append and restores by source snapshot", () => {
    const first = insertSlideText(slideDemo, "page-1"),
      second = insertSlideText(first.source, "page-1", "second");
    expect(second.objectId).not.toBe(first.objectId);
    expect(
      inspectSlides(second.source)[1]!.objects.some(
        (o) => o.id === first.objectId,
      ),
    ).toBe(true);
    const history = [slideDemo, first.source, second.source];
    history.pop();
    expect(history.at(-1)).toBe(first.source);
    history.pop();
    expect(history.at(-1)).toBe(slideDemo);
  });
  it("rejects static or unknown positioning instead of shifting existing descendants", () => {
    for (const style of ["", "position:static;top:20px", "top:20px"]) {
      const source = `<section data-slide style="${style}"><p style="position:absolute;left:20px">Keep</p></section>`;
      expect(slideInsertionAvailability(source, "page-0").allowed).toBe(false);
      expect(() => insertSlideText(source, "page-0")).toThrow();
    }
  });
  it("never rewrites absolute, fixed or sticky page positioning", () => {
    for (const position of ["absolute", "fixed", "sticky"]) {
      const source = `<style>.deck .slide{position:${position}}.slide>*{position:relative}.slide::after{position:absolute}</style><main class="deck"><div class="slide">keep</div></main>`;
      const next = insertSlideText(source, "page-0").source;
      expect(next).toContain('<div class="slide">keep');
      expect(next).not.toContain('position:relative!important;"');
    }
  });
  it("keeps explicit local positioning alongside font imports without fetching them", () => {
    const source = `<style>@import url('https://fonts.googleapis.com/css2?family=Sans:wght@300;400');.slide{position:absolute}</style><div class="slide">keep</div>`;
    expect(slideInsertionAvailability(source, "page-0").allowed).toBe(true);
    expect(insertSlideText(source, "page-0").source).toContain(
      '<div class="slide">keep',
    );
  });
  it("refuses unsupported cascades, non-pages, unsafe contexts and object overflow", () => {
    const cases = [
      "<main>ordinary</main>",
      "<svg><g data-slide></g></svg>",
      "<p data-slide>no</p>",
      '<style>@media(min-width:1px){.slide{position:absolute}}</style><div class="slide"></div>',
      '<style>.slide{position:absolute}.slide.active{position:static}</style><div class="slide active"></div>',
      '<style>.slide{position:var(--position)}</style><div class="slide"></div>',
      '<link rel="stylesheet" href="remote.css"><div class="slide"></div>',
      '<style>.slide{all:unset}</style><div class="slide"></div>',
      '<style>.slide{position:absolute}.slide[title=".other"]{position:static}</style><div class="slide" title=".other"></div>',
      '<style>.slide{position:absolute;ALL:unset}</style><div class="slide"></div>',
      '<style>.slide{p\\6fsition:absolute}</style><div class="slide"></div>',
      `<div class="slide">${"<p>x</p>".repeat(400)}</div>`,
    ];
    for (const source of cases) {
      expect(slideInsertionAvailability(source, "page-0").allowed).toBe(false);
      expect(() => insertSlideText(source, "page-0")).toThrow();
    }
    expect(() => insertSlideText(slideDemo, "page-99")).toThrow();
    expect(() => insertSlideText(slideDemo, "page-0", "")).toThrow();
  });
  it("inserts embedded bitmap with bounded display size and escaped alt", () => {
    const source = insertSlideImage(slideDemo, "page-0", {
      dataUrl: png(1600, 1200),
      width: 1600,
      height: 1200,
      alt: 'photo" onerror="evil',
    });
    const obj = inspectSlides(source.source)[0]!.objects.find(
      (o) => o.id === source.objectId,
    )!;
    expect(obj.tag).toBe("img");
    expect(obj.raw).toContain("width:480px!important;height:360px!important");
    expect(obj.raw).toContain("photo&quot; onerror=&quot;evil");
    expect(
      patchPlacement(source.source, obj, { x: 1, y: 2, scale: 2 }),
    ).toContain("scale:2!important");
  });
  it("rejects script, SVG, oversized and dimension-forged image sources", () => {
    for (const dataUrl of [
      "javascript:alert(1)",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "https://example.com/image.png",
      png(10000, 10000),
    ])
      expect(() =>
        insertSlideImage(slideDemo, "page-0", {
          dataUrl,
          width: 1,
          height: 1,
          alt: "x",
        }),
      ).toThrow();
    expect(() =>
      insertSlideImage(slideDemo, "page-0", {
        dataUrl: png(),
        width: 2,
        height: 1,
        alt: "x",
      }),
    ).toThrow();
  });
  it("limits final UTF-8 bytes for text, including escaped and multi-byte content", () => {
    const base = '<div class="slide" style="position:relative"></div>';
    const overhead = new TextEncoder().encode(
      insertSlideText(base, "page-0", "x").source,
    ).byteLength;
    const exact = base + " ".repeat(MAX_DOCUMENT_BYTES - overhead);
    expect(
      new TextEncoder().encode(insertSlideText(exact, "page-0", "x").source)
        .byteLength,
    ).toBe(MAX_DOCUMENT_BYTES);
    expect(() => insertSlideText(exact, "page-0", "中")).toThrow("5 MB");
    expect(() => insertSlideText(exact, "page-0", "&")).toThrow("5 MB");
  });
  it("rejects image base64 expansion and accumulated images over the document budget", () => {
    const bytes = new Uint8Array(4 * 1024 * 1024);
    bytes.set(
      Uint8Array.from(atob(png().split(",")[1]!), (c) => c.charCodeAt(0)),
    );
    const large = {
      dataUrl: `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`,
      width: 1,
      height: 1,
      alt: "large",
    };
    expect(() => insertSlideImage(slideDemo, "page-0", large)).toThrow("5 MB");
    const image = { dataUrl: png(), width: 1, height: 1, alt: "small" };
    const once = insertSlideImage(slideDemo, "page-0", image).source;
    const nearLimit =
      once +
      " ".repeat(
        MAX_DOCUMENT_BYTES - new TextEncoder().encode(once).byteLength,
      );
    expect(() => insertSlideImage(nearLimit, "page-0", image)).toThrow("5 MB");
  });
});
