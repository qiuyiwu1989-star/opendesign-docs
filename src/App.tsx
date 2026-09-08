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
import { MAX_DOCUMENT_BYTES } from "./slide-insert";
import { deferredFeature } from "./deferred-feature";
import type { SlidesEditor as SlideEditorView } from "./SlidesEditor";
import type { LongEditor as LongEditorView } from "./LongEditor";
import { DraftWorkspace, type DraftControls } from "./DraftWorkspace";
import { BackupMenu } from "./BackupMenu";
import { rememberSelection, restoredSelection } from "./workspace-selection";
import "./style.css";
import "./export.css";
import "./review.css";

const SlidesEditor = deferredFeature<ComponentProps<typeof SlideEditorView>>(() => import("./SlidesEditor").then(m => ({ default: m.SlidesEditor })), "演示编辑器");
const Editor = deferredFeature<ComponentProps<typeof LongEditorView>>(() => import("./LongEditor").then(m => ({ default: m.LongEditor })), "文档编辑器");

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
