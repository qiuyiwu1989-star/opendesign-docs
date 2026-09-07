import { validateAnchor, type ReviewRecord } from "./review";

export type Version = {
  id: string;
  createdAt: string;
  source: string;
  label: string;
};
export type DocumentRecord = { id: string; name: string; versions: Version[] };
export type DraftRecord = {
  id: string;
  baseVersionId: string;
  source: string;
  updatedAt: string;
  revision: number;
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open("opendesign-docs", 3);
    request.onupgradeneeded = () => {
      for (const name of ["documents", "reviews", "drafts", "draftRevisions"])
        if (!request.result.objectStoreNames.contains(name))
          request.result.createObjectStore(name, { keyPath: "id" });
    };
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error("本地文档库被其他窗口占用，请关闭旧窗口后重试。"));
    };
  });
}

export async function loadDraft(id: string): Promise<DraftRecord | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", "readonly");
    const request = tx.objectStore("drafts").get(id);
    tx.oncomplete = () => {
      db.close();
      resolve(request.result ?? null);
    };
    tx.onabort = () => {
      db.close();
      reject(new Error("本机草稿读取失败，请重试。"));
    };
  });
}

// Drafts never advance the saved version. Both guards share one transaction so
// an old window cannot overwrite another draft or work on a newer saved version.
export async function saveDraft(
  draft: DraftRecord,
  expectedRevision: number,
): Promise<DraftRecord> {
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 ||
    !Number.isSafeInteger(draft.revision) ||
    draft.revision !== expectedRevision + 1 ||
    !draft.id ||
    !draft.baseVersionId ||
    typeof draft.source !== "string" ||
    !Number.isFinite(Date.parse(draft.updatedAt))
  )
    throw new Error("草稿信息无效，请保留当前内容并重新载入文档。");
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      ["documents", "drafts", "draftRevisions"],
      "readwrite",
    );
    const store = tx.objectStore("drafts");
    const revisions = tx.objectStore("draftRevisions");
    let persisted: DraftRecord;
    let failure = "草稿暂存失败，浏览器存储可能已满。请导出 HTML 备份。";
    const request = store.get(draft.id);
    request.onsuccess = () => {
      if ((request.result?.revision ?? 0) !== expectedRevision) {
        failure = "另一个窗口更新了草稿。请保留当前修改，重新载入草稿后重试。";
        tx.abort();
        return;
      }
      const docRequest = tx.objectStore("documents").get(draft.id);
      docRequest.onsuccess = () => {
        const doc = docRequest.result as DocumentRecord | undefined;
        if (doc?.versions.at(-1)?.id !== draft.baseVersionId) {
          failure =
            "草稿对应的正式版本已更新或文档不存在。请备份草稿，勿覆盖新版本。";
          tx.abort();
          return;
        }
        const revisionRequest = revisions.get(draft.id);
        revisionRequest.onsuccess = () => {
          // Keep generations across deletes so a stale tab cannot overwrite a
          // newly recreated draft that happens to have the same revision (ABA).
          const revision =
            Math.max(revisionRequest.result?.revision ?? 0, expectedRevision) +
            1;
          if (!Number.isSafeInteger(revision)) {
            failure = "草稿版本已超过存储限制，请导出 HTML 备份。";
            tx.abort();
            return;
          }
          persisted = { ...draft, revision };
          try {
            revisions.put({ id: draft.id, revision });
            store.put(persisted);
          } catch {
            tx.abort();
          }
        };
      };
    };
    tx.oncomplete = () => {
      db.close();
      resolve(persisted);
    };
    tx.onabort = () => {
      db.close();
      reject(new Error(failure));
    };
    tx.onerror = () => {
      /* onabort reports the failure */
    };
  });
}

export async function discardDraft(
  id: string,
  expectedRevision: number,
): Promise<void> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
    throw new Error("草稿版本无效，请重新载入后再放弃草稿。");
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    const store = tx.objectStore("drafts");
    let failure = "草稿未能放弃，请重试。";
    const request = store.get(id);
    request.onsuccess = () => {
      if ((request.result?.revision ?? 0) !== expectedRevision) {
        failure = "另一个窗口更新了草稿。请重新载入，确认内容后再放弃。";
        tx.abort();
        return;
      }
      store.delete(id);
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = () => {
      db.close();
      reject(new Error(failure));
    };
    tx.onerror = () => {
      /* onabort reports the failure */
    };
  });
}

export async function loadReview(id: string): Promise<ReviewRecord> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("reviews", "readonly");
    const request = tx.objectStore("reviews").get(id);
    tx.oncomplete = () => {
      db.close();
      resolve(request.result ?? { id, revision: 0, threads: [] });
    };
    tx.onabort = () => {
      db.close();
      reject(new Error("批注读取失败，请重试。"));
    };
  });
}

