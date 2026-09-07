import "fake-indexeddb/auto";
import { IDBObjectStore } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import {
  discardDraft,
  listDocuments,
  loadDraft,
  saveDocument,
  saveDraft,
  type DocumentRecord,
  type DraftRecord,
} from "./store";

const document = (): DocumentRecord => ({
  id: crypto.randomUUID(),
  name: "draft-fixture.html",
  versions: [
    {
      id: "v1",
      createdAt: "2026-09-06T00:00:00Z",
      label: "original",
      source: "<h1>Original</h1>",
    },
  ],
});
const draftFor = (doc: DocumentRecord): DraftRecord => ({
  id: doc.id,
  baseVersionId: "v1",
  source: "<h1>Applied change</h1>",
  updatedAt: "2026-09-06T01:00:00Z",
  revision: 1,
});
const appended = (doc: DocumentRecord, source: string): DocumentRecord => ({
  ...doc,
  versions: [...doc.versions, { ...doc.versions[0]!, id: "v2", source }],
});

describe("spec 015 local draft persistence", () => {
  it("loads absent drafts and persists first write and revision updates separately from versions", async () => {
    const doc = document();
    await saveDocument(doc);
    expect(await loadDraft(doc.id)).toBeNull();
    const draft = draftFor(doc);
    await saveDraft(draft, 0);
    expect(await loadDraft(doc.id)).toEqual(draft);
    const updated = { ...draft, source: "<h1>Second change</h1>", revision: 2 };
    await saveDraft(updated, 1);
    expect(await loadDraft(doc.id)).toEqual(updated);
    expect((await listDocuments()).find((item) => item.id === doc.id)).toEqual(
      doc,
    );
  });

  it("allows exactly one parallel writer and preserves the winner", async () => {
    const doc = document();
    await saveDocument(doc);
    const a = draftFor(doc);
    const b = { ...a, source: "<h1>Other window</h1>" };
    const outcomes = await Promise.allSettled([
      saveDraft(a, 0),
      saveDraft(b, 0),
    ]);
    expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(outcomes.filter((item) => item.status === "rejected")).toHaveLength(
      1,
    );
    expect(await loadDraft(doc.id)).toEqual(
      outcomes[0]!.status === "fulfilled" ? a : b,
    );
  });

  it("rejects stale base versions and nonexistent documents without destroying a recoverable draft", async () => {
    const doc = document();
    await saveDocument(doc);
    const draft = draftFor(doc);
    await saveDraft(draft, 0);
    await saveDocument(appended(doc, "<h1>Saved elsewhere</h1>"), "v1");
    await expect(saveDraft({ ...draft, revision: 2 }, 1)).rejects.toThrow(
      "正式版本已更新",
    );
    expect(await loadDraft(doc.id)).toEqual(draft);
    await expect(saveDraft(draftFor(document()), 0)).rejects.toThrow(
      "文档不存在",
    );
  });

  it("validates revision progression and draft fields", async () => {
    const doc = document();
    await saveDocument(doc);
    const draft = draftFor(doc);
    for (const invalid of [
      { ...draft, revision: 0 },
      { ...draft, revision: 2 },
      { ...draft, revision: NaN },
      { ...draft, updatedAt: "not-a-date" },
      { ...draft, baseVersionId: "" },
    ])
      await expect(saveDraft(invalid, 0)).rejects.toThrow("草稿信息无效");
    await expect(saveDraft(draft, -1)).rejects.toThrow("草稿信息无效");
    expect(await loadDraft(doc.id)).toBeNull();
  });

  it("checks revisions before discarding and supports an already absent draft", async () => {
    const doc = document();
    await saveDocument(doc);
    const draft = draftFor(doc);
    await saveDraft(draft, 0);
    await expect(discardDraft(doc.id, 0)).rejects.toThrow("另一个窗口");
    expect(await loadDraft(doc.id)).toEqual(draft);
    await expect(discardDraft(doc.id, -1)).rejects.toThrow("草稿版本无效");
    await discardDraft(doc.id, 1);
    expect(await loadDraft(doc.id)).toBeNull();
    await expect(discardDraft(doc.id, 1)).rejects.toThrow("另一个窗口");
    await discardDraft(doc.id, 0);
  });

  it("does not reuse a discarded revision and rejects stale ABA writers and deletes", async () => {
    const doc = document();
    await saveDocument(doc);
    const first = await saveDraft(draftFor(doc), 0);
    await discardDraft(doc.id, first.revision);
    const recreated = await saveDraft(
      { ...draftFor(doc), source: "Recreated" },
      0,
    );
    expect(recreated.revision).toBeGreaterThan(first.revision);
    expect(await loadDraft(doc.id)).toEqual(recreated);
    await expect(
      saveDraft({ ...first, revision: first.revision + 1 }, first.revision),
    ).rejects.toThrow("另一个窗口");
    await expect(discardDraft(doc.id, first.revision)).rejects.toThrow(
      "另一个窗口",
    );
    expect(await loadDraft(doc.id)).toEqual(recreated);
    const continued = await saveDraft(
      { ...recreated, revision: recreated.revision + 1 },
      recreated.revision,
    );
    expect(continued.revision).toBe(recreated.revision + 1);
  });

  it("clears only a draft with the exact saved source and base version", async () => {
    const doc = document();
    await saveDocument(doc);
    const draft = draftFor(doc);
    await saveDraft(draft, 0);
    const next = appended(doc, draft.source);
    await saveDocument(next, "v1");
    expect(await loadDraft(doc.id)).toBeNull();
    expect((await listDocuments()).find((item) => item.id === doc.id)).toEqual(
      next,
    );
  });

  it("retains a divergent or older-base draft when another version is saved", async () => {
    const doc = document();
    await saveDocument(doc);
    const draft = draftFor(doc);
    await saveDraft(draft, 0);
    const next = appended(doc, "<h1>Different source</h1>");
    await saveDocument(next, "v1");
    expect(await loadDraft(doc.id)).toEqual(draft);
    await saveDocument(
      {
        ...next,
        versions: [
          ...next.versions,
          { ...next.versions[1]!, id: "v3", source: draft.source },
        ],
      },
      "v2",
    );
    expect(await loadDraft(doc.id)).toEqual(draft);
  });

  it("retains drafts when a stale version save fails", async () => {
    const doc = document();
    await saveDocument(doc);
    const draft = draftFor(doc);
    await saveDraft(draft, 0);
    await expect(
      saveDocument(appended(doc, draft.source), "outdated"),
    ).rejects.toThrow("另一个窗口");
    expect(await loadDraft(doc.id)).toEqual(draft);
  });

  it("rolls back version and cleanup together if storage fails", async () => {
    const doc = document();
    await saveDocument(doc);
    const draft = draftFor(doc);
    await saveDraft(draft, 0);
    const originalPut = IDBObjectStore.prototype.put;
    const put = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (this: IDBObjectStore, value, key) {
        if (this.name === "documents")
          throw new DOMException("Full", "QuotaExceededError");
        return originalPut.call(this, value, key);
      });
    try {
      await expect(
        saveDocument(appended(doc, draft.source), "v1"),
      ).rejects.toThrow("保存失败");
    } finally {
      put.mockRestore();
    }
    expect(await loadDraft(doc.id)).toEqual(draft);
    expect((await listDocuments()).find((item) => item.id === doc.id)).toEqual(
      doc,
    );
  });

  it("keeps the previous persisted draft when a later draft write fails", async () => {
    const doc = document();
    await saveDocument(doc);
    const draft = draftFor(doc);
    await saveDraft(draft, 0);
    const originalPut = IDBObjectStore.prototype.put;
    const put = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (this: IDBObjectStore, value, key) {
        if (this.name === "drafts")
          throw new DOMException("Full", "QuotaExceededError");
        return originalPut.call(this, value, key);
      });
    try {
      await expect(
        saveDraft({ ...draft, revision: 2, source: "Newer" }, 1),
      ).rejects.toThrow("草稿暂存失败");
    } finally {
      put.mockRestore();
    }
    expect(await loadDraft(doc.id)).toEqual(draft);
  });

  it("rolls back an already queued version write when draft cleanup aborts", async () => {
    const doc = document();
    await saveDocument(doc);
    const draft = draftFor(doc);
    await saveDraft(draft, 0);
    const originalDelete = IDBObjectStore.prototype.delete;
    const remove = vi
      .spyOn(IDBObjectStore.prototype, "delete")
      .mockImplementation(function (this: IDBObjectStore, key) {
        const request = originalDelete.call(this, key);
        if (this.name === "drafts") this.transaction.abort();
        return request;
      });
    try {
      await expect(
        saveDocument(appended(doc, draft.source), "v1"),
      ).rejects.toThrow("保存失败");
    } finally {
      remove.mockRestore();
    }
    expect(await loadDraft(doc.id)).toEqual(draft);
    expect((await listDocuments()).find((item) => item.id === doc.id)).toEqual(
      doc,
    );
  });
});
