import { saveDraft, discardDraft, type DraftRecord } from "./store";

export type DraftStatus = {
  kind: "saved" | "waiting" | "saving" | "draft" | "error";
  message: string;
};

type Options = {
  id: string;
  baseVersionId: string;
  versionSource: string;
  initialDraft: DraftRecord | null;
  onStatus: (state: DraftStatus) => void;
  delay?: number;
};

type Dependencies = {
  saveDraft: typeof saveDraft;
  discardDraft: typeof discardDraft;
};

/** One writer per open editor. Never reload a rival revision to retry a write. */
export class DraftWriter {
  private readonly deps: Dependencies;
  private readonly id: string;
  private baseVersionId: string;
  private versionSource: string;
  private latest: string;
  private persisted: DraftRecord | null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<void> | undefined;
  private paused = false;
  private pausedSource: string | undefined;
  private disposed = false;
  private failure: Error | undefined;
  private conflict = false;

  constructor(
    private readonly options: Options,
    dependencies: Partial<Dependencies> = {},
  ) {
    this.deps = { saveDraft, discardDraft, ...dependencies };
    this.id = options.id;
    this.baseVersionId = options.baseVersionId;
    this.versionSource = options.versionSource;
    this.persisted = options.initialDraft;
    this.latest = options.initialDraft?.source ?? options.versionSource;
    if (
      this.persisted &&
      (this.persisted.id !== this.id ||
        this.persisted.baseVersionId !== this.baseVersionId)
    ) {
      this.conflict = true;
      this.failure = new Error(
        "草稿对应的版本已改变，请先备份或另存恢复副本。",
      );
    }
  }

  update(source: string): void {
    if (this.disposed || source === this.latest) return;
    this.latest = source;
    this.schedule();
  }

  async flush(): Promise<void> {
    this.cancelTimer();
    if (this.disposed) throw new Error("草稿编辑器已关闭。");
    if (this.conflict) throw this.failure;
    if (this.paused) {
      await this.inFlight;
      if (this.needsWrite())
        throw new Error("正在保存正式版本，草稿暂存已暂停。");
      if (this.failure) throw this.failure;
      return;
    }
    // A new source arriving while the transaction is active is picked up by drain.
    if (this.inFlight) return this.inFlight;
    this.failure = undefined;
    if (!this.needsWrite()) {
      this.reportSettled();
      return;
    }
    const work = this.drain();
    this.inFlight = work;
    try {
      await work;
    } finally {
      if (this.inFlight === work) this.inFlight = undefined;
    }
  }

  async pause(): Promise<void> {
    this.cancelTimer();
    if (!this.paused) this.pausedSource = this.latest;
    this.paused = true;
    // A failed draft must not prevent the user from saving a formal version.
    await this.inFlight?.catch(() => undefined);
  }

  resume(): void {
    if (this.disposed || this.conflict) return;
    this.paused = false;
    this.pausedSource = undefined;
    this.schedule();
  }

  rebase(
    baseVersionId: string,
    versionSource: string,
    draft: DraftRecord | null,
  ): void {
    if (this.disposed) return;
    if (!this.paused || this.inFlight)
      throw new Error("请等待草稿写入暂停后更新版本基线。");
    if (
      draft &&
      (!this.persisted ||
        draft.id !== this.id ||
        draft.revision !== this.persisted.revision ||
        draft.source !== this.persisted.source ||
        draft.baseVersionId !== this.persisted.baseVersionId)
    ) {
      this.conflict = true;
      this.reportFailure(
        new Error(
          "另一个窗口更新了草稿。正式版本已保存，请保留当前内容并重新载入。",
        ),
      );
      return;
    }
    const changedWhilePaused = this.latest !== this.pausedSource;
    this.baseVersionId = baseVersionId;
    this.versionSource = versionSource;
    this.persisted = draft;
    if (!changedWhilePaused) this.latest = versionSource;
    this.failure = undefined;
    this.conflict = false;
    this.resume();
  }

  dispose(): void {
    this.cancelTimer();
    this.disposed = true;
  }

  private needsWrite(): boolean {
    if (this.latest === this.versionSource) return this.persisted !== null;
    return (
      !this.persisted ||
      this.latest !== this.persisted.source ||
      this.baseVersionId !== this.persisted.baseVersionId
    );
  }

  private cancelTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    this.cancelTimer();
    if (this.disposed || this.paused || this.conflict || this.failure) return;
    // The active transaction may still change persisted even if latest reverted.
    if (this.inFlight) return;
    if (!this.needsWrite()) {
      this.reportSettled();
      return;
    }
    this.report({
      kind: "waiting",
      message: "有已应用修改，等待暂存到本机草稿…",
    });
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush().catch(() => undefined);
    }, this.options.delay ?? 600);
  }

  private async drain(): Promise<void> {
    while (!this.disposed && !this.paused && this.needsWrite()) {
      const source = this.latest;
      this.report({ kind: "saving", message: "正在暂存本机草稿…" });
      try {
        if (source === this.versionSource && this.persisted) {
          await this.deps.discardDraft(this.id, this.persisted.revision);
          this.persisted = null;
        } else {
          const expectedRevision = this.persisted?.revision ?? 0;
          this.persisted = await this.deps.saveDraft(
            {
              id: this.id,
              baseVersionId: this.baseVersionId,
              source,
              updatedAt: new Date().toISOString(),
              revision: expectedRevision + 1,
            },
            expectedRevision,
          );
        }
        this.failure = undefined;
      } catch (error) {
        this.reportFailure(error);
        throw this.failure;
      }
    }
    if (!this.needsWrite()) this.reportSettled();
  }

  private reportSettled(): void {
    this.report(
      this.persisted
        ? { kind: "draft", message: "已暂存到本机草稿 · 尚未保存为正式版本" }
        : { kind: "saved", message: "与已保存版本一致" },
    );
  }

  private reportFailure(error: unknown): void {
    this.failure =
      error instanceof Error
        ? error
        : new Error("草稿暂存失败，请导出 HTML 备份。");
    this.report({ kind: "error", message: this.failure.message });
  }

  private report(state: DraftStatus): void {
    if (!this.disposed) this.options.onStatus(state);
  }
}
