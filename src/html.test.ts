import { describe, expect, it } from "vitest";
import { createPreview, inspectHtml, patchText } from "./html";

const original =
  "<!doctype html><html><head><style>h1 {color: red}</style></head><body><h1>你好 &amp; 世界</h1><p>包含<strong>重点</strong>的说明</p><svg><text>图形</text></svg><script>window.bad = true</script></body></html>";
describe("lossless text patches", () => {
  it("recognizes safe leaf text without flattening mixed markup or SVG", () => {
    const report = inspectHtml(original);
    expect(report.targets.map((item) => item.text)).toEqual([
      "你好 & 世界",
      "重点",
    ]);
    expect(report.svg).toBe(1);
    expect(report.scripts).toBe(1);
  });
  it("changes only the exact source span and escapes HTML", () => {
    const target = inspectHtml(original).targets[0]!;
    const patched = patchText(original, target, "<你好> & 新内容");
    expect(patched).toBe(
      original.replace("你好 &amp; 世界", "&lt;你好&gt; &amp; 新内容"),
    );
    expect(inspectHtml(patched).targets[0]!.text).toBe("<你好> & 新内容");
  });
  it("rejects stale targets and oversized input", () => {
    const target = inspectHtml(original).targets[0]!;
    expect(() => patchText(" " + original, target, "changed")).toThrow(
      "页面已经变化",
    );
    expect(() => patchText(original, target, "x".repeat(100001))).toThrow(
      "过长",
    );
  });
  it("preserves byte-equivalent surrounding source over multiple edits", () => {
    let source = original;
    for (const value of ["第一次", "第二次\n新行", "a & b"])
      source = patchText(source, inspectHtml(source).targets[0]!, value);
    expect(source).toBe(original.replace("你好 &amp; 世界", "a &amp; b"));
  });
  it("keeps node identity after clearing a paragraph, including subsequent edits", () => {
    const source = "<p>first</p><p>second</p>";
    const [first, second] = inspectHtml(source).targets;
    const cleared = patchText(source, first!, "");
    const targets = inspectHtml(cleared).targets;
    expect(targets.map((item) => item.id)).toEqual([first!.id, second!.id]);
    expect(patchText(cleared, targets[1]!, "updated")).toBe(
      "<p></p><p>updated</p>",
    );
    expect(patchText(cleared, targets[0]!, "restored")).toBe(
      "<p>restored</p><p>second</p>",
    );
  });
});
describe("inert preview boundary", () => {
  it("removes active content and remote resource attributes; preserves inline CSS/SVG", () => {
    const preview = createPreview(
      original +
        '<iframe srcdoc="bad"></iframe><img src="https://example.com/a" onerror="bad()"><meta http-equiv="refresh" content="0;url=https://example.com"><link rel="stylesheet" href="https://example.com/a.css"><svg><foreignObject>bad</foreignObject><animate attributeName="href" values="javascript:bad()" /></svg>',
      "test-channel-123",
      true,
    );
    expect(preview).not.toContain("window.bad");
    expect(preview).not.toContain("<iframe");
    expect(preview).not.toContain("onerror");
    expect(preview).not.toContain("https://example.com");
    expect(preview).not.toContain("<foreignObject");
    expect(preview).not.toContain("<animate");
    expect(preview).toContain("h1 {color: red}");
    expect(preview).toContain("<text>图形</text>");
    expect(preview).toContain("default-src 'none'");
    expect(preview).toContain("connect-src 'none'");
    expect((preview.match(/<script /g) ?? []).length).toBe(1);
    expect(preview.indexOf("Content-Security-Policy")).toBeLessThan(
      preview.indexOf("<style>"),
    );
  });
  it("does not trust imported bridge IDs, nonces, custom elements or event handlers", () => {
    const preview = createPreview(
      '<p data-doc-text="forged" nonce="fake" is="evil" onclick="bad()">hello</p><a href="javascript:bad()" target="_top" ping="https://example.com">link</a>',
      "test-channel-123",
      false,
    );
    for (const forbidden of [
      "forged",
      'nonce="fake"',
      'is="evil"',
      "onclick=",
      "javascript:bad()",
      'target="_top"',
      "ping=",
    ])
      expect(preview).not.toContain(forbidden);
    expect(preview).toContain(
      `data-doc-text="${inspectHtml("<p>hello</p>").targets[0]!.id}"`,
    );
    expect(() => createPreview(original, '" unsafe', true)).toThrow();
  });
  it("distinguishes normal hyperlinks from render dependencies", () => {
    const report = inspectHtml(
      '<a href="https://example.com">link</a><img src="./a.png"><script src="https://example.com/a.js"></script>',
    );
    expect(report.externalResources).toBe(1);
    expect(report.relativeResources).toBe(1);
  });
});
