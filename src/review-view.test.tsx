import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewPanel } from "./ReviewPanel";
import { reviewView } from "./review-view";
import type { ReviewThread } from "./review";
import type { DocumentRecord } from "./store";

const thread = (id: string, versionId: string, resolved: boolean): ReviewThread => ({
  id, versionId, resolved,
  anchor: { kind: "text", id: "target", quote: "Review target" },
  messages: [], updatedAt: "2026-09-07T00:00:00Z",
});

describe("spec022 concise version-bound review", () => {
  const threads = [thread("one", "v1", false), thread("two", "v1", true), thread("old", "v0", false)];
  it("counts and filters only the selected version without mutating stored opinions", () => {
    expect(reviewView(threads, "v1", "pending")).toEqual({ pending: 1, resolved: 1, visible: [threads[0]] });
    expect(reviewView(threads, "v1", "resolved").visible).toEqual([threads[1]]);
    expect(threads).toHaveLength(3);
    expect(reviewView(threads, "missing", "pending")).toEqual({ pending: 0, resolved: 0, visible: [] });
  });
  it("keeps an unsent reply visible across filters and resolve/reopen, but never across versions", () => {
    expect(reviewView(threads, "v1", "pending", "two").visible).toEqual(threads.slice(0, 2));
    expect(reviewView(threads, "v1", "resolved", "one").visible).toEqual(threads.slice(0, 2));
    expect(reviewView(threads, "v1", "resolved", "old").visible).toEqual([threads[1]]);
    expect(reviewView(threads, "v1", "pending", "one").visible).toEqual([threads[0]]);
  });
  it("uses compact controls and discloses identity/local-only limitations without a permanent form", () => {
    const record = {
      id: "doc", name: "Demo", createdAt: "2026-09-07", updatedAt: "2026-09-07",
      versions: [{ id: "v1", label: "版本 1", source: "<p>Demo</p>", createdAt: "2026-09-07" }],
    } as DocumentRecord;
    const html = renderToStaticMarkup(<ReviewPanel record={record} versionId="v1" onDirty={() => {}} onLocate={() => {}} />);
    expect(html).toContain('<h2>批注</h2>');
    expect(html).toContain('<details class="review-details">');
    expect(html).toContain("不代表已验证身份");
    expect(html).toContain("尚未云端共享");
    expect(html).toContain('aria-label="筛选批注"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("一起审阅，从留下意见开始");
  });
});
