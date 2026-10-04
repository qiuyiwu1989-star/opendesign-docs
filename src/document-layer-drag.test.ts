import { describe, expect, it } from "vitest";
import { canMoveDocumentObjectTo, moveDocumentObjectTo } from "./document-edit";
import { inspectDocumentObjects } from "./document-objects";
import { editHistory, historyOf, moveHistory } from "./history";
const objects = (source: string) => inspectDocumentObjects(source)[0]!.objects;
describe("long document layer drag", () => {
  it("moves a complete block across multiple siblings in a single undo step", () => {
    const source = '<main>\n<p class=one>A <b>B</b></p>\n<p>C</p>\n<p>D</p>\n</main>';
    const list = objects(source);
    const result = moveDocumentObjectTo(source, list[0]!, list[2]!, "after");
    expect(result.source).toBe('<main>\n\n<p>C</p>\n<p>D</p><p class=one>A <b>B</b></p>\n</main>');
    expect(objects(result.source).find(item => item.id === result.objectId)?.title).toBe("A B");
    const history = editHistory(historyOf(source), result.source);
    expect(history.past).toHaveLength(1);
    expect(moveHistory(history, "undo").present).toBe(source);
    expect(moveHistory(moveHistory(history, "undo"), "redo").present).toBe(result.source);
  });
  it("supports before/after in both directions, leaving unrelated bytes intact", () => {
    const source = '<p>A</p>  <p>B</p>\n<p>C</p><!--outside--><script>keep()</script>';
    const list = objects(source);
    expect(moveDocumentObjectTo(source, list[2]!, list[0]!, "before").source).toBe('<p>C</p><p>A</p>  <p>B</p>\n<!--outside--><script>keep()</script>');
    expect(moveDocumentObjectTo(source, list[0]!, list[2]!, "before").source).toBe('  <p>B</p>\n<p>A</p><p>C</p><!--outside--><script>keep()</script>');
    expect(moveDocumentObjectTo(source, list[2]!, list[0]!, "after").source).toBe('<p>A</p><p>C</p>  <p>B</p>\n<!--outside--><script>keep()</script>');
  });
  it("does not create an edit for already adjacent positions", () => {
    const source = '<p>A</p>\n   <p>B</p>';
    const [a, b] = objects(source);
    expect(moveDocumentObjectTo(source, a!, b!, "before").source).toBe(source);
    expect(moveDocumentObjectTo(source, b!, a!, "after").source).toBe(source);
  });
  it("rejects real-parent differences even when filtered wrappers share the visible root", () => {
    const source = '<main><p>A</p></main><aside><p>B</p></aside>';
    const [a, b] = objects(source);
    expect(canMoveDocumentObjectTo(source, a!, b!)).toBe(false);
    expect(() => moveDocumentObjectTo(source, a!, b!, "before")).toThrow();
  });
  it.each(['<!--boundary-->', 'plain text', '<script>keep()</script>', '<svg><rect/></svg>'])("rejects crossed unsafe boundaries: %s", boundary => {
    const source = `<p>A</p>${boundary}<p>B</p>`;
    const [a, b] = objects(source);
    expect(canMoveDocumentObjectTo(source, a!, b!)).toBe(false);
  });
  it("rejects stale targets, self drops and nested targets", () => {
    const source = '<section><p>A</p></section><p>B</p>';
    const [section, a, b] = objects(source);
    expect(canMoveDocumentObjectTo(source, section!, a!)).toBe(false);
    expect(canMoveDocumentObjectTo(source, b!, b!)).toBe(false);
    expect(() => moveDocumentObjectTo(source.replace('A', 'Changed'), section!, b!, "after")).toThrow();
  });
});
