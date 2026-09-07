import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isSingleBackground, patchBackgroundImage } from "./background-image";
import { inspectSlides, patchPlacement } from "./slides";
import { MAX_DOCUMENT_BYTES } from "./slide-insert";
const bytes = readFileSync(
  new URL("../tests/assets/icon-192.png", import.meta.url),
);
const image = {
  dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
  width: 192,
  height: 192,
  alt: "QA",
};
const source = `<!doctype html><style>.slide{position:relative}.art{background:url(old.png) center/cover no-repeat}</style><section class="slide"><div class="art" style="width:200px;height:150px">Keep</div><p>Untouched &amp; text</p></section>`;
const target = (s: string) => inspectSlides(s)[0]!.objects[0]!;
describe("spec018 single background replacement", () => {
  it("accepts only one URL, not gradients, layers or image-set", () => {
    for (const v of [
      'url("data:image/png;base64,AAAA")',
      "url(old.png)",
      "url('old.png')",
    ])
      expect(isSingleBackground(v)).toBe(true);
    for (const v of [
      null,
      "none",
      'url("a"),url("b")',
      "linear-gradient(red,blue)",
      'image-set(url("a") 1x)',
      'url("a\\b")',
    ])
      expect(isSingleBackground(v)).toBe(false);
  });
  it("patches only the start-tag style, retains layout and CSS background settings", () => {
    const next = patchBackgroundImage(
      source,
      target(source),
      image,
      'url("old.png")',
    );
    expect(next).toContain(
      ".art{background:url(old.png) center/cover no-repeat}",
    );
    expect(next).toContain(
      'style="width:200px;height:150px;--docs-background-start:1;',
    );
    expect(next).toContain("Keep</div><p>Untouched &amp; text</p>");
    expect(inspectSlides(next)[0]!.objects[0]!.style).toContain(
      `background-image:url("${image.dataUrl}")!important`,
    );
  });
  it("coalesces repeated background replacements alternating with movement", () => {
    let next = source;
    for (let i = 0; i < 30; i++) {
      next = patchBackgroundImage(next, target(next), image, 'url("old.png")');
      next = patchPlacement(next, target(next), { x: 12, y: 14, scale: 1 });
    }
    const once = patchBackgroundImage(
      source,
      target(source),
      image,
      'url("old.png")',
    );
    expect(next).toBe(
      patchPlacement(once, target(once), { x: 12, y: 14, scale: 1 }),
    );
  });
  it("rejects stale, malformed and active style targets without changing source", () => {
    expect(() =>
      patchBackgroundImage(" " + source, target(source), image, 'url("a")'),
    ).toThrow("对象已变化");
    for (const tag of [
      '<div style="x:/*">',
      '<div style="x" style="y">',
      '<div onclick="bad()">',
    ]) {
      const s = `<section class="slide">${tag}A</div></section>`;
      expect(() =>
        patchBackgroundImage(s, target(s), image, 'url("a")'),
      ).toThrow();
    }
    expect(() =>
      patchBackgroundImage(source, target(source), image, "none"),
    ).toThrow();
    expect(() =>
      patchBackgroundImage(
        source,
        target(source),
        { ...image, dataUrl: "javascript:bad()" },
        'url("a")',
      ),
    ).toThrow();
  });
  it("enforces the final document byte budget", () => {
    const s = source + " ".repeat(MAX_DOCUMENT_BYTES - source.length);
    expect(() => patchBackgroundImage(s, target(s), image, 'url("a")')).toThrow(
      "5 MB",
    );
  });
});
