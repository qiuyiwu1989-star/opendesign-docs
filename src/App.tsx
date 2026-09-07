import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type ComponentProps,
} from "react";
import { createPreview, inspectHtml, patchText } from "./html";
import { listDocuments, saveDocument, type DocumentRecord } from "./store";
import { demo, slideDemo } from "./demo";
import { inspectSlides } from "./slides";
import { MAX_DOCUMENT_BYTES } from "./slide-insert";
import { deferredFeature } from "./deferred-feature";
import type { SlidesEditor as SlideEditorView } from "./SlidesEditor";
import { DraftWorkspace, type DraftControls } from "./DraftWorkspace";
import { editHistory, historyOf, moveHistory } from "./history";
import { validateAnchor, type ReviewAnchor } from "./review";
import { ReviewPanel, type ReviewPanelHandle } from "./ReviewPanel";
import { BackupMenu } from "./BackupMenu";
import { ResourcePanel } from "./ResourcePanel";
import { rememberSelection, restoredSelection } from "./workspace-selection";
import "./style.css";
import "./export.css";
import "./review.css";

const SlidesEditor = deferredFeature<ComponentProps<typeof SlideEditorView>>(() => import("./SlidesEditor").then(m => ({ default: m.SlidesEditor })), "演示编辑器");

const newDocument = (name: string, source: string): DocumentRecord => ({
  id: crypto.randomUUID(),
  name,
  versions: [
    {
      id: crypto.randomUUID(),
      source,
      createdAt: new Date().toISOString(),
      label: "原始导入",
    },
  ],
});
const message = (error: unknown) =>
  error instanceof Error ? error.message : "操作失败，请导出备份后重试。";

