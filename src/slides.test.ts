import { describe, expect, it } from "vitest";
import { Script } from "node:vm";
import {
  inspectSlides,
  patchPlacement,
  validatePlacement,
  createSlidePreview,
} from "./slides";
import { slideDemo, demo } from "./demo";
describe("spec 014 fixed HTML slide editing", () => {
  it("recognizes explicit peer pages, not ordinary long documents", () => {
    const pages = inspectSlides(slideDemo);
    expect(pages).toHaveLength(2);
    expect(pages[0]!.objects).toHaveLength(4);
    expect(inspectSlides(demo)).toEqual([]);
    expect(
      inspectSlides(
        '<div><section class="slide">a</section></div><section class="slide">b</section>',
      ),
    ).toEqual([]);
  });
  it("supports data-slide and hides nested slide candidates inside a group", () => {
    expect(
      inspectSlides(
        '<section data-slide><div class="slide">nested</div></section>',
      ),
    ).toHaveLength(1);
  });
  it("exposes nested objects and extracts the actual nested heading", () => {
    const source =
      '<div class="slide"><div class="bg"></div><div class="sc"><div class="h1">Title <span>accent</span></div><p>Body</p></div></div>';
    const page = inspectSlides(source)[0]!;
    expect(page.title).toBe("Title accent");
    expect(page.objects.find((o) => o.id === "object-0-1-1")).toMatchObject({
      tag: "p",
      depth: 1,
      title: "Body",
    });
    const object = page.objects.find((o) => o.title === "Body")!;
    expect(patchPlacement(source, object, { x: 1, y: 2, scale: 1 })).toContain(
      '<p style="translate:1px 2px!important;scale:1!important;">Body</p>',
    );
  });
  it("patches only one opening tag and preserves all content and other styles", () => {
    const source =
      '<section class="slide"><h1 style="color:red">Hello <b>world</b></h1><p>keep</p></section>';
    const target = inspectSlides(source)[0]!.objects[0]!;
    const next = patchPlacement(source, target, { x: 20, y: -10, scale: 1.2 });
    expect(next).toBe(
      source.replace(
        'style="color:red"',
        'style="color:red;translate:20px -10px!important;scale:1.2!important;"',
      ),
    );
    expect(inspectSlides(next)[0]!.objects[0]!.id).toBe(target.id);
    expect(next).toContain("Hello <b>world</b>");
  });
  it("inserts style on void objects and escapes existing attribute values", () => {
    const source =
      '<section class="slide"><img alt="image"/><div style=\'font-family:"A"\'>a</div></section>';
    const objects = inspectSlides(source)[0]!.objects;
    expect(
      patchPlacement(source, objects[0]!, { x: 0, y: 0, scale: 1 }),
    ).toContain('style="translate:0px 0px!important;scale:1!important;"/>');
    expect(
      patchPlacement(source, objects[1]!, { x: 1, y: 2, scale: 1 }),
    ).toContain("font-family:&quot;A&quot;");
  });
  it("coalesces repeated placement edits without dropping unrelated styles", () => {
    let source =
      '<section class="slide"><p style="color:red">hello</p></section>';
    for (let x = 0; x < 100; x++) {
      source = patchPlacement(source, inspectSlides(source)[0]!.objects[0]!, {
        x,
        y: 0,
        scale: 1,
      });
    }
    expect(source).toBe(
      '<section class="slide"><p style="color:red;translate:99px 0px!important;scale:1!important;">hello</p></section>',
    );
  });
  it("rejects stale source targets and invalid geometry", () => {
    const target = inspectSlides(slideDemo)[0]!.objects[0]!;
    expect(() =>
      patchPlacement(" " + slideDemo, target, { x: 0, y: 0, scale: 1 }),
    ).toThrow();
    for (const p of [
      { x: NaN, y: 0, scale: 1 },
      { x: 0, y: 0, scale: 0 },
      { x: 0, y: Infinity, scale: 1 },
      { x: 20000, y: 0, scale: 1 },
    ])
      expect(() => validatePlacement(p)).toThrow();
  });
  it("removes imported scripts/spoofed metadata and only installs trusted bridge", () => {
    const preview = createSlidePreview(
      slideDemo.replace(
        '<section class="slide">',
        '<section class="slide" data-doc-object="forged">',
      ) + "<script>evil()</script>",
      "test-channel-123",
      "page-0",
    );
    expect(preview).not.toContain("evil()");
    expect(preview).not.toContain("forged");
    expect(preview).toContain('data-doc-object="object-0-0"');
    expect(preview).toContain('data-doc-slide="page-1"');
    expect(preview.match(/<script /g) || []).toHaveLength(1);
    const script = preview.match(
      /<script nonce="test-channel-123">([\s\S]*?)<\/script>/,
    )![1]!;
    expect(() => new Script(script)).not.toThrow();
    expect(preview).toContain("connect-src 'none'");
  });
});
