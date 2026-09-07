import { describe, expect, it } from "vitest";
import { inspectHtml, createPreview } from "./html";
import {
  addThread,
  updateThread,
  reviewMessage,
  validateAnchor,
  type ReviewRecord,
} from "./review";
import { editHistory, historyOf, moveHistory } from "./history";

describe("spec 013 review anchors", () => {
  const source = "<h1>标题</h1><p>内容</p>";
  it("only accepts exact original-version text and known nodes", () => {
    const target = inspectHtml(source).targets[0]!;
    expect(
      validateAnchor(
        { kind: "text", id: target.id, quote: target.text },
        source,
      ),
    ).toMatchObject({ quote: "标题" });
    expect(() =>
      validateAnchor({ kind: "text", id: target.id, quote: "旧标题" }, source),
    ).toThrow();
    expect(() =>
      validateAnchor({ kind: "text", id: "unknown", quote: "标题" }, source),
    ).toThrow();
  });
  it("rejects invalid, non-finite and off-viewport regions", () => {
    const region = {
      kind: "region",
      x: 20,
      y: 120,
      width: 200,
      height: 80,
      viewportWidth: 800,
    };
    expect(validateAnchor(region, source)).toEqual(region);
    for (const change of [
      { x: -1 },
      { y: NaN },
      { height: Infinity },
      { width: 1000 },
      { height: 1 },
      { viewportWidth: 0 },
      { width: "200" },
    ])
      expect(() => validateAnchor({ ...region, ...change }, source)).toThrow();
  });
  it("preserves original opinions through replies and resolve/reopen", () => {
    const empty: ReviewRecord = { id: "doc", revision: 0, threads: [] };
    const anchor = validateAnchor(
      {
        kind: "region",
        x: 20,
        y: 120,
        width: 200,
        height: 80,
        viewportWidth: 800,
      },
      source,
    );
    const first = addThread(
      empty,
      "v1",
      anchor,
      reviewMessage("小邱", "请简化这里"),
    );
    const reply = updateThread(
      first,
      first.threads[0]!.id,
      reviewMessage("小邱", "已处理"),
    );
    const resolved = updateThread(reply, reply.threads[0]!.id, true);
    const reopened = updateThread(resolved, resolved.threads[0]!.id, false);
    expect(first.threads[0]!.messages).toHaveLength(1);
    expect(reopened.revision).toBe(4);
    expect(reopened.threads[0]).toMatchObject({
      versionId: "v1",
      resolved: false,
      anchor,
    });
    expect(reopened.threads[0]!.messages).toHaveLength(2);
  });
  it("rejects blank or excessive comments and missing threads", () => {
    expect(() => reviewMessage("", "内容")).toThrow();
    expect(() => reviewMessage("姓名", " ")).toThrow();
    expect(() => reviewMessage("姓名", "x".repeat(5001))).toThrow();
    expect(() =>
      updateThread({ id: "d", revision: 0, threads: [] }, "missing", true),
    ).toThrow();
  });
  it("keeps annotation tools in the trusted bridge, not source HTML", () => {
    const preview = createPreview(source, "review-channel-123", false, 0, true);
    expect(preview).toContain("const reviewing = true");
    expect(preview).toContain("review-locate");
    expect(preview).toContain("anchor-unavailable");
    expect(preview).toContain("nonce-review-channel-123");
    expect(source).not.toContain("annotation");
  });
});
describe("spec 013 bounded undo and redo", () => {
  it("roundtrips edits and drops redo after a new edit", () => {
    const edited = editHistory(editHistory(historyOf("a"), "b"), "c");
    const undone = moveHistory(edited, "undo");
    expect(undone.present).toBe("b");
    expect(moveHistory(undone, "redo").present).toBe("c");
    expect(editHistory(undone, "d").future).toEqual([]);
    expect(moveHistory(historyOf("a"), "undo").present).toBe("a");
    expect(editHistory(edited, "c")).toBe(edited);
  });
  it("bounds retained history", () => {
    let state = historyOf("0");
    for (let i = 1; i < 100; i++) state = editHistory(state, String(i));
    expect(state.past).toHaveLength(20);
    expect(state.present).toBe("99");
  });
});
