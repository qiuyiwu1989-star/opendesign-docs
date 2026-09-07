import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { listDocuments, saveDocument, type DocumentRecord } from "./store";
import { loadReview, saveReview } from "./store";
import { addThread, reviewMessage, updateThread } from "./review";
import { inspectHtml } from "./html";

const doc = (): DocumentRecord => ({
  id: crypto.randomUUID(),
  name: "test.html",
  versions: [
    {
      id: "v1",
      createdAt: "2026-09-06T00:00:00Z",
      label: "original",
      source: "<h1>original</h1>",
    },
  ],
});

describe("spec 013 independent review store", () => {
  it("persists version-bound comments without changing HTML and rejects stale writes", async () => {
    const original = doc();
    await saveDocument(original);
    const target = inspectHtml(original.versions[0]!.source).targets[0]!;
    const first = addThread(
      await loadReview(original.id),
      "v1",
      { kind: "text", id: target.id, quote: target.text },
      reviewMessage("本机用户", "测试意见"),
    );
    await saveReview(first, 0);
    expect(await loadReview(original.id)).toEqual(first);
    expect((await listDocuments()).find((d) => d.id === original.id)).toEqual(
      original,
    );
    const next = updateThread(first, first.threads[0]!.id, true);
    await saveReview(next, 1);
    await expect(saveReview({ ...first, revision: 2 }, 1)).rejects.toThrow(
      "另一个窗口",
    );
    expect(await loadReview(original.id)).toEqual(next);
    await saveDocument(
      {
        ...original,
        versions: [
          ...original.versions,
          { ...original.versions[0]!, id: "v2", source: "<h1>new</h1>" },
        ],
      },
      "v1",
    );
    expect((await loadReview(original.id)).threads[0]!.versionId).toBe("v1");
  });
  it("rejects orphan versions and leaves storage unchanged", async () => {
    const original = doc();
    await saveDocument(original);
    const empty = await loadReview(original.id);
    const next = addThread(
      empty,
      "missing",
      {
        kind: "region",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        viewportWidth: 800,
      },
      reviewMessage("本机用户", "测试"),
    );
    await expect(saveReview(next, 0)).rejects.toThrow("保存文档版本");
    expect(await loadReview(original.id)).toEqual(empty);
  });
});
describe("local version store", () => {
  it("persists original plus appended version and retrieves both", async () => {
    const original = doc();
    await saveDocument(original);
    const next = {
      ...original,
      versions: [
        ...original.versions,
        { ...original.versions[0]!, id: "v2", source: "<h1>edited</h1>" },
      ],
    };
    await saveDocument(next, "v1");
    expect(
      (await listDocuments()).find((row) => row.id === original.id),
    ).toEqual(next);
  });
  it("rejects a stale writer without overwriting latest data", async () => {
    const original = doc();
    await saveDocument(original);
    const next = {
      ...original,
      versions: [...original.versions, { ...original.versions[0]!, id: "v2" }],
    };
    await saveDocument(next, "v1");
    await expect(saveDocument(original, "v1")).rejects.toThrow("另一个窗口");
    expect(
      (await listDocuments()).find((row) => row.id === original.id),
    ).toEqual(next);
  });
  it("does not silently replace an existing document on import", async () => {
    const original = doc();
    await saveDocument(original);
    await expect(saveDocument(original)).rejects.toThrow("另一个窗口");
  });
});