export default function App() {
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [active, setActive] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const libraryButton = useRef<HTMLButtonElement>(null);
  const dirty = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void listDocuments()
      .then((rows) => {
        setDocs(rows);
        setActive(restoredSelection(rows.map(row => row.id)));
      })
      .catch((e) => setError(message(e)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!loading) rememberSelection(active);
  }, [active, loading]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const switchAllowed = () =>
    !dirty.current ||
    window.confirm(
      "切换文档？已暂存草稿会保留；尚未暂存或未应用的输入可能丢失。建议先保存版本。",
    );
  const select = (id: string) => {
    if (id === active) {
      setLibraryOpen(false);
      libraryButton.current?.focus();
      return;
    }
    if (!switchAllowed()) return;
    dirty.current = false;
    setActive(id);
    setLibraryOpen(false);
    libraryButton.current?.focus();
  };
  const add = async (items: { name: string; source: string }[]) => {
    if (!switchAllowed()) return;
    setBusy(true);
    setError("");
    const added: DocumentRecord[] = [];
    try {
      for (const item of items) {
        const record = newDocument(item.name, item.source);
        await saveDocument(record);
        added.push(record);
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setDocs((previous) => [...added, ...previous]);
      if (added[0]) {
        dirty.current = false;
        setActive(added[0].id);
        setLibraryOpen(false);
      }
      setBusy(false);
    }
  };
  const importFiles = async (files: File[]) => {
    try {
      if (files.length > 100) throw new Error("一次最多导入 100 份 HTML。");
      for (const file of files) {
        if (!/\.html?$/i.test(file.name))
          throw new Error(`暂不支持 ${file.name}，请选择 HTML 文件。`);
        if (file.size > MAX_DOCUMENT_BYTES)
          throw new Error(
            `${file.name} 超过 ${MAX_DOCUMENT_BYTES / 1024 / 1024} MiB 文件限制。`,
          );
      }
      const items = await Promise.all(
        files.map(async (file) => {
          const bytes = await file.arrayBuffer();
          let source: string;
          try {
            source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          } catch {
            throw new Error(
              `${file.name} 不是 UTF-8 编码，请先转换编码，避免中文损坏。`,
            );
          }
          if (!source.trim()) throw new Error(`${file.name} 是空文件。`);
          return { name: file.name, source };
        }),
      );
      await add(items);
    } catch (e) {
      setError(message(e));
    }
  };
  const current = docs.find((doc) => doc.id === active);
  const showLibrary = libraryOpen || (!loading && !current);
  const libraryControl = (
    <button
      ref={libraryButton}
      className="docs-library-toggle"
      aria-label="文档库"
      aria-expanded={showLibrary}
      aria-controls="docs-library"
      title="打开或收起文档库"
      onClick={() => setLibraryOpen(!showLibrary)}
    >
      <span aria-hidden="true">▤</span> 文档
    </button>
  );
  return (
    <div className={`app docs-shell ${showLibrary ? "docs-library-open" : ""}`}>
      <aside
        className="library"
        id="docs-library"
        hidden={!showLibrary}
        aria-label="文档库"
        onKeyDown={(event) => {
          if (event.key === "Escape" && current) {
            setLibraryOpen(false);
            libraryButton.current?.focus();
          }
        }}
      >
        <div className="brand">
          OpenDesign <span>Docs</span>
          {current && (
            <button
              className="docs-library-close"
              aria-label="收起文档库"
              title="收起文档库"
              onClick={() => {
                setLibraryOpen(false);
                libraryButton.current?.focus();
              }}
            >
              ×
            </button>
          )}
        </div>
        <button
          className="primary import"
          disabled={loading || busy}
          onClick={() => input.current?.click()}
        >
          ＋ 导入 HTML
        </button>
        <button
          disabled={loading || busy}
          onClick={() =>
            void add([{ name: "演示页体验.html", source: slideDemo }])
          }
        >
          演示页示例
        </button>
        <BackupMenu
          record={current}
          disabled={loading || busy}
          beforeExport={() => {
            if (!dirty.current) return true;
            setError("请先保存版本，再备份。未应用输入和临时草稿不在备份中。");
            return false;
          }}
          beforeRestore={() => {
            if (!dirty.current) return true;
            setError("请先保存当前修改或提交批注，再恢复备份。原文档不会被覆盖。");
            return false;
          }}
          onRestored={(record) => {
            setDocs((rows) => [record, ...rows]);
            // Restore is asynchronous: don't discard edits made while it ran.
            if (switchAllowed()) {
              dirty.current = false;
              setActive(record.id);
              setLibraryOpen(false);
            }
          }}
        />
        <input
          ref={input}
          type="file"
          multiple
          accept=".html,.htm,text/html"
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void importFiles(files);
          }}
        />
        <label className="search">
          <input
            aria-label="查找文档"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索文件名"
          />
        </label>
        <div className="list-label">
          我的文档 <span>{docs.length}</span>
        </div>
        <nav aria-label="文档列表">
          {docs
            .filter((doc) =>
              doc.name.toLowerCase().includes(query.toLowerCase()),
            )
            .map((doc) => (
              <button
                key={doc.id}
                className={`doc-item ${active === doc.id ? "selected" : ""}`}
                disabled={busy}
                onClick={() => select(doc.id)}
              >
                <span className="file-icon">H</span>
                <span>{doc.name}</span>
              </button>
            ))}
        </nav>
        <div className="local-note">
          <strong>仅存于此浏览器</strong>
          <details>
            <summary>存储说明</summary>
            <p>尚未接入云端。清理浏览器数据会丢失文档，请导出备份。</p>
          </details>
        </div>
      </aside>
      <main className="workspace">
        {error && (
          <div role="alert" className="error">
            {error}
            <button onClick={() => setError("")}>关闭</button>
          </div>
        )}
        {loading ? (
          <div className="empty">正在读取本地文档…</div>
        ) : current ? (
          <DraftWorkspace
            navigation={
              <div className="docs-command-strip">{libraryControl}</div>
            }
            key={current.id}
            record={current}
            onCopy={(copy) => {
              dirty.current = false;
              setDocs((rows) => [copy, ...rows]);
              setActive(copy.id);
            }}
            onSaved={(record) =>
              setDocs((rows) =>
                rows.map((row) => (row.id === record.id ? record : row)),
              )
            }
          >
            {(draft) => (
              <DocumentWorkspace
                record={current}
                draft={draft}
                libraryControl={libraryControl}
                onDirty={(value) => {
                  dirty.current = value;
                }}
                onSaved={draft.saved}
              />
            )}
          </DraftWorkspace>
        ) : (
          <div className="empty">
            <div className="empty-mark">HTML</div>
            <h1>打开 HTML，直接编辑。</h1>
            <p>保留设计，修改内容。</p>
            <button
              onClick={() =>
                void add([{ name: "体验文档.html", source: demo }])
              }
              disabled={busy}
            >
              先用示例试一试
            </button>
            <small>文档仅存于此浏览器。</small>
          </div>
        )}
      </main>
    </div>
  );
}