// Separate from documents so saving content cannot overwrite comments (and vice versa).
export async function saveReview(
  record: ReviewRecord,
  expectedRevision: number,
): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["documents", "reviews"], "readwrite");
    let failure = "批注保存失败，请保留意见后重试。";
    const reviewStore = tx.objectStore("reviews");
    const request = reviewStore.get(record.id);
    request.onsuccess = () => {
      if (
        (request.result?.revision ?? 0) !== expectedRevision ||
        record.revision !== expectedRevision + 1
      ) {
        failure = "另一个窗口更新了批注。请保留意见，重新载入批注后重试。";
        tx.abort();
        return;
      }
      const docRequest = tx.objectStore("documents").get(record.id);
      docRequest.onsuccess = () => {
        try {
          const doc = docRequest.result as DocumentRecord | undefined;
          if (!doc || record.threads.length > 500)
            throw new Error("文档不存在或批注数量超过限制。");
          for (const thread of record.threads) {
            const version = doc.versions.find(
              (item) => item.id === thread.versionId,
            );
            if (!version) throw new Error("请先保存文档版本，再添加批注。");
            validateAnchor(thread.anchor, version.source);
          }
          reviewStore.put(record);
        } catch (e) {
          failure = e instanceof Error ? e.message : failure;
          tx.abort();
        }
      };
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = () => {
      db.close();
      reject(new Error(failure));
    };
    tx.onerror = () => {
      /* onabort reports the failure */
    };
  });
}
export async function listDocuments(): Promise<DocumentRecord[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("documents", "readonly");
    const request = tx.objectStore("documents").getAll();
    tx.oncomplete = () => {
      db.close();
      resolve(request.result as DocumentRecord[]);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
// Compare-and-set in the same transaction prevents silent overwrites by another tab.
export async function saveDocument(
  doc: DocumentRecord,
  expectedVersion?: string,
): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["documents", "drafts"], "readwrite");
    const store = tx.objectStore("documents");
    let conflict = false;
    const request = store.get(doc.id);
    request.onsuccess = () => {
      const existing = request.result as DocumentRecord | undefined;
      if (existing?.versions.at(-1)?.id !== expectedVersion) {
        conflict = true;
        tx.abort();
        return;
      }
      try {
        store.put(doc);
        const drafts = tx.objectStore("drafts");
        const draftRequest = drafts.get(doc.id);
        draftRequest.onsuccess = () => {
          const draft = draftRequest.result as DraftRecord | undefined;
          if (
            draft &&
            draft.baseVersionId === expectedVersion &&
            draft.source === doc.versions.at(-1)?.source
          )
            drafts.delete(doc.id);
        };
      } catch {
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = () => {
      db.close();
      reject(
        new Error(
          conflict
            ? "另一个窗口更新了这份文档。请先导出当前修改，再刷新加载新版本。"
            : "保存失败，浏览器存储可能已满。请导出 HTML 备份。",
        ),
      );
    };
    tx.onerror = () => {
      /* onabort reports the failure */
    };
  });
}

// spec022: one read transaction gives a consistent saved-version/review snapshot.
// Temporary drafts are deliberately outside this transaction and backup format.
import {
  freshProjectRecords,
  validateProjectBackup,
  type ProjectBackup,
} from "./project-backup";
export async function exportProjectBackup(id: string): Promise<ProjectBackup> {
  const db = await open();
  const snapshot = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction(["documents", "reviews"], "readonly");
    const document = tx.objectStore("documents").get(id);
    const review = tx.objectStore("reviews").get(id);
    tx.oncomplete = () => {
      db.close();
      resolve({
        format: "opendesign-docs-project",
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        document: document.result,
        review: review.result ?? { id, revision: 0, threads: [] },
      });
    };
    tx.onabort = () => {
      db.close();
      reject(new Error("备份读取失败，请重试。原文档未改动。"));
    };
    tx.onerror = () => {
      /* onabort reports failure */
    };
  });
  return validateProjectBackup(snapshot);
}

// Both records use add, never put: collision or quota failures abort both writes.
export async function restoreProjectBackup(
  value: unknown,
): Promise<DocumentRecord> {
  const records = freshProjectRecords(value);
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["documents", "reviews"], "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve(records.document);
    };
    tx.onabort = () => {
      db.close();
      reject(
        new Error(
          "恢复失败，可能存储已满或标识冲突。请释放空间后重试；原文档未改动。",
        ),
      );
    };
    tx.onerror = () => {
      /* onabort reports failure */
    };
    try {
      tx.objectStore("documents").add(records.document);
      tx.objectStore("reviews").add(records.review);
    } catch {
      tx.abort();
    }
  });
}
