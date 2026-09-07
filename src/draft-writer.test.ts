import { afterEach, describe, expect, it, vi } from "vitest";
import { DraftWriter, type DraftStatus } from "./draft-writer";
import type { DraftRecord } from "./store";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture(initialDraft: DraftRecord | null = null) {
  const statuses: DraftStatus[] = [];
  let record = initialDraft;
  let revision = initialDraft?.revision ?? 0;
  const save = vi.fn(async (draft: DraftRecord, expected: number) => {
    if ((record?.revision ?? 0) !== expected) throw new Error("conflict");
    record = { ...draft, revision: ++revision };
    return record;
  });
  const discard = vi.fn(async (_id: string, expected: number) => {
    if ((record?.revision ?? 0) !== expected) throw new Error("conflict");
    record = null;
  });
  const writer = new DraftWriter(
    {
      id: "doc",
      baseVersionId: "v1",
      versionSource: "original",
      initialDraft,
      onStatus: (status) => statuses.push(status),
      delay: 20,
    },
    { saveDraft: save, discardDraft: discard },
  );
  return { writer, statuses, save, discard, record: () => record };
}

afterEach(() => vi.useRealTimers());

describe("spec 015 serialized draft writer", () => {
  it("constructor is side-effect free for React state initialization", () => {
    const f = fixture();
    expect(f.statuses).toEqual([]);
    expect(f.save).not.toHaveBeenCalled();
    f.writer.dispose();
  });

  it("coalesces bursts and does not write an unchanged formal version", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.writer.update("original");
    await f.writer.flush();
    expect(f.save).not.toHaveBeenCalled();
    f.writer.update("one");
    f.writer.update("two");
    f.writer.update("three");
    await vi.advanceTimersByTimeAsync(20);
    expect(f.save).toHaveBeenCalledTimes(1);
    expect(f.record()?.source).toBe("three");
    expect(f.statuses.at(-1)?.kind).toBe("draft");
    f.writer.dispose();
  });

  it("serializes in-flight updates and flush includes the newest source", async () => {
    const f = fixture();
    const gate = deferred();
    const originalSave = f.save.getMockImplementation()!;
    f.save.mockImplementationOnce(async (draft, revision) => {
      await gate.promise;
      return originalSave(draft, revision);
    });
    f.writer.update("one");
    const flush = f.writer.flush();
    f.writer.update("two");
    f.writer.update("three");
    expect(f.save).toHaveBeenCalledTimes(1);
    gate.resolve();
    await flush;
    expect(f.save).toHaveBeenCalledTimes(2);
    expect(f.save.mock.calls[1]![1]).toBe(1);
    expect(f.record()?.source).toBe("three");
    f.writer.dispose();
  });

  it("revert deletes only the owned revision, and recreation adopts authoritative revision", async () => {
    const f = fixture();
    f.writer.update("one");
    await f.writer.flush();
    f.writer.update("original");
    await f.writer.flush();
    expect(f.discard).toHaveBeenCalledWith("doc", 1);
    expect(f.record()).toBeNull();
    expect(f.statuses.at(-1)?.kind).toBe("saved");
    f.writer.update("two");
    await f.writer.flush();
    expect(f.save.mock.calls[1]![1]).toBe(0);
    expect(f.record()?.revision).toBe(2);
    f.writer.update("three");
    await f.writer.flush();
    expect(f.save.mock.calls[2]![1]).toBe(2);
    f.writer.dispose();
  });

  it("does not claim saved when a revert races an in-flight write", async () => {
    const f = fixture();
    const gate = deferred();
    const originalSave = f.save.getMockImplementation()!;
    f.save.mockImplementationOnce(async (draft, revision) => {
      await gate.promise;
      return originalSave(draft, revision);
    });
    f.writer.update("one");
    const flush = f.writer.flush();
    f.writer.update("original");
    expect(f.statuses.at(-1)?.kind).toBe("saving");
    gate.resolve();
    await flush;
    expect(f.discard).toHaveBeenCalledWith("doc", 1);
    expect(f.statuses.at(-1)?.kind).toBe("saved");
    f.writer.dispose();
  });

  it("reports failed writes without automatic retries; pause still permits formal saving", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.save.mockRejectedValue(new Error("conflict"));
    f.writer.update("one");
    await expect(f.writer.flush()).rejects.toThrow("conflict");
    expect(f.statuses.at(-1)).toEqual({ kind: "error", message: "conflict" });
    f.writer.update("two");
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.save).toHaveBeenCalledTimes(1);
    await expect(f.writer.pause()).resolves.toBeUndefined();
    f.writer.dispose();
  });

  it("pause drains only the active transaction, rebase writes no old-base queued source", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const gate = deferred();
    const originalSave = f.save.getMockImplementation()!;
    f.save.mockImplementationOnce(async (draft, revision) => {
      await gate.promise;
      return originalSave(draft, revision);
    });
    f.writer.update("one");
    const flush = f.writer.flush();
    f.writer.update("two");
    const paused = f.writer.pause();
    gate.resolve();
    await Promise.all([flush, paused]);
    expect(f.save).toHaveBeenCalledTimes(1);
    // Formal save of "two" succeeded. The prior owned draft still exists.
    f.writer.rebase("v2", "two", f.record());
    await vi.advanceTimersByTimeAsync(20);
    expect(f.discard).toHaveBeenCalledWith("doc", 1);
    expect(f.save).toHaveBeenCalledTimes(1);
    f.writer.update("three");
    await f.writer.flush();
    expect(f.save.mock.calls[1]![0].baseVersionId).toBe("v2");
    f.writer.dispose();
  });

  it("retains updates arriving while paused and resumes on the new formal base", async () => {
    const f = fixture();
    f.writer.update("one");
    await f.writer.pause();
    f.writer.update("two");
    f.writer.rebase("v2", "one", null);
    await f.writer.flush();
    expect(f.record()).toMatchObject({ source: "two", baseVersionId: "v2" });
    f.writer.dispose();
  });

  it("refuses to adopt a rival draft during rebase", async () => {
    const f = fixture();
    f.writer.update("one");
    await f.writer.flush();
    const rival = { ...f.record()!, revision: 2, source: "other window" };
    await f.writer.pause();
    f.writer.rebase("v2", "one", rival);
    f.writer.resume();
    f.writer.update("two");
    await expect(f.writer.flush()).rejects.toThrow("另一个窗口");
    expect(f.save).toHaveBeenCalledTimes(1);
    expect(f.discard).not.toHaveBeenCalled();
    f.writer.dispose();
  });

  it("dispose drops pending scheduling but never reports it as persisted", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.writer.update("one");
    f.writer.dispose();
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.save).not.toHaveBeenCalled();
    expect(f.statuses.at(-1)?.kind).toBe("waiting");
    await expect(f.writer.flush()).rejects.toThrow("已关闭");
  });

  it("keeps a recovered draft without rewriting and rejects stale initial drafts", async () => {
    const draft = {
      id: "doc",
      baseVersionId: "v1",
      source: "recovered",
      updatedAt: new Date().toISOString(),
      revision: 4,
    };
    const f = fixture(draft);
    await f.writer.flush();
    expect(f.save).not.toHaveBeenCalled();
    expect(f.statuses.at(-1)?.kind).toBe("draft");
    f.writer.dispose();
    const stale = fixture({ ...draft, baseVersionId: "v0" });
    await expect(stale.writer.flush()).rejects.toThrow("版本已改变");
    expect(stale.save).not.toHaveBeenCalled();
    stale.writer.dispose();
  });
});
