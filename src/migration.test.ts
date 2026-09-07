import { IDBFactory } from "fake-indexeddb";
import { expect, it, vi } from "vitest";
import { listDocuments, loadReview, loadDraft, saveDraft } from "./store";

it("spec 013 upgrades an existing v1 local database without losing documents", async () => {
  const factory = new IDBFactory();
  vi.stubGlobal("indexedDB", factory);
  try {
    const oldDoc = {
      id: "legacy",
      name: "fixture.html",
      versions: [
        {
          id: "v1",
          source: "<p>old</p>",
          label: "original",
          createdAt: "2026-09-06",
        },
      ],
    };
    await new Promise<void>((resolve, reject) => {
      const request = factory.open("opendesign-docs", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("documents", { keyPath: "id" });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction("documents", "readwrite");
        tx.objectStore("documents").put(oldDoc);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => reject(tx.error);
      };
    });
    expect(await listDocuments()).toEqual([oldDoc]);
    expect(await loadReview("legacy")).toEqual({
      id: "legacy",
      revision: 0,
      threads: [],
    });
    expect(await loadDraft("legacy")).toBeNull();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("spec 015 upgrades v2 to v3 while retaining documents, versions and review threads", async () => {
  const factory = new IDBFactory();
  vi.stubGlobal("indexedDB", factory);
  try {
    const oldDoc = {
      id: "legacy-v2",
      name: "fixture.html",
      versions: [
        {
          id: "v1",
          source: "<p>old</p>",
          label: "original",
          createdAt: "2026-09-06",
        },
        {
          id: "v2",
          source: "<p>edited</p>",
          label: "saved",
          createdAt: "2026-09-06",
        },
      ],
    };
    const oldReview = {
      id: oldDoc.id,
      revision: 7,
      threads: [
        {
          id: "thread",
          versionId: "v1",
          anchor: { kind: "text", id: "text-3", quote: "old" },
          messages: [
            {
              id: "message",
              author: "Reviewer",
              body: "Check this",
              createdAt: "2026-09-06",
            },
          ],
          resolved: false,
          updatedAt: "2026-09-06",
        },
      ],
    };
    await new Promise<void>((resolve, reject) => {
      const request = factory.open("opendesign-docs", 2);
      request.onupgradeneeded = () => {
        for (const name of ["documents", "reviews"])
          request.result.createObjectStore(name, { keyPath: "id" });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(["documents", "reviews"], "readwrite");
        tx.objectStore("documents").put(oldDoc);
        tx.objectStore("reviews").put(oldReview);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      };
    });
    expect(await listDocuments()).toEqual([oldDoc]);
    expect(await loadReview(oldDoc.id)).toEqual(oldReview);
    expect(await loadDraft(oldDoc.id)).toBeNull();
    const draft = {
      id: oldDoc.id,
      baseVersionId: "v2",
      source: "<p>Recovered work</p>",
      updatedAt: "2026-09-06T02:00:00Z",
      revision: 1,
    };
    expect(await saveDraft(draft, 0)).toEqual(draft);
    expect(await loadDraft(oldDoc.id)).toEqual(draft);
    expect(await listDocuments()).toEqual([oldDoc]);
    expect(await loadReview(oldDoc.id)).toEqual(oldReview);
    await new Promise<void>((resolve, reject) => {
      const request = factory.open("opendesign-docs");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        try {
          expect(request.result.version).toBe(3);
          expect([...request.result.objectStoreNames]).toEqual([
            "documents",
            "draftRevisions",
            "drafts",
            "reviews",
          ]);
          resolve();
        } catch (e) {
          reject(e);
        } finally {
          request.result.close();
        }
      };
    });
  } finally {
    vi.unstubAllGlobals();
  }
});
