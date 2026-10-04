import { useCallback, useEffect, useId, useMemo, useRef, useState, type ComponentProps } from "react";
import "./long-workspace.css";
import { createPreview, inspectHtml, patchText } from "./html";
import { saveDocument, type DocumentRecord } from "./store";
import type { DraftControls } from "./DraftWorkspace";
import { editHistory, historyOf, moveHistory } from "./history";
import { validateAnchor, type ReviewAnchor, type ReviewRecord } from "./review";
import type { ReviewPanelHandle } from "./ReviewPanel";
import { ResourcePanel } from "./ResourcePanel";
import { ExportControl } from "./ExportControl";
import { htmlExportBlob } from "./html-export";
import { deferredFeature } from "./deferred-feature";
import type { DocumentObjectPanelProps } from "./DocumentObjectPanel";
const ReviewTools = deferredFeature<ComponentProps<typeof import("./ReviewPanel").ReviewPanel>>(() => import("./ReviewPanel").then(m => ({ default: m.ReviewPanel })), "批注工具");
const ObjectTools = deferredFeature<DocumentObjectPanelProps>(() => import("./DocumentObjectPanel").then(m => ({ default: m.DocumentObjectPanel })), "对象工具");
const message = (error: unknown) => error instanceof Error ? error.message : "操作失败，请稍后重试。";

