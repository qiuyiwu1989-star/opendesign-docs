import { describe, expect, it } from "vitest";
import { readSourceTree } from "./source-tree";

describe("one-source immutable parse snapshot", () => {
  it("reuses only the current exact source and indexes source elements", () => {
    const source = '<main><p style="color:red">Text</p></main>';
    const first = readSourceTree(source), second = readSourceTree(source);
    expect(second).toBe(first);
    expect([...first.elementsByStart.values()].map(node => node.tagName)).toEqual(["main", "p"]);
    expect(readSourceTree(" " + source)).not.toBe(first);
    expect(readSourceTree(source)).not.toBe(first);
  });

  it("retains duplicate-attribute parse evidence without modifying source", () => {
    const source = '<p class="a" class="b">Text</p>';
    const result = readSourceTree(source);
    expect(result.duplicateAttributeOffsets).toHaveLength(1);
    expect(source).toContain('class="a" class="b"');
  });
});
