import { expect, it, describe, vi } from "vitest";
import { rememberSelection, restoredSelection } from "./workspace-selection";
describe("spec023 refresh continuity found during resource QA", () => {
  it("restores a known document rather than the first database row", () => {
    const store = { getItem: vi.fn(() => "second"), setItem: vi.fn() };
    expect(restoredSelection(["first", "second"], () => store)).toBe("second");
    rememberSelection("second", () => store);
    expect(store.setItem).toHaveBeenCalledWith("opendesign-docs-active-document", "second");
  });
  it("falls back safely for missing records, empty databases and denied storage", () => {
    const store = { getItem: () => "removed", setItem: vi.fn() };
    expect(restoredSelection(["first"], () => store)).toBe("first");
    expect(restoredSelection([], () => store)).toBe("");
    const denied = () => { throw new Error("SecurityError"); };
    expect(restoredSelection(["first"], denied)).toBe("first");
    expect(() => rememberSelection("first", denied)).not.toThrow();
    rememberSelection("", () => store);
    expect(store.setItem).not.toHaveBeenCalled();
  });
});