type EditorProps = {
  record: DocumentRecord;
  onDirty: (dirty: boolean) => void;
  onSaved: (record: DocumentRecord) => Promise<void>;
  draft: DraftControls;
  libraryControl: ReactNode;
};
function DocumentWorkspace(props: EditorProps) {
  const workingSource = props.draft.getSource();
  const pages = useMemo(() => inspectSlides(workingSource), [workingSource]);
  const [slides, setSlides] = useState(pages.length > 0);
  const pending = useRef(false);
  const report = (dirty: boolean) => {
    pending.current = dirty;
    props.onDirty(dirty);
  };
  const change = (next: boolean) => {
    if (next === slides) return;
    if (
      pending.current &&
      !window.confirm(
        "切换视图会保留已应用的内容；未结束或未应用的输入、未提交批注会丢失。继续？",
      )
    )
      return;
    report(false);
    setSlides(next);
  };
  return (
    <>
      <div className="docs-command-strip">
        {props.libraryControl}
        <div className="docs-view-toggle" aria-label="文档视图">
          <button aria-pressed={!slides} onClick={() => change(false)}>
            长文档
          </button>
          <button
            aria-pressed={slides}
            disabled={!pages.length}
            onClick={() => change(true)}
          >
            演示页{pages.length ? ` · ${pages.length}` : ""}
          </button>
        </div>
        {props.draft.status}
      </div>
      {slides && pages.length ? (
        <SlidesEditor
          {...props}
          initialSource={props.draft.getSource()}
          onDirty={report}
        />
      ) : (
        <Editor
          {...props}
          initialSource={props.draft.getSource()}
          onDirty={report}
        />
      )}
    </>
  );
}