export function LongEditor({
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
  const [objectId, setObjectId] = useState("");
  const [objectSize, setObjectSize] = useState<{ width: number; height: number }>();
  const scrollPosition = useRef(0);
  const [text, setText] = useState("");
  const inspectorId = useId();
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [tab, setTab] = useState<"edit" | "versions" | "review" | "outline">("edit");
  const revealPanel = (next: typeof tab) => { setTab(next); setInspectorOpen(true); };
  const [reviewActivated, setReviewActivated] = useState(false);
  const [reviewVersionId, setReviewVersionId] = useState("");
  const [reviewDirty, setReviewDirty] = useState(false);
  const [reviewData, setReviewData] = useState<ReviewRecord | null>(null);
  const [reviewUrl, setReviewUrl] = useState("");
  const exportSequence = useRef(0);
  const reviewPanel = useRef<ReviewPanelHandle>(null);
  const reviewVersion = record.versions.find((v) => v.id === reviewVersionId);
  const reviewing = Boolean(reviewVersion);
  const reviewLoading = reviewing && !reviewData;
  const [markerRuntime, setMarkerRuntime] = useState("");
  const [markerRetry, setMarkerRetry] = useState(0);
  useEffect(() => {
    if (!reviewing || markerRuntime) return;
    let cancelled = false;
    void import("./bento-review-markers").then(m => {
      if (!cancelled) setMarkerRuntime(m.reviewMarkerScript);
    }).catch(() => { if (!cancelled) setError("批注标记加载失败，请重试。"); });
    return () => { cancelled = true; };
  }, [reviewing, markerRuntime, markerRetry]);
  useEffect(() => {
    exportSequence.current++;
    setDownloadUrl("");
    setReviewUrl("");
  }, [reviewVersionId, reviewData, reviewDirty]);
  useEffect(() => () => { if (reviewUrl) URL.revokeObjectURL(reviewUrl); }, [reviewUrl]);
  useEffect(() => () => { exportSequence.current++; }, []);
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
  const headings = useMemo(() => reviewVersion ? inspectHtml(reviewVersion.source).headings : inspection.headings, [reviewVersion, inspection]);
  const channel = useMemo(
    () => crypto.randomUUID(),
    [renderSource, editing, reviewVersionId, markerRuntime],
  );
  const preview = useMemo(
    () =>
      createPreview(
        reviewVersion?.source ?? renderSource,
        channel,
        editing && !reviewing,
        reviewing ? 0 : scrollPosition.current,
        reviewing,
        editing && !reviewing ? node => {
          const loc = node.sourceCodeLocation;
          if (loc?.startTag && node.namespaceURI === "http://www.w3.org/1999/xhtml" &&
            /^(h[1-4]|p|div|section|article|blockquote|figure|ul|ol|li|img)$/.test(node.tagName))
            node.attrs.push({ name: "data-doc-object", value: `doc-${loc.startOffset}` });
        } : undefined,
        markerRuntime,
      ),
    [renderSource, channel, editing, reviewVersion, reviewing, markerRuntime],
  );
  const target = inspection.targets.find((item) => item.id === selected);
  const pendingText = Boolean(target && text !== target.text);
  const [geometryDraft, setGeometryDraft] = useState(false);
  const pendingChanges = pendingText || geometryDraft;
  useEffect(() => {
    onDirty(
      dirty ||
        directEditing ||
        pendingChanges ||
        reviewDirty,
    );
  }, [dirty, directEditing, target?.text, text, reviewDirty, geometryDraft]);
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
    try {
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
      if (data.type === "scroll-position" && Number.isFinite(data.scroll) && data.scroll >= 0) scrollPosition.current = Math.min(data.scroll, 1e7);
      if (data.type === "object-select" && editing && !reviewing && !pendingChanges && typeof data.id === "string") {
        setObjectId(data.id);
        setObjectSize(data.width > 0 && data.height > 0 ? { width: data.width, height: data.height } : undefined);
        revealPanel("edit");
      }
      if (data.type === "review-open" && reviewing && !reviewLoading && typeof data.id === "string") {
        revealPanel("review");
        reviewPanel.current?.openThread(data.id);
      }
      if (data.type === "editing") setDirectEditing(true);
      if (data.type === "ended") setDirectEditing(false);
      if (data.type === "annotation" && reviewVersion && !reviewLoading) {
        try {
          reviewPanel.current?.selectAnchor(
            validateAnchor(data.anchor, reviewVersion.source),
          );
          revealPanel("review");
        } catch (e) {
          setError(message(e));
        }
      }
      if (data.type === "anchor-unavailable" && reviewing)
        setError(
          "当前窗口宽度或排版与批注创建时不同，无法精确显示框选位置。请调整至批注注明的视口宽度；批注仍保留在原版本。",
        );
      if (data.type === "select" && typeof data.id === "string") {
        if (pendingChanges) { setError("请先应用或取消右侧修改。"); return; }
        setSelected(data.id);
        revealPanel("edit");
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
          const next = patchText(sourceRef.current, item, data.text);
          commit(next);
          setRenderSource(next);
          setDirectEditing(false);
        } catch (e) {
          // A following acknowledgement must not save/export stale source.
          clearTimeout(flushTimer.current);
          afterFlush.current = null;
          setError(message(e));
        }
      }
      if (data.type === "flush-blocked") {
        clearTimeout(flushTimer.current);
        afterFlush.current = null;
        setError("请先确认或取消输入法候选文字，再保存或导出。");
      }
      if (data.type === "flushed" && afterFlush.current) {
        clearTimeout(flushTimer.current);
        const action = afterFlush.current;
        afterFlush.current = null;
        action();
      }
    };
    window.addEventListener("message", receive);
    if (!ready) frame.current?.contentWindow?.postMessage({ channel, type: "request-ready" }, "*");
    return () => window.removeEventListener("message", receive);
  });
  useEffect(() => {
    if (ready && editing && !reviewing) frame.current?.contentWindow?.postMessage({ channel, type: "object-focus", id: objectId }, "*");
  }, [ready, channel, editing, reviewing, objectId]);
  useEffect(() => {
    if (ready && reviewing) frame.current?.contentWindow?.postMessage({ channel, type: "review-markers",
      threads: reviewData?.id === record.id ? reviewData.threads.filter(t => t.versionId === reviewVersionId) : [] }, "*");
  }, [ready, channel, reviewing, reviewData, record.id, reviewVersionId]);
  const flush = (action: () => void) => {
    if (!ready || savingRef.current || afterFlush.current) return;
    afterFlush.current = action;
    flushTimer.current = setTimeout(() => {
      afterFlush.current = null;
      setError("页面未响应，修改已保留，请重试。");
    }, 3000);
    frame.current?.contentWindow?.postMessage({ channel, type: "flush" }, "*");
  };
  const save = () => {
    if (pendingChanges) {
      revealPanel("edit");
      setError("修改未应用，请应用或取消后保存。");
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
      revealPanel("review");
      return;
    }
    if (dirty || directEditing || pendingChanges) {
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
    setReviewActivated(true);
    setReviewVersionId(versionId);
    setEditing(false);
    revealPanel("review");
  };
  const leaveReview = (edit: boolean) => {
    if (pendingChanges) {
      revealPanel("edit");
      setError("请先应用或取消右侧修改，再切换模式。");
      return;
    }
    if (reviewDirty && !window.confirm("放弃尚未保存的批注或回复，退出审阅？"))
      return;
    flush(() => {
      setReviewVersionId("");
      setRenderSource(sourceRef.current);
      setEditing(edit);
      revealPanel("edit");
    });
  };
  const undoRedo = (direction: "undo" | "redo") => {
    if (pendingChanges) {
      revealPanel("edit");
      setError("请先应用或取消右侧修改，再撤销或重做。");
      return;
    }
    flush(() => {
      history.current = moveHistory(history.current, direction);
      commit(history.current.present, false);
      setRenderSource(history.current.present);
      setSelected("");
      setObjectId("");
    });
  };
  const download = async () => {
    if (pendingChanges) {
      revealPanel("edit");
      setError("修改未应用，请应用或取消后导出。");
      return;
    }
    setError("");
    const sequence = ++exportSequence.current;
    let snapshot = "";
    if (reviewVersion) {
      if (reviewDirty || !reviewData) { setError("请先保存批注，再导出审阅副本。"); return; }
      try {
        const { reviewExportHtml } = await import("./review-export");
        snapshot = reviewExportHtml(record.name, reviewVersion, reviewData);
      } catch (e) { if (sequence === exportSequence.current) setError(message(e)); return; }
      if (sequence !== exportSequence.current) return;
    }
    const url = URL.createObjectURL(
      htmlExportBlob(reviewVersion?.source ?? sourceRef.current),
    );
    setReviewUrl(snapshot ? URL.createObjectURL(htmlExportBlob(snapshot)) : "");
    setDownloadUrl(url);
  };
  return (
    <div className={`docs-long-editor${inspectorOpen ? "" : " long-inspector-hidden"}`}>
      <header className="toolbar">
        <div className="document-title">
          <strong>{record.name}</strong>
          <small aria-live="polite">
            {saving ? "正在保存版本…" : reviewing ? `审阅 · ${reviewVersion?.label} · 批注仅保存本机` : directEditing
              ? "编辑中 · 结束后暂存"
              : pendingChanges
                ? "修改待应用 · 未暂存"
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
                className="icon-button"
                data-icon="undo"
                aria-label="撤销"
                title="撤销"
                disabled={saving || !ready || !history.current.past.length}
                onClick={() => undoRedo("undo")}
              />
              <button
                className="icon-button"
                data-icon="redo"
                aria-label="重做"
                title="重做"
                disabled={saving || !ready || !history.current.future.length}
                onClick={() => undoRedo("redo")}
              />
            </>
          )}
          <ResourcePanel source={reviewVersion?.source ?? source}
            contextKey={`${record.versions.at(-1)!.id}:${reviewVersionId ?? ""}:${reviewing}`}
            disabled={!ready || saving || reviewing || directEditing || pendingChanges}
            onApply={(expected, next) => {
              if (sourceRef.current !== expected || savingRef.current) throw new Error("文档已变化，请重试。");
              commit(next);
              setRenderSource(next);
              setSelected("");
              setObjectId("");
            }} />
          <ExportControl name={record.name} url={!pendingChanges && !directEditing ? downloadUrl : ""}
            reviewUrl={reviewUrl} versionLabel={reviewVersion?.label ?? ""}
            disabled={saving || !ready || (reviewing && (!reviewData || reviewDirty))} onPrepare={() => flush(() => void download())}
            onDismiss={() => { setDownloadUrl(""); setReviewUrl(""); }} />
          <button
            className="primary tool-button"
            data-icon="save"
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
          {reviewing && !markerRuntime && <button onClick={() => { setError(""); setMarkerRetry(n => n + 1); }}>重试标记</button>}
          <button onClick={() => setError("")}>关闭</button>
        </div>
      )}
      <div className="long-workspace-bar">
        <span>{reviewing ? "审阅已保存版本" : editing ? "编辑工作副本" : "阅读文档"}<small>{reviewing ? "批注绑定当前审阅版本" : "保存版本后可回看"}</small></span>
        <button aria-expanded={inspectorOpen} aria-controls={inspectorId}
          onClick={() => setInspectorOpen(open => !open)}>
          {inspectorOpen ? "收起侧栏" : "展开侧栏"}{!inspectorOpen && pendingChanges ? " · 修改待应用" : !inspectorOpen && reviewDirty ? " · 批注待保存" : ""}
        </button>
      </div>
      <div className="editor-body">
        <div className="page-container">
          <iframe
            key={channel}
            ref={frame}
            title="HTML 文档页面"
            onLoad={() => frame.current?.contentWindow?.postMessage({ channel, type: "request-ready" }, "*")}
            inert={saving || pendingChanges || reviewLoading || undefined}
            style={{ pointerEvents: saving || pendingChanges || reviewLoading ? "none" : undefined }}
            srcDoc={preview}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            allow="camera 'none'; microphone 'none'; geolocation 'none'"
          />
        </div>
        <aside id={inspectorId} aria-label="文档工具" className="inspector" hidden={!inspectorOpen}>
          <div className="panel-tabs">
            <button aria-pressed={tab === "outline"} onClick={() => setTab("outline")}>目录</button>
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
            {reviewActivated && <ReviewTools
              ref={reviewPanel}
              record={record}
              versionId={reviewVersionId}
              onDirty={onReviewDirty}
              onLocate={locateReview}
              onReviewChange={setReviewData}
            />}
          </div>
          <div hidden={tab !== "outline"}>
            <nav className="document-outline" aria-label="文档目录">
              <h2>章节目录</h2>
              {headings.length ? <ol>{headings.map(heading => <li key={heading.id}>
                <button disabled={!ready || saving || directEditing || pendingChanges}
                  style={{ paddingInlineStart: 10 + (heading.level - 1) * 12 }}
                  onClick={() => frame.current?.contentWindow?.postMessage({ channel, type: "heading-locate", id: heading.id }, "*")}
                >{heading.text}</button>
              </li>)}</ol> : <p>暂无标题，添加后可定位章节。</p>}
              {(directEditing || pendingChanges) && <p>结束编辑或应用修改后可跳转。</p>}
            </nav>
          </div>
          <div hidden={tab !== "edit"}>
              {editing && !reviewing && <ObjectTools source={source} selected={objectId} size={objectSize}
                disabled={!ready || saving || directEditing || pendingText}
                onGeometryDraft={setGeometryDraft}
                onSelect={id => { setSelected(""); setObjectId(id); setObjectSize(undefined); }}
                onApply={(expected, next, id) => {
                  if (sourceRef.current !== expected || savingRef.current || reviewing || !editing || pendingText || directEditing) throw new Error("页面已变化，请重新选择。");
                  commit(next); setRenderSource(next); setSelected(""); setObjectId(id); setObjectSize(undefined);
                }} />}
              <h2>{target ? "文字" : editing ? "双击改字" : "选择文字"}</h2>
              {target ? (
                <>
                  <small className="muted">{target.tag.toUpperCase()}</small>
                  <label className="text-label">
                    文字内容
                    <textarea
                      aria-label="文字内容"
                      value={text}
                      disabled={!editing || saving || directEditing || geometryDraft}
                      onChange={(e) => setText(e.target.value)}
                    />
                  </label>
                  <button
                    className="primary"
                    disabled={!editing || saving || directEditing || geometryDraft || text === target.text}
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
                  {pendingText && <button className="long-cancel-text" disabled={saving || directEditing}
                    onClick={() => { setText(target.text); setError(""); }}>取消文字修改</button>}
                </>
              ) : (
                <p>点击标题或正文。</p>
              )}
              <details className="compatibility">
                <summary>预览与导出说明</summary>
                <p>
                  分段改字，按原顺序调整；SVG 内部不可编辑。
                </p>
                <p>
                  预览禁用脚本和外部资源。导出保留原代码及引用，不含历史或离线资源。
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
                  HTML 属性统计；CSS 见“资源”。
                </p>
              </details>
          </div>
          <div hidden={tab !== "versions"}>
              <h2>版本历史</h2>
              <p>加载草稿，保留原版本。</p>
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
                      saving || reviewing || directEditing || pendingChanges
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
                      setObjectId("");
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
          </div>
        </aside>
      </div>
    </div>
  );
}
