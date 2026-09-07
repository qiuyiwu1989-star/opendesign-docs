import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import {
  SlidePresentation,
  presentationIndexForKey,
} from "./SlidePresentation";
import { inspectSlides } from "./slides";

describe("presentation navigation", () => {
  it("steps and clamps at both boundaries", () => {
    for (const key of ["ArrowRight", "ArrowDown", "PageDown", " "]) {
      expect(presentationIndexForKey(0, 3, key)).toBe(1);
      expect(presentationIndexForKey(2, 3, key)).toBe(2);
    }
    for (const key of ["ArrowLeft", "ArrowUp", "PageUp"]) {
      expect(presentationIndexForKey(2, 3, key)).toBe(1);
      expect(presentationIndexForKey(0, 3, key)).toBe(0);
    }
  });
  it("handles start/end without treating editor shortcuts as presentation commands", () => {
    expect(presentationIndexForKey(1, 3, "Home")).toBe(0);
    expect(presentationIndexForKey(1, 3, "End")).toBe(2);
    expect(presentationIndexForKey(0, 1, "End")).toBe(0);
    expect(presentationIndexForKey(0, 0, "ArrowRight")).toBe(0);
    expect(presentationIndexForKey(1, 3, "z")).toBeNull();
    expect(presentationIndexForKey(1, 3, "Escape")).toBeNull();
  });
});

describe("presentation render", () => {
  it("starts at the requested page and projects only isolated static content", () => {
    const source =
      '<html><body><section class="slide"><h1>First slide</h1></section><section class="slide"><h1>Second slide</h1><script>window.untrustedCode=1</script><img src="https://private.example/test.png" onload="window.bad=1"></section></body></html>';
    const pages = inspectSlides(source);
    const output = renderToStaticMarkup(
      <SlidePresentation
        source={source}
        pages={pages}
        initialPageId={pages[1]!.id}
        onClose={() => {}}
      />,
    );
    const nodes: DefaultTreeAdapterMap["element"][] = [];
    function visit(node: DefaultTreeAdapterMap["node"]) {
      if ("tagName" in node) nodes.push(node);
      if ("childNodes" in node) node.childNodes.forEach(visit);
    }
    visit(parse(output));
    const frames = nodes.filter((n) => n.tagName === "iframe");
    expect(frames).toHaveLength(1);
    const attrs = Object.fromEntries(
      frames[0]!.attrs.map((a) => [a.name, a.value]),
    );
    expect(attrs.sandbox).toBe("allow-scripts");
    expect(attrs.tabindex).toBe("-1");
    expect(attrs.srcdoc).toContain("Second slide");
    expect(attrs.srcdoc).not.toContain("First slide");
    expect(attrs.srcdoc).not.toContain("untrustedCode");
    expect(attrs.srcdoc).not.toContain("window.bad");
    expect(attrs.srcdoc).not.toContain("private.example");
    expect(attrs.srcdoc).not.toContain("select-object");
    const dialog = nodes.find((n) =>
      n.attrs.some((a) => a.name === "role" && a.value === "dialog"),
    );
    expect(dialog).toBeDefined();
    expect(output).toContain("2 / 2");
    expect(source).toContain("window.untrustedCode=1");
  });
});
