import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  discardDraft,
  loadDraft,
  saveDocument,
  type DocumentRecord,
  type DraftRecord,
  type Version,
} from "./store";
import { DraftWriter, type DraftStatus } from "./draft-writer";
import "./draft.css";

export type DraftControls = {
  status: ReactNode;
  getSource: () => string;
  onSource: (source: string) => void;
  beforeSave: () => Promise<void>;
  saveFailed: () => void;
  saved: (record: DocumentRecord) => Promise<void>;
};
type Props = {
  record: DocumentRecord;
  onSaved: (record: DocumentRecord) => void;
  onCopy: (record: DocumentRecord) => void;
  children: (controls: DraftControls) => ReactNode;
  navigation?: ReactNode;
};
const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "草稿读取失败，请重试。";

export function DraftWorkspace(props: Props) {
  const [loaded, setLoaded] = useState(false);
  const [candidate, setCandidate] = useState<DraftRecord | null>(null);
  const [initial, setInitial] = useState<DraftRecord | null>(null);
  const [choice, setChoice] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError("");
    void loadDraft(props.record.id)
      .then((draft) => {
        if (cancelled) return;
        setCandidate(draft);
        setChoice(!draft);
        setLoaded(true);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(errorMessage(e));
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [props.record.id, attempt]);
  if (!loaded)
    return (
      <>
        {props.navigation}
        <div className="empty" role="status">
          正在检查本机草稿…
        </div>
      </>
    );
  if (choice) return <DraftSession {...props} initial={initial} />;
  const latest = props.record.versions.at(-1)!;
  const stale = candidate && candidate.baseVersionId !== latest.id;
  return (
    <>
      {props.navigation}
      <section className="draft-recovery" aria-label="草稿恢复">
        <small>仅在当前浏览器 · 不会自动发布</small>
        <h1>{candidate ? "继续上次的草稿？" : "暂时无法读取草稿"}</h1>
        <p>{props.record.name}</p>
        {candidate && (
          <p>
            上次暂存：{new Date(candidate.updatedAt).toLocaleString()}
            。正式版本和批注仍保留。
          </p>
        )}
        {stale && (
          <p>正式版本已经更新。旧草稿只能恢复为独立副本，不会覆盖当前文档。</p>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="draft-actions">
          {candidate && (
            <>
              <button
                className="primary"
                disabled={busy}
                onClick={() => {
                  if (!stale) {
                    setInitial(candidate);
                    setChoice(true);
                    return;
                  }
                  setBusy(true);
                  setError("");
                  const copy: DocumentRecord = {
                    id: crypto.randomUUID(),
                    name:
                      props.record.name.replace(/\.html?$/i, "") +
                      "-恢复副本.html",
                    versions: [
                      {
                        id: crypto.randomUUID(),
                        source: candidate.source,
                        createdAt: new Date().toISOString(),
                        label: "从旧草稿恢复的独立副本",
                      },
                    ],
                  };
                  void saveDocument(copy)
                    .then(() => props.onCopy(copy))
                    .catch((e) => setError(errorMessage(e)))
                    .finally(() => setBusy(false));
                }}
              >
                {stale ? "恢复为独立副本" : "恢复草稿"}
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  if (
                    !window.confirm(
                      "放弃这份本机草稿？此操作不可撤销，已保存的正式版本和批注不受影响。",
                    )
                  )
                    return;
                  setBusy(true);
                  setError("");
                  void discardDraft(candidate.id, candidate.revision)
                    .then(() => {
                      setInitial(null);
                      setCandidate(null);
                      setChoice(true);
                    })
                    .catch((e) => setError(errorMessage(e)))
                    .finally(() => setBusy(false));
                }}
              >
                放弃草稿，打开已保存版本
              </button>
            </>
          )}
          <button disabled={busy} onClick={() => setAttempt((n) => n + 1)}>
            重新检查草稿
          </button>
        </div>
        <details>
          <summary>草稿说明</summary>
          <p>
            只暂存已应用内容。未应用输入、未结束的直接编辑和未提交批注不包含在内。
          </p>
        </details>
      </section>
    </>
  );
}

function DraftSession({
  record,
  initial,
  onSaved,
  children,
}: Props & { initial: DraftRecord | null }) {
  const latest = record.versions.at(-1)!;
  const source = useRef(initial?.source ?? latest.source);
  const [status, setStatus] = useState<DraftStatus>({
    kind: initial ? "draft" : "saved",
    message: initial
      ? "已恢复本机草稿，尚未保存为版本"
      : "正式版本已保存在本机",
  });
  const writer = useRef<DraftWriter | null>(null);
  const pendingReconcile = useRef<Version | null>(null);
  useEffect(() => {
    const session = new DraftWriter({
      id: record.id,
      baseVersionId: latest.id,
      versionSource: latest.source,
      initialDraft: initial,
      onStatus: setStatus,
      delay: 600,
    });
    writer.current = session;
    session.update(source.current);
    return () => {
      session.dispose();
      writer.current = null;
    };
    // One session per mounted document. Formal saves use rebase, not a new writer.
  }, []);
  const activeWriter = () => {
    if (!writer.current) throw new Error("草稿编辑器尚未准备好，请重试。");
    return writer.current;
  };
  const controls: DraftControls = {
    status: null,
    getSource: () => source.current,
    onSource: (next) => {
      source.current = next;
      activeWriter().update(next);
    },
    beforeSave: () => activeWriter().pause(),
    saveFailed: () => activeWriter().resume(),
    saved: async (next) => {
      const version = next.versions.at(-1)!;
      await reconcile(version);
      onSaved(next);
    },
  };
  async function reconcile(version: Version) {
    try {
      const remaining = await loadDraft(record.id);
      activeWriter().rebase(version.id, version.source, remaining);
      pendingReconcile.current = null;
    } catch {
      pendingReconcile.current = version;
      setStatus({
        kind: "error",
        message:
          "正式版本已保存，但草稿状态读取失败。请重新检查草稿状态，或导出备份后重新打开。",
      });
    }
  }
  controls.status = (
    <div
      className={`draft-status draft-status-${status.kind}`}
      role={status.kind === "error" ? "alert" : "status"}
    >
      <span title={status.message}>
        {status.kind === "error"
          ? status.message
          : {
              saved: "本机版本已保存",
              waiting: "等待暂存…",
              saving: "暂存中…",
              draft: "草稿已暂存",
            }[status.kind]}
      </span>
      {status.kind === "error" && (
        <button
          onClick={() => {
            if (pendingReconcile.current)
              void reconcile(pendingReconcile.current);
            else
              void activeWriter()
                .flush()
                .catch(() => {});
          }}
        >
          {pendingReconcile.current ? "重新检查草稿状态" : "重试暂存"}
        </button>
      )}
      <details className="docs-storage-details">
        <summary aria-label="查看存储说明" title="查看存储说明">
          ⓘ
        </summary>
        <div>
          <strong>仅存于此浏览器</strong>
          <p>{status.message}</p>
          <p>
            草稿不等于正式版本。仅已应用修改会暂存；未应用输入、未结束编辑和未提交批注不包含在内。请保存版本并导出备份。
          </p>
        </div>
      </details>
    </div>
  );
  return children(controls);
}
