import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectHtml } from "./html";
import * as html from "./html";
import {
  MAX_BACKUP_BYTES,
  freshProjectRecords,
  parseProjectBackup,
  serializeProjectBackup,
  validateProjectBackup,
  type ProjectBackup,
} from "./project-backup";
import {
  exportProjectBackup,
  restoreProjectBackup,
  listDocuments,
  loadReview,
  loadDraft,
  saveDocument,
  saveReview,
  saveDraft,
} from "./store";

const stamp = "2026-09-07T01:02:03.000Z";
function fixture(): ProjectBackup {
  const source =
    '<!doctype html><h1>Saved title</h1><script>throw new Error("never execute")</script>';
  const target = inspectHtml(source).targets[0]!;
  const documentId = crypto.randomUUID();
  return {
    format: "opendesign-docs-project",
    schemaVersion: 1,
    createdAt: stamp,
    document: {
      id: documentId,
      name: "synthetic.html",
      versions: [
        { id: "original", label: "原稿", createdAt: stamp, source },
        {
          id: "edited",
          label: "编辑",
          createdAt: stamp,
          source: "<p>Second version</p>",
        },
      ],
    },
    review: {
      id: documentId,
      revision: 1,
      threads: [
        {
          id: "thread-1",
          versionId: "original",
          anchor: { kind: "text", id: target.id, quote: target.text },
          resolved: false,
          updatedAt: stamp,
          messages: [
            {
              id: "message-1",
              author: "Test",
              body: "Saved comment",
              createdAt: stamp,
            },
          ],
        },
      ],
    },
  };
}
afterEach(() => vi.restoreAllMocks());

