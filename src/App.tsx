import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type ComponentProps,
} from "react";
import { listDocuments, saveDocument, type DocumentRecord } from "./store";
import { demo, slideDemo } from "./demo";
import { inspectSlides } from "./slides";
import { HandoffDialog, type ImportConfirmation } from "./HandoffDialog";
import type { HandoffItem, ImportResult } from "./handoff";
import { deferredFeature } from "./deferred-feature";
import type { SlidesEditor as SlideEditorView } from "./SlidesEditor";
import type { LongEditor as LongEditorView } from "./LongEditor";
import { DraftWorkspace, type DraftControls } from "./DraftWorkspace";
import { BackupMenu } from "./BackupMenu";
import { rememberSelection, restoredSelection } from "./workspace-selection";
import "./style.css";
import "./export.css";
import "./review.css";

const Studio = deferredFeature<{ onClose: () => void; onCreate: (items: HandoffItem[]) => Promise<ImportResult> }>(() => import("./Studio").then(m => ({ default: m.Studio })), "Studio");
const SlidesEditor = deferredFeature<ComponentProps<typeof SlideEditorView>>(() => import("./SlidesEditor").then(m => ({ default: m.SlidesEditor })), "演示编辑器");
const Editor = deferredFeature<ComponentProps<typeof LongEditorView>>(() => import("./LongEditor").then(m => ({ default: m.LongEditor })), "文档编辑器");

const newDocument = (name: string, source: string, label = "原始导入"): DocumentRecord => ({
  id: crypto.randomUUID(),
  name,
  versions: [
    {
      id: crypto.randomUUID(),
      source,
      createdAt: new Date().toISOString(),
      label,
    },
  ],
});
const leaveMessage = "切换文档？已暂存草稿会保留；尚未暂存或未应用的输入可能丢失。建议先保存版本。";
const message = (error: unknown) =>
  error instanceof Error ? error.message : "操作失败，请导出备份后重试。";

export default function App() {
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [active, setActive] = useState("");
  const [studioOpen, setStudioOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const scenarioLock = useRef(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<ImportConfirmation | null>(null);
  const [query, setQuery] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const libraryButton = useRef<HTMLButtonElement>(null);
  const dirty = useRef(false);
  const editEpoch = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const importing = useRef(false);
  const handoffSave = useRef<(item: HandoffItem) => Promise<ImportResult>>(async () => ({ ok: false, reason: "storage" }));
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    const start = () => {
      if (window.location.hash !== "#handoff=v1") return;
      void import("./handoff").then(({ startHandoff }) => {
        if (!cancelled && window.location.hash === "#handoff=v1") {
          dispose?.();
          dispose = startHandoff(window, item => handoffSave.current(item), setError, message => new Promise(resolve => setConfirmation({ message, resolve })));
        }
      }).catch(() => { if (!cancelled) setError("交接工具加载失败，请刷新重试或导入 HTML 文件。"); });
    };
    window.addEventListener("hashchange", start);
    start();
    return () => { cancelled = true; dispose?.(); window.removeEventListener("hashchange", start); };
  }, [loading]);
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
      leaveMessage,
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
  const add = async (items: HandoffItem[], guard: () => boolean | Promise<boolean> = switchAllowed): Promise<ImportResult> => {
    if (importing.current) return { ok: false, reason: "rejected" };
    importing.current = true;
    if (!await guard()) { importing.current = false; return { ok: false, reason: "rejected" }; }
    const acceptedEpoch = editEpoch.current;
    setBusy(true);
    setError("");
    const added: DocumentRecord[] = [];
    try {
      for (const item of items) {
        const record = newDocument(item.name, item.source, item.label);
        await saveDocument(record);
        added.push(record);
      }
      return { ok: true };
    } catch (e) {
      setError(message(e));
      return { ok: false, reason: "storage" };
    } finally {
      setDocs((previous) => [...added, ...previous]);
      if (added[0] && (editEpoch.current === acceptedEpoch || await guard())) {
        dirty.current = false;
        setActive(added[0].id);
        setLibraryOpen(false);
      }
      setBusy(false);
      importing.current = false;
    }
  };
  handoffSave.current = item => add([item], () => !dirty.current || new Promise<boolean>(resolve => setConfirmation({ message: leaveMessage, resolve })));
  const importFiles = async (files: File[]) => {
    try {
      if (files.length > 100) throw new Error("一次最多导入 100 份 HTML。");
      const { readDocumentFile } = await import("./document-import");
      const items = await Promise.all(files.map(readDocumentFile));
      await add(items);
    } catch (e) {
      setError(message(e));
    }
  };
  const openScenario = async (kind: "teacher" | "enterprise") => {
    if (scenarioLock.current) return;
    scenarioLock.current = true;
    setScenarioLoading(true);
    setError("");
    try {
      const { scenarioDocuments } = await import("./scenarios");
      await add(scenarioDocuments(kind));
    } catch (e) {
      setError(`样板加载失败，请重试。${message(e)}`);
    } finally {
      scenarioLock.current = false;
      setScenarioLoading(false);
    }
  };
  const current = docs.find((doc) => doc.id === active);
  const showLibrary = libraryOpen || (!loading && !current);
  const mcpEntry = <a className="docs-mcp-entry" href={`${import.meta.env.BASE_URL}integrate/#mcp`} target="_blank" rel="noopener noreferrer" title="MCP 接入与开发者文档（新标签页）">MCP 接入 <span aria-hidden="true">↗</span></a>;
  const libraryControl = (
    <>
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
    <button onClick={() => setStudioOpen(true)} title="打开创作工作区，当前文档保留">Studio</button>
    </>
  );
  return (
    <div className={`app docs-shell ${showLibrary ? "docs-library-open" : ""}`}>
      {studioOpen && <Studio onClose={() => setStudioOpen(false)} onCreate={add} />}
      {confirmation && <HandoffDialog request={confirmation} close={() => setConfirmation(null)} />}
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
        <button className="studio-launch" disabled={loading || busy} onClick={() => setStudioOpen(true)}><span>Studio · 创作草稿</span><small>从需求到方案 →</small></button>
        <details className="scenario-library">
          <summary>从场景样板开始</summary>
          <p>免费创建副本，保留你的修改。内容为合成示例。</p>
          <button disabled={loading || busy || scenarioLoading} onClick={() => void openScenario("teacher")}>教师课程 · 9 页＋活动单</button>
          <button disabled={loading || busy || scenarioLoading} onClick={() => void openScenario("enterprise")}>企业提案 · 8 页</button>
          {scenarioLoading && <p role="status">正在创建样板副本…</p>}
        </details>
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
          {mcpEntry}
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
                  editEpoch.current++;
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
        {["Studio 结构草稿", "Studio 服务端独立副本"].includes(props.record.versions[0]?.label ?? "") && <span className="docs-copy-label" title="独立编辑副本；修改不会回写 Studio 草稿">Docs 副本</span>}
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