function Editor({
  record,
  onDirty,
  onSaved,
  draft,
  initialSource,
}: {
  record: DocumentRecord;
  onDirty: (value: boolean) => void;
  onSaved: (record: DocumentRecord) => Promise<void>;
  draft: DraftControls;
  initialSource: string;
}) {
  const initial = initialSource;
  const [source, setSource] = useState(initial);
  const history = useRef(historyOf(initial));
  const sourceRef = useRef(initial);
  const [renderSource, setRenderSource] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState("");
  const [text, setText] = useState("");
  const [tab, setTab] = useState<"edit" | "versions" | "review">("edit");
  const [reviewVersionId, setReviewVersionId] = useState("");
  const [reviewDirty, setReviewDirty] = useState(false);
  const reviewPanel = useRef<ReviewPanelHandle>(null);
  const reviewVersion = record.versions.find((v) => v.id === reviewVersionId);
  const reviewing = Boolean(reviewVersion);
  const onReviewDirty = useCallback(
    (value: boolean) => setReviewDirty(value),
    [],
  );
  const [status, setStatus] = useState("已保存在本机");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const savingRef = useRef(false);
  const afterFlush = useRef<(() => void) | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [directEditing, setDirectEditing] = useState(false);
  const [ready, setReady] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const dirty = source !== record.versions.at(-1)!.source;
  const inspection = useMemo(() => inspectHtml(source), [source]);
  const channel = useMemo(
    () => crypto.randomUUID(),
    [renderSource, editing, reviewVersionId],
  );
  const preview = useMemo(
    () =>
      createPreview(
        reviewVersion?.source ?? renderSource,
        channel,
        editing && !reviewing,
        0,
        reviewing,
      ),
    [renderSource, channel, editing, reviewVersion, reviewing],
  );
  const target = inspection.targets.find((item) => item.id === selected);
  const pendingText = Boolean(target && text !== target.text);
  useEffect(() => {
    onDirty(
      dirty ||
        directEditing ||
        Boolean(target && text !== target.text) ||
        reviewDirty,
    );
  }, [dirty, directEditing, target?.text, text, reviewDirty]);
  useEffect(
    () => () => {
      clearTimeout(flushTimer.current);
    },
    [],
  );
  useEffect(
    () => () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    },
    [downloadUrl],
  );
  const commit = (next: string, track = true) => {
    if (track) history.current = editHistory(history.current, next);
    sourceRef.current = next;
    setSource(next);
    draft.onSource(next);
    setDownloadUrl("");
    const changed = next !== record.versions.at(-1)!.source;
    onDirty(changed);
    setStatus(changed ? "有未保存修改" : "已保存在本机");
  };
  useEffect(() => {
    setReady(false);
  }, [channel]);
  useEffect(() => {
    setText(target?.text ?? "");
  }, [target?.text, selected]);
  const persist = async () => {
    await draft.beforeSave();
    const nextSource = sourceRef.current;
    if (nextSource === record.versions.at(-1)!.source) {
      savingRef.current = false;
      setSaving(false);
      setStatus("已保存在本机");
      draft.saveFailed();
      return;
    }
    const next: DocumentRecord = {
      ...record,
      versions: [
        ...record.versions,
        {
          id: crypto.randomUUID(),
          source: nextSource,
          createdAt: new Date().toISOString(),
          label: `保存版本 ${record.versions.length + 1}`,
        },
      ],
    };
    try {
      await saveDocument(next, record.versions.at(-1)!.id);
      await onSaved(next);
      onDirty(sourceRef.current !== nextSource);
      setStatus("已保存在本机");
    } catch (e) {
      setError(message(e));
      draft.saveFailed();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.channel !== channel
      )
        return;
      const data = event.data;
      if (data.type === "ready") setReady(true);
      if (data.type === "editing") setDirectEditing(true);
      if (data.type === "ended") setDirectEditing(false);
      if (data.type === "annotation" && reviewVersion) {
        try {
          reviewPanel.current?.selectAnchor(
            validateAnchor(data.anchor, reviewVersion.source),
          );
          setTab("review");
        } catch (e) {
          setError(message(e));
        }
      }
      if (data.type === "anchor-unavailable" && reviewing)
        setError(
          "当前窗口宽度或排版与批注创建时不同，无法精确显示框选位置。请调整至批注注明的视口宽度；批注仍保留在原版本。",
        );
      if (data.type === "select" && typeof data.id === "string") {
        setSelected(data.id);
        setTab("edit");
      }
      if (
        data.type === "edit" &&
        editing &&
        typeof data.id === "string" &&
        typeof data.text === "string"
      ) {
        try {
          const item = inspectHtml(sourceRef.current).targets.find(
            (item) => item.id === data.id,
          );
          if (!item) throw new Error("这段内容暂时不能直接修改。");
          commit(patchText(sourceRef.current, item, data.text));
        } catch (e) {
          setError(message(e));
        }
      }
      if (data.type === "flushed" && afterFlush.current) {
        clearTimeout(flushTimer.current);
        const action = afterFlush.current;
        afterFlush.current = null;
        action();
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  });
  const flush = (action: () => void) => {
    if (!ready || savingRef.current || afterFlush.current) return;
    afterFlush.current = action;
    flushTimer.current = setTimeout(() => {
      afterFlush.current = null;
      setError("页面暂未响应。修改仍保留在当前工作副本，请稍后重试。");
    }, 3000);
    frame.current?.contentWindow?.postMessage({ channel, type: "flush" }, "*");
  };
  const save = () => {
    if (pendingText) {
      setError("右侧文字尚未应用。请先点击“应用修改”，再保存版本。");
      return;
    }
    flush(() => {
      setError("");
      savingRef.current = true;
      setSaving(true);
      void persist();
    });
  };
  const locateReview = (anchor: ReviewAnchor) => {
    setError("");
    frame.current?.contentWindow?.postMessage(
      { channel, type: "review-locate", anchor },
      "*",
    );
  };
  const beginReview = (versionId: string) => {
    if (reviewVersionId === versionId) {
      setTab("review");
      return;
    }
    if (dirty || directEditing || pendingText) {
      setError(
        "请先结束文字编辑、应用修改并保存版本，再开始审阅。批注只绑定已保存版本。",
      );
      return;
    }
    if (
      reviewDirty &&
      !window.confirm("放弃尚未保存的批注或回复，切换审阅版本？")
    )
      return;
    setError("");
    setReviewVersionId(versionId);
    setEditing(false);
    setTab("review");
  };
  const leaveReview = (edit: boolean) => {
    if (pendingText) {
      setError("请先应用右侧文字修改，再切换模式。");
      return;
    }
    if (reviewDirty && !window.confirm("放弃尚未保存的批注或回复，退出审阅？"))
      return;
    flush(() => {
      setReviewVersionId("");
      setRenderSource(sourceRef.current);
      setEditing(edit);
      setTab("edit");
    });
  };
  const undoRedo = (direction: "undo" | "redo") => {
    if (pendingText) {
      setError("请先应用右侧文字修改，再撤销或重做。");
      return;
    }
    flush(() => {
      history.current = moveHistory(history.current, direction);
      commit(history.current.present, false);
      setRenderSource(history.current.present);
      setSelected("");
    });
  };
  const download = () => {
    if (pendingText) {
      setError("右侧文字尚未应用。请先点击“应用修改”，再导出。");
      return;
    }
    const url = URL.createObjectURL(
      new Blob([sourceRef.current], { type: "text/html;charset=utf-8" }),
    );
    setDownloadUrl(url);
  };
  return (
    <div className="docs-long-editor">
      <header className="toolbar">
        <div className="document-title">
          <strong>{record.name}</strong>
          <small aria-live="polite">
            {reviewing ? `审阅 · ${reviewVersion?.label} · 批注仅保存本机` : directEditing
              ? "编辑中 · 结束后暂存"
              : pendingText
                ? "文字待应用 · 未暂存"
                : dirty
                  ? "版本待保存"
                  : status}
          </small>
        </div>
        <div className="toolbar-actions">
          <div className="segmented">
            <button
              aria-pressed={!editing && !reviewing}
              disabled={saving || !ready}
              onClick={() => leaveReview(false)}
            >
              阅读
            </button>
            <button
              aria-pressed={editing && !reviewing}
              title={`双击改字 · Esc 取消 · ${inspection.targets.length} 处可编辑文字`}
              disabled={saving || !ready}
              onClick={() => leaveReview(true)}
            >
              编辑
            </button>
            <button
              aria-pressed={reviewing}
              disabled={saving || !ready}
              onClick={() => beginReview(record.versions.at(-1)!.id)}
            >
              审阅
            </button>
          </div>
          {!reviewing && (
            <>
              <button
                aria-label="撤销"
                title="撤销"
                disabled={saving || !ready || !history.current.past.length}
                onClick={() => undoRedo("undo")}
              >
                ↶
              </button>
              <button
                aria-label="重做"
                title="重做"
                disabled={saving || !ready || !history.current.future.length}
                onClick={() => undoRedo("redo")}
              >
                ↷
              </button>
            </>
          )}
          <ResourcePanel source={reviewVersion?.source ?? source}
            contextKey={`${record.versions.at(-1)!.id}:${reviewVersionId ?? ""}:${reviewing}`}
            disabled={!ready || saving || reviewing || directEditing || pendingText}
            onApply={(expected, next) => {
              if (sourceRef.current !== expected || savingRef.current) throw new Error("文档已变化，请重试。");
              commit(next);
              setRenderSource(next);
              setSelected("");
            }} />
          <button
            disabled={saving || !ready || reviewing}
            onClick={() => flush(download)}
          >
            导出 HTML
          </button>
          <button
            className="primary"
            disabled={saving || !ready || reviewing}
            onClick={save}
          >
            {saving ? "保存中…" : "保存版本"}
          </button>
        </div>
      </header>
      {error && (
        <div role="alert" className="error">
          {error}
          <button onClick={() => setError("")}>关闭</button>
        </div>
      )}
      {downloadUrl && !pendingText && !directEditing && (
        <div className="export-banner" role="region" aria-label="导出已准备好">
          <span>
            HTML 已准备好，保留原脚本与资源引用。请只打开你信任的文档。
          </span>
          <a
            href={downloadUrl}
            download={record.name.replace(/\.html?$/i, "") + "-edited.html"}
          >
            下载文件
          </a>
          <button onClick={() => setDownloadUrl("")}>关闭</button>
        </div>
      )}
      <div className="editor-body">
        <div className="page-container">
          <iframe
            ref={frame}
            title="HTML 文档页面"
            inert={saving || undefined}
            style={{ pointerEvents: saving ? "none" : undefined }}
            srcDoc={preview}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            allow="camera 'none'; microphone 'none'; geolocation 'none'"
          />
        </div>
        <aside className="inspector">
          <div className="panel-tabs">
            <button
              aria-pressed={tab === "edit"}
              onClick={() => setTab("edit")}
            >
              内容
            </button>
            <button
              aria-pressed={tab === "versions"}
              onClick={() => setTab("versions")}
            >
              版本 <span>{record.versions.length}</span>
            </button>
            <button
              aria-pressed={tab === "review"}
              onClick={() =>
                reviewing
                  ? setTab("review")
                  : beginReview(record.versions.at(-1)!.id)
              }
            >
              批注
            </button>
          </div>
          <div hidden={tab !== "review"}>
            <ReviewPanel
              ref={reviewPanel}
              record={record}
              versionId={reviewVersionId}
              onDirty={onReviewDirty}
              onLocate={locateReview}
            />
          </div>
          {tab === "edit" ? (
            <>
              <h2>{target ? "文字" : "选择文字"}</h2>
              {target ? (
                <>
                  <small className="muted">{target.tag.toUpperCase()}</small>
                  <label className="text-label">
                    文字内容
                    <textarea
                      aria-label="文字内容"
                      value={text}
                      disabled={!editing || saving}
                      onChange={(e) => setText(e.target.value)}
                    />
                  </label>
                  <button
                    className="primary"
                    disabled={!editing || saving || text === target.text}
                    onClick={() => {
                      try {
                        const next = patchText(sourceRef.current, target, text);
                        commit(next);
                        setRenderSource(next);
                      } catch (e) {
                        setError(message(e));
                      }
                    }}
                  >
                    应用修改
                  </button>
                </>
              ) : (
                <p>点击页面中的标题或正文。</p>
              )}
              <details className="compatibility">
                <summary>预览与导出说明</summary>
                <p>
                  复杂嵌套文字和 SVG
                  图中文字暂不编辑。导出保留原代码与资源引用，不包含版本历史，也不是离线资源包。
                </p>
                <p>
                  保留静态 HTML、内联 CSS 和
                  SVG。原页面脚本、外部字体和资源不在预览中运行或加载。
                </p>
                <dl>
                  <dt>页面脚本</dt>
                  <dd>{inspection.scripts}</dd>
                  <dt>SVG 图形</dt>
                  <dd>{inspection.svg}</dd>
                  <dt>外部资源引用</dt>
                  <dd>{inspection.externalResources}</dd>
                  <dt>相对路径资源</dt>
                  <dd>{inspection.relativeResources}</dd>
                </dl>
                <p>
                  依赖脚本的图表、切换和动效可能缺失。上述统计仅含 HTML 属性；
                  常见 CSS 引用见“资源”面板。外部 CSS 资源也不在预览中加载。
                </p>
              </details>
            </>
          ) : tab === "versions" ? (
            <>
              <h2>版本历史</h2>
              <p>加载为草稿，保留原有版本。</p>
              {[...record.versions].reverse().map((version, index) => (
                <div className="version" key={version.id}>
                  <strong>
                    {version.label}
                    {index === 0 ? " · 最新" : ""}
                  </strong>
                  <small>
                    {new Date(version.createdAt).toLocaleString("zh-CN")}
                  </small>
                  <button
                    disabled={
                      saving || reviewing || directEditing || pendingText
                    }
                    onClick={() => {
                      if (
                        dirty &&
                        !window.confirm("放弃当前未保存修改，加载这个版本？")
                      )
                        return;
                      commit(version.source);
                      setRenderSource(version.source);
                      setSelected("");
                    }}
                  >
                    加载为草稿
                  </button>
                  <button
                    disabled={saving || !ready}
                    onClick={() => beginReview(version.id)}
                  >
                    审阅此版本
                  </button>
                </div>
              ))}
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