describe("spec022 bounded project backup validation", () => {
  it("roundtrips saved HTML and version-bound comments without executing or rewriting source", () => {
    const original = fixture();
    expect(parseProjectBackup(serializeProjectBackup(original))).toEqual(
      original,
    );
    expect(original.document.versions[0]!.source).toContain("<script>");
  });
  it("rejects malformed JSON, format/schema mismatch and unexpected draft fields", () => {
    expect(() => parseProjectBackup("{broken")).toThrow("JSON");
    expect(() =>
      validateProjectBackup({ ...fixture(), format: "other" }),
    ).toThrow("不是");
    expect(() =>
      validateProjectBackup({ ...fixture(), schemaVersion: 2 }),
    ).toThrow("不支持此备份版本");
    expect(() => validateProjectBackup({ ...fixture(), drafts: [] })).toThrow(
      "不支持的内容",
    );
  });
  it("rejects byte limits, including multibyte HTML and aggregate versions", () => {
    expect(() => parseProjectBackup(" ".repeat(MAX_BACKUP_BYTES + 1))).toThrow(
      "20 MiB",
    );
    const one = fixture();
    one.document.versions[0]!.source = "中".repeat(2 * 1024 * 1024);
    expect(() => validateProjectBackup(one)).toThrow("5 MiB");
    const many = fixture();
    many.review.threads = [];
    many.document.versions = Array.from({ length: 5 }, (_, i) => ({
      id: `v${i}`,
      source: "x".repeat(5 * 1024 * 1024),
      label: "v",
      createdAt: stamp,
    }));
    expect(() => validateProjectBackup(many)).toThrow("20 MiB");
  });
  it("enforces all collection caps", () => {
    const versions = fixture();
    versions.document.versions = Array.from({ length: 101 }, (_, i) => ({
      ...versions.document.versions[0]!,
      id: `v${i}`,
    }));
    expect(() => validateProjectBackup(versions)).toThrow("100 个");
    const threads = fixture();
    threads.review.threads = Array.from(
      { length: 501 },
      () => threads.review.threads[0]!,
    );
    expect(() => validateProjectBackup(threads)).toThrow("500 条");
    const messages = fixture();
    messages.review.threads[0]!.messages = Array.from(
      { length: 101 },
      () => messages.review.threads[0]!.messages[0]!,
    );
    expect(() => validateProjectBackup(messages)).toThrow("100 条");
  });
  it("rejects orphan versions, document mismatch and invalid text/region anchors", () => {
    const orphan = fixture();
    orphan.review.threads[0]!.versionId = "missing";
    expect(() => validateProjectBackup(orphan)).toThrow("版本不存在");
    expect(() =>
      validateProjectBackup({
        ...fixture(),
        review: { ...fixture().review, id: "other" },
      }),
    ).toThrow("文档不匹配");
    const quote = fixture();
    quote.review.threads[0]!.anchor = {
      kind: "text",
      id: "text-0",
      quote: "wrong",
    };
    expect(() => validateProjectBackup(quote)).toThrow("文字与对应版本");
    const region = fixture();
    region.review.threads[0]!.anchor = {
      kind: "region",
      x: 900,
      y: 0,
      width: 100,
      height: 50,
      viewportWidth: 800,
    };
    expect(() => validateProjectBackup(region)).toThrow("批注区域");
  });
  it("rejects duplicate IDs, invalid dates and message types", () => {
    const duplicate = fixture();
    duplicate.document.versions[1]!.id = "original";
    expect(() => validateProjectBackup(duplicate)).toThrow("标识重复");
    const messages = fixture();
    messages.review.threads[0]!.messages.push({
      ...messages.review.threads[0]!.messages[0]!,
    });
    expect(() => validateProjectBackup(messages)).toThrow("标识重复");
    const date = fixture();
    date.createdAt = "2026-02-30T00:00:00Z";
    expect(() => validateProjectBackup(date)).toThrow("日期不存在");
    const types = fixture();
    (
      types.review.threads[0]!.messages[0] as unknown as { body: unknown }
    ).body = 100;
    expect(() => validateProjectBackup(types)).toThrow("留言");
  });
  it("parses each anchored source only once for many comments", () => {
    const value = fixture();
    const first = value.review.threads[0]!;
    value.review.threads = Array.from({ length: 25 }, (_, i) => ({
      ...first,
      id: `thread-${i}`,
      messages: [{ ...first.messages[0]!, id: `message-${i}` }],
    }));
    const spy = vi.spyOn(html, "inspectHtml");
    validateProjectBackup(value);
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it("rekeys every entity and version reference without changing originals", () => {
    const original = fixture(),
      before = structuredClone(original);
    const a = freshProjectRecords(original),
      b = freshProjectRecords(original);
    expect(original).toEqual(before);
    expect(a.document.id).not.toBe(original.document.id);
    expect(a.document.name).toBe("synthetic-恢复副本.html");
    expect(b.document.id).not.toBe(a.document.id);
    expect(a.review.id).toBe(a.document.id);
    expect(a.review.revision).toBe(1);
    expect(a.review.threads[0]!.versionId).toBe(a.document.versions[0]!.id);
    expect(a.review.threads[0]!.id).not.toBe(original.review.threads[0]!.id);
    expect(a.review.threads[0]!.messages[0]!.id).not.toBe(
      original.review.threads[0]!.messages[0]!.id,
    );
    expect(a.document.versions.map((v) => v.source)).toEqual(
      original.document.versions.map((v) => v.source),
    );
  });
  it("keeps restored-copy names bounded and preserves HTML extensions", () => {
    const original = fixture();
    original.document.name = "长".repeat(495) + ".HTML";
    const restored = freshProjectRecords(original);
    expect(restored.document.name).toHaveLength(500);
    expect(restored.document.name).toMatch(/-恢复副本\.HTML$/);
    const roundtrip = parseProjectBackup(
      serializeProjectBackup({
        ...original,
        document: restored.document,
        review: restored.review,
      }),
    );
    expect(roundtrip.document.name).toBe(restored.document.name);
    expect(original.document.name).toBe("长".repeat(495) + ".HTML");
  });
});

describe("spec022 saved snapshot and atomic restore", () => {
  it("exports document and review in one readonly transaction and excludes drafts", async () => {
    const original = fixture();
    await saveDocument(original.document);
    await saveReview(original.review, 0);
    await saveDraft(
      {
        id: original.document.id,
        baseVersionId: "edited",
        source: "Unsaved draft excluded",
        updatedAt: stamp,
        revision: 1,
      },
      0,
    );
    const spy = vi.spyOn(IDBDatabase.prototype, "transaction");
    const backup = await exportProjectBackup(original.document.id);
    expect(spy).toHaveBeenCalledWith(["documents", "reviews"], "readonly");
    expect(backup.document).toEqual(original.document);
    expect(backup.review).toEqual(original.review);
    expect(serializeProjectBackup(backup)).not.toContain("Unsaved draft");
    expect(await loadDraft(original.document.id)).not.toBeNull();
  });
  it("restores a new copy with all saved versions/comments and no draft, preserving original", async () => {
    const original = fixture();
    await saveDocument(original.document);
    await saveReview(original.review, 0);
    const restored = await restoreProjectBackup(
      parseProjectBackup(serializeProjectBackup(original)),
    );
    expect(restored.name).toBe("synthetic-恢复副本.html");
    expect(
      (await listDocuments()).find((d) => d.id === original.document.id),
    ).toEqual(original.document);
    expect((await loadReview(restored.id)).threads[0]!.versionId).toBe(
      restored.versions[0]!.id,
    );
    expect(await loadDraft(restored.id)).toBeNull();
    expect((await exportProjectBackup(restored.id)).document).toEqual(restored);
  });
  it("rejects invalid input before opening a write transaction", async () => {
    const spy = vi.spyOn(IDBDatabase.prototype, "transaction");
    await expect(restoreProjectBackup({ schemaVersion: 2 })).rejects.toThrow(
      "备份无效",
    );
    expect(spy).not.toHaveBeenCalled();
  });
  it("rolls back the document when the review insertion throws", async () => {
    const original = fixture(),
      before = await listDocuments();
    const add = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === "reviews")
        throw new DOMException("Synthetic quota failure", "QuotaExceededError");
      return key === undefined
        ? add.call(this, value)
        : add.call(this, value, key);
    });
    await expect(restoreProjectBackup(original)).rejects.toThrow("恢复失败");
    expect(await listDocuments()).toEqual(before);
  });
  it("uses add so an existing ID collision cannot overwrite local records", async () => {
    const original = fixture();
    await saveDocument(original.document);
    const imported = fixture();
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(
      original.document
        .id as `${string}-${string}-${string}-${string}-${string}`,
    );
    await expect(restoreProjectBackup(imported)).rejects.toThrow("标识冲突");
    expect(
      (await listDocuments()).find((d) => d.id === original.document.id),
    ).toEqual(original.document);
    expect(await loadReview(original.document.id)).toEqual({
      id: original.document.id,
      revision: 0,
      threads: [],
    });
  });
});
