import { describe, expect, it } from "vitest";
import { Script } from "node:vm";
import {
  createThumbnailFactory,
  MAX_VISIBLE_THUMBNAILS,
  visibleThumbnailIds,
} from "./thumbnail-preview";

describe("spec 017 static thumbnails", () => {
  const source = `<!doctype html><style>.slide{display:none;width:1280px;height:720px}.slide.active{display:flex}</style>
    <main><section class="slide active"><h1>First title</h1><img src="data:image/png;base64,FIRST"></section>
    <section class="slide"><h1>Second title</h1><img src="data:image/png;base64,SECOND"></section></main>`;
  it("projects the requested page and preserves sibling shells and active layout", () => {
    const factory = createThumbnailFactory(source);
    const first = factory("page-0"),
      second = factory("page-1");
    expect(first).toContain("First title");
    expect(first).not.toContain("Second title");
    expect(second).toContain("Second title");
    expect(second).not.toContain("First title");
    expect(second).toContain('class="slide active" data-doc-slide="page-0"');
    expect(second).toContain(
      'data-doc-slide="page-1" data-doc-thumbnail-current=""',
    );
    expect(second).toContain(".slide.active{display:flex}");
    expect(second).toContain("page.classList.add('active')");
    expect(source).toContain("First title");
  });
  it("never executes imported scripts or exposes the editing bridge", () => {
    const preview = createThumbnailFactory(
      source.replace(
        "<main>",
        `<script nonce="docs-static-thumbnail">malicious()</script><main onclick="attack()" data-doc-thumbnail-current>`,
      ),
    )("page-1");
    expect(preview).not.toContain("malicious()");
    expect(preview).not.toContain("onclick");
    expect(preview).not.toContain("attack()");
    expect(preview).not.toContain("postMessage");
    expect(preview).not.toContain("addEventListener");
    expect(preview).not.toContain('tabindex="0"');
    expect(preview.match(/<script\b/g)).toHaveLength(1);
    const script = preview.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1]!;
    expect(() => new Script(script)).not.toThrow();
    expect(preview).toContain("connect-src 'none'");
    expect(preview).toContain("img-src data:");
    expect(preview).toContain("pointer-events:none!important");
  });
  it("removes remote navigation, embeds and images using existing sanitizer", () => {
    const preview = createThumbnailFactory(
      `<section class="slide"><iframe srcdoc="bad"></iframe><img src="https://private.example/image"><a href="https://private.example">link</a><form action="https://private.example"><input autofocus></form></section>`,
    )("page-0");
    expect(preview).not.toContain("<iframe");
    expect(preview).not.toContain("https://private.example");
    expect(preview).not.toContain("autofocus");
    expect(preview).toContain("disabled");
  });
  it("does not duplicate other pages' image assets and preserves nested CSS", () => {
    const large = "A".repeat(100_000);
    const factory = createThumbnailFactory(
      `<section class="slide" style="background-image:url(data:image/png;base64,${large})"><div><style>.title{color:red}</style></div><img src="data:image/png;base64,${large}"></section><section class="slide"><h1 class="title">Small</h1></section>`,
    );
    const second = factory("page-1");
    expect(second.length).toBeLessThan(12_000);
    expect(second).not.toContain(large);
    expect(second).toContain(".title{color:red}");
    expect(factory("page-0")).toContain(large);
    expect(factory("page-1")).toBe(second);
    expect(() => factory("page-90")).toThrow("页面不存在");
  });
  it("hard caps visible frames and always includes a visible selected page", () => {
    const visible = visibleThumbnailIds(
      Array.from({ length: 100 }, (_, index) => index),
      0,
    );
    expect(visible).toHaveLength(MAX_VISIBLE_THUMBNAILS);
    expect(visible).toContain(49);
    expect(visible[0]).toBe(0);
    expect(visibleThumbnailIds([], 12)).toEqual([12]);
    expect(visibleThumbnailIds([1, 1, 2, -1, 2.5], 0)).toEqual([1, 2]);
  });
});
