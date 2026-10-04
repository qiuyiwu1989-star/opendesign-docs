import { describe, expect, it } from "vitest";
import { inspectHtml } from "../../src/html";
import { applyProposal, type StudioVersion } from "../../src/studio-model";
import { buildCandidate, selectionContext } from "./candidate";

const source = `<!DOCTYPE html>\n<html><head><style>.slide { color: #123; }</style></head><body><!-- preserve -->\n<h1 class='title' data-custom="untouched">Original title</h1>\n<p>Private surrounding material</p></body></html>`;
const version: StudioVersion = { id: "revision-1", label: "Original", source };
const target = inspectHtml(source).targets.find(item => item.tag === "h1")!;

describe("selected text agent candidates", () => {
  it("exposes only the selected text context", () => {
    expect(selectionContext(version, target.id)).toEqual({ id: target.id, tag: "h1", text: "Original title" });
    expect(JSON.stringify(selectionContext(version, target.id))).not.toContain("Private surrounding");
  });

  it("rejects nonexistent or non-text targets rather than falling back to another object", () => {
    expect(() => selectionContext(version, "missing-target")).toThrow("不存在");
    expect(() => buildCandidate(version, "missing-target", "Changed")).toThrow("不存在");
    expect(() => selectionContext(version, "")).toThrow("有效");
  });

  it("enforces the source limit before creating a candidate", () => {
    expect(() => buildCandidate({ ...version, source: "x".repeat(200001) }, target.id, "Changed")).toThrow("200000");
    const exactLimit = { ...version, source: source + " ".repeat(200000 - source.length) };
    expect(selectionContext(exactLimit, target.id).text).toBe("Original title");
  });

  it("escapes malicious replacement text and preserves every surrounding source character", () => {
    const after = '<script>alert(1)</script>';
    const candidate = buildCandidate(version, target.id, after);
    expect(version.source).toBe(source);
    const result = applyProposal(version, candidate);
    expect(result).toBe(source.replace("Original title", "&lt;script&gt;alert(1)&lt;/script&gt;"));
    expect(inspectHtml(result).scripts).toBe(0);
    expect(inspectHtml(result).targets.find(item => item.tag === "h1")?.text).toBe(after);
  });

  it("refuses a candidate when either the revision or source has changed", () => {
    const candidate = buildCandidate(version, target.id, "Clearer title");
    expect(() => applyProposal({ ...version, id: "revision-2" }, candidate)).toThrow("版本已变化");
    expect(() => applyProposal({ ...version, source: source.replace("Private", "Updated") }, candidate)).toThrow("版本已变化");
  });

  it("retains existing text and layout limits", () => {
    expect(() => buildCandidate(version, target.id, "Original title")).toThrow("没有变化");
    expect(() => buildCandidate(version, target.id, " ")).toThrow();
    expect(() => buildCandidate(version, target.id, "x".repeat(41))).toThrow("40");
  });
});
