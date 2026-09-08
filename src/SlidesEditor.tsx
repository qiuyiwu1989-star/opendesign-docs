import { useEffect, useMemo, useRef, useState } from "react";
import { inspectHtml, patchText } from "./html";
import { historyOf, editHistory, moveHistory } from "./history";
import {
  createSlidePreview,
  inspectSlides,
  patchPlacement,
  validatePlacement,
  type Placement,
} from "./slides";
import { saveDocument, type DocumentRecord } from "./store";
import "./slides.css";
import { ResourcePanel } from "./ResourcePanel";
import { ExportControl } from "./ExportControl";
import { htmlExportBlob } from "./html-export";
import { inspectTextRuns, patchTextRuns } from "./text-runs";
import { TextRunInspector } from "./TextRunInspector";
import type { DraftControls } from "./DraftWorkspace";
import {
  insertSlideText,
  insertSlideImage,
  slideInsertionAvailability,
} from "./slide-insert";
import { prepareLocalImage } from "./image-import";
import {
  getObjectCapabilities,
  duplicateObject,
  removeObject,
  patchObjectTextStyle,
  replaceObjectImage,
} from "./object-edit";
import { ObjectStyleInspector } from "./ObjectStyleInspector";
import { SlideThumbnails } from "./SlideThumbnails";
import { SlidePresentation } from "./SlidePresentation";
import {
  pageCapabilities,
  editPage,
  getPageTarget,
  type PageAction,
} from "./page-edit";
import {
  alignmentPlacement,
  validateGeometry,
  type Geometry,
  type Alignment,
} from "./object-arrange";
import { isSingleBackground, patchBackgroundImage } from "./background-image";
import { composingKey } from "./editing-keys";
export function SlidesEditor({
  record,
  onDirty,
  onSaved,
  draft,
  initialSource,
}: {
  record: DocumentRecord;
  onDirty: (dirty: boolean) => void;
  onSaved: (record: DocumentRecord) => Promise<void>;
  draft: DraftControls;
  initialSource: string;
}) {
  const initial = initialSource;
  const [source, setSource] = useState(initial),
    [renderSource, setRenderSource] = useState(initial);
  const sourceRef = useRef(initial),
    history = useRef(historyOf(initial));
  const [pageIndex, setPageIndex] = useState(0),
    [selected, setSelected] = useState("");
  const [presentation, setPresentation] = useState<null | {
    source: string;
    pageId: string;
  }>(null);
  const presentButton = useRef<HTMLButtonElement>(null);
  const wasPresenting = useRef(false);
  const restorePresentationFocus = useRef(false);
  const [readingImage, setReadingImage] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true),
    editEpoch = useRef(0);
  const imageIntent = useRef<null | {
    epoch: number;
    source: string;
    pageId: string;
    versionId: string;
    objectId?: string;
    imageSize?: { width: number; height: number };
    mode?: "background";
    background?: string;
  }>(null);
  const versionRef = useRef(record.versions.at(-1)!.id);
  versionRef.current = record.versions.at(-1)!.id;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      imageIntent.current = null;
    };
  }, []);
  // Bridge messages can arrive before React has rendered the selection state.
  const selectionRef = useRef({ id: "", editable: false });
  const selectedImageSize = useRef<
    { width: number; height: number } | undefined
  >(undefined);
  const selectedGeometry = useRef<Geometry | undefined>(undefined);
  const [background, setBackground] = useState("");
  const [position, setPosition] = useState<Placement>({ x: 0, y: 0, scale: 1 });
  const [positionDraft, setPositionDraft] = useState(false);
  const [textDraft, setTextDraft] = useState(false);
  const [styleDraft, setStyleDraft] = useState(false);
  const styleDraftRef = useRef(false);
  const changeStyleDraft = (value: boolean) => {
    editEpoch.current += 1;
    styleDraftRef.current = value;
    setStyleDraft(value);
    if (!value) setError("");
  };
  const [textRevision, setTextRevision] = useState(0);
  const textDraftRef = useRef(false);
  const changeTextDraft = (value: boolean) => {
    editEpoch.current += 1;
    textDraftRef.current = value;
    setTextDraft(value);
    if (!value) setError("");
  };
  const appliedPosition = useRef<Placement>({ x: 0, y: 0, scale: 1 });
  const [editable, setEditable] = useState(false),
    [ready, setReady] = useState(false),
    [saving, setSaving] = useState(false),
    [direct, setDirect] = useState(false);
  useEffect(() => {
    if (wasPresenting.current && !presentation)
      restorePresentationFocus.current = true;
    wasPresenting.current = presentation !== null;
    if (!presentation && ready && restorePresentationFocus.current) {
      presentButton.current?.focus();
      restorePresentationFocus.current = false;
    }
  }, [presentation, ready]);
  const [error, setError] = useState(""),
    [size, setSize] = useState(""),
    [download, setDownload] = useState("");
  const frame = useRef<HTMLIFrameElement>(null),
    flushRef = useRef<null | (() => void)>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    busy = useRef(false);
  const viewport = useRef<HTMLDivElement>(null);
  const [canvasScale, setCanvasScale] = useState(1);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setCanvasScale(
        Math.max(
          0.05,
          Math.min(el.clientWidth / 1280, el.clientHeight / 720, 1),
        ),
      ),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const pages = useMemo(() => inspectSlides(source), [source]),
    page = pages[Math.min(pageIndex, Math.max(0, pages.length - 1))];
  useEffect(() => {
    setPageIndex((index) => Math.min(index, Math.max(0, pages.length - 1)));
  }, [pages.length]);
  const pageActions = useMemo(
    () => (page ? pageCapabilities(source, page.id) : null),
    [source, page?.id],
  );
  const pageIdRef = useRef(page?.id);
  pageIdRef.current = page?.id;
  const insertion = useMemo(
    () =>
      page
        ? slideInsertionAvailability(source, page.id)
        : { allowed: false, reason: "请选择演示页" },
    [source, page?.id],
  );
  const target = page?.objects.find((o) => o.id === selected);
  const capabilities = useMemo(
    () => (target ? getObjectCapabilities(source, target) : null),
    [source, target],
  );
  const textRuns = useMemo(
    () => (target ? inspectTextRuns(source, target) : null),
    [source, target],
  );
  // A bridge edit mutates the live frame without updating renderSource. Undo may
  // return to that same string, so an explicit repaint revision is necessary.
  const [renderRevision, setRenderRevision] = useState(0);
  const channel = useMemo(
    () => crypto.randomUUID(),
    [renderSource, pageIndex, renderRevision],
  );
  const preview = useMemo(
    () => (page ? createSlidePreview(renderSource, channel, page.id) : ""),
    [renderSource, channel, page?.id],
  );
  const dirty = source !== record.versions.at(-1)!.source;
  useEffect(
    () => onDirty(dirty || direct || positionDraft || textDraft || styleDraft),
    [dirty, direct, positionDraft, textDraft, styleDraft, onDirty],
  );
  useEffect(() => {
    setReady(false);
  }, [channel]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(
    () => () => {
      if (download) URL.revokeObjectURL(download);
    },
    [download],
  );
  const commit = (next: string, repaint = true, track = true) => {
    editEpoch.current += 1;
    if (track) history.current = editHistory(history.current, next);
    sourceRef.current = next;
    setSource(next);
    draft.onSource(next);
    setTextRevision((value) => value + 1);
    setDownload("");
    if (repaint) {
      setRenderSource(next);
      setRenderRevision((revision) => revision + 1);
    }
  };
  const select = (id: string) =>
    frame.current?.contentWindow?.postMessage(
      { channel, type: "select-object", id },
      "*",
    );
  const applyLayout = (id: string, placement: Placement) => {
    setPosition(placement);
    appliedPosition.current = placement;
    frame.current?.contentWindow?.postMessage(
      { channel, type: "apply-placement", id, placement },
      "*",
    );
  };
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.channel !== channel
      )
        return;
      const d = event.data;
      try {
        if (d.type === "slide-ready") {
          setReady(true);
          setSize(`${d.width} × ${d.height}`);
          if (selected) select(selected);
        }
        if (d.type === "object-clear") {
          if (positionDraft || textDraftRef.current || styleDraftRef.current) {
            if (selectionRef.current.id) select(selectionRef.current.id);
          } else {
            editEpoch.current += 1;
            resetSelection();
          }
        }
        if (
          d.type === "object-select" &&
          !positionDraft &&
          !textDraftRef.current &&
          !styleDraftRef.current &&
          page?.objects.some((o) => o.id === d.id)
        ) {
          if (selectionRef.current.id !== d.id) editEpoch.current += 1;
          setSelected(d.id);
          const p = validatePlacement(d.placement);
          setPosition(p);
          appliedPosition.current = p;
          setEditable(d.placement.editable === true);
          selectionRef.current = {
            id: d.id,
            editable: d.placement.editable === true,
          };
          const imageSize = d.imageSize;
          selectedImageSize.current =
            imageSize &&
            [imageSize.width, imageSize.height].every(
              (v) =>
                typeof v === "number" &&
                Number.isFinite(v) &&
                v > 0 &&
                v <= 20000,
            )
              ? { width: imageSize.width, height: imageSize.height }
              : undefined;
          selectedGeometry.current = undefined;
          if (d.geometry && d.placement.editable === true) {
            try {
              selectedGeometry.current = validateGeometry(d.geometry);
            } catch {
              /* Unsupported layout. */
            }
          }
          setBackground(
            typeof d.backgroundImage === "string" &&
              isSingleBackground(d.backgroundImage)
              ? d.backgroundImage
              : "",
          );
        }
        if (d.type === "editing") {
          editEpoch.current += 1;
          setDirect(true);
        }
        if (d.type === "ended") setDirect(false);
        if (d.type === "layout-locked")
          setError("此对象暂不支持移动，可选择外层容器。");
        if (
          d.type === "placement" &&
          !positionDraft &&
          !textDraftRef.current &&
          !styleDraftRef.current &&
          selectionRef.current.editable &&
          d.id === selectionRef.current.id
        ) {
          const object = inspectSlides(sourceRef.current)[
            pageIndex
          ]?.objects.find((o) => o.id === d.id);
          if (!object) throw new Error("对象已变化，请重新选择。");
          const placement = validatePlacement(d.placement);
          commit(patchPlacement(sourceRef.current, object, placement), false);
          applyLayout(d.id, placement);
        }
        if (d.type === "edit" && typeof d.text === "string") {
          if (styleDraftRef.current)
            throw new Error("请先应用或取消文字样式。");
          if (textDraftRef.current) throw new Error("请先应用或取消侧栏改字。");
          const text = inspectHtml(sourceRef.current).targets.find(
            (t) => t.id === d.id,
          );
          if (!text) throw new Error("文字结构暂不支持直接修改。");
          commit(patchText(sourceRef.current, text, d.text), false);
          setDirect(false);
        }
        if (d.type === "flushed" && flushRef.current) {
          clearTimeout(timer.current);
          const done = flushRef.current;
          flushRef.current = null;
          done();
        }
      } catch (e) {
        // Never let a subsequent flush acknowledgement export/save a stale edit.
        clearTimeout(timer.current);
        flushRef.current = null;
        setError(e instanceof Error ? e.message : "编辑失败，请重试。");
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  });
  const flush = (action: () => void) => {
    if (styleDraftRef.current) {
      setError("请先应用或取消文字样式。");
      return;
    }
    if (textDraftRef.current) {
      setError("文字尚未应用，请先应用文字或取消改字，再保存、导出或切页。");
      return;
    }
    if (positionDraft) {
      setError("位置数值尚未应用，请先应用或取消调整，再保存、导出或切页。");
      return;
    }
    if (!ready || busy.current || flushRef.current) return;
    flushRef.current = action;
    timer.current = setTimeout(() => {
      flushRef.current = null;
      setError("页面没有响应，请保留当前页面后重试。");
    }, 3000);
    frame.current?.contentWindow?.postMessage({ channel, type: "flush" }, "*");
  };
  const save = () =>
    flush(() => {
      if (sourceRef.current === record.versions.at(-1)!.source) return;
      busy.current = true;
      setSaving(true);
      setError("");
      const next = {
        ...record,
        versions: [
          ...record.versions,
          {
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            source: sourceRef.current,
            label: `演示编辑 ${record.versions.length + 1}`,
          },
        ],
      };
      void draft
        .beforeSave()
        .then(() => saveDocument(next, record.versions.at(-1)!.id))
        .then(async () => {
          setRenderSource(next.versions.at(-1)!.source);
          await onSaved(next);
        })
        .catch((e) => {
          setError(e.message);
          draft.saveFailed();
        })
        .finally(() => {
          busy.current = false;
          setSaving(false);
        });
    });
  const move = (p: Placement) => {
    if (!target || !editable || textDraftRef.current || styleDraftRef.current)
      return;
    try {
      const placement = validatePlacement(p);
      commit(patchPlacement(sourceRef.current, target, placement), false);
      setPositionDraft(false);
      applyLayout(target.id, placement);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败。");
    }
  };
  const finishInsert = (result: { source: string; objectId: string }) => {
    commit(result.source);
    selectedGeometry.current = undefined;
    setBackground("");
    setSelected(result.objectId);
    selectionRef.current = { id: result.objectId, editable: false };
    setEditable(false);
    setError("");
  };
  const resetSelection = () => {
    setSelected("");
    selectionRef.current = { id: "", editable: false };
    selectedImageSize.current = undefined;
    selectedGeometry.current = undefined;
    setBackground("");
    setEditable(false);
  };
  const changePage = (id: string) => {
    const index = inspectSlides(sourceRef.current).findIndex(
      (p) => p.id === id,
    );
    if (index < 0) return;
    editEpoch.current += 1;
    if (index !== pageIndex || sourceRef.current !== renderSource)
      setReady(false);
    setRenderSource(sourceRef.current);
    setPageIndex(index);
    resetSelection();
  };
  const alignObject = (alignment: Alignment) => {
    const id = selectionRef.current.id;
    const epoch = editEpoch.current;
    flush(() => {
      try {
        const geometry = selectedGeometry.current;
        if (
          epoch !== editEpoch.current ||
          id !== selectionRef.current.id ||
          !geometry ||
          !selectionRef.current.editable
        )
          throw new Error("请重新选择对象后对齐。");
        const object = inspectSlides(sourceRef.current)[
          pageIndex
        ]?.objects.find((o) => o.id === id);
        if (!object) throw new Error("对象已变化，请重新选择。");
        const placement = alignmentPlacement(
          appliedPosition.current,
          geometry,
          alignment,
        );
        commit(patchPlacement(sourceRef.current, object, placement), false);
        applyLayout(id, placement);
        selectedGeometry.current = undefined;
        select(id);
        setError("");
      } catch (error) {
        setError(error instanceof Error ? error.message : "对齐失败。");
      }
    });
  };
  const arrangePage = (action: PageAction) => {
    if (!page) return;
    const id = page.id;
    const expected = getPageTarget(sourceRef.current, id);
    flush(() => {
      try {
        const result = editPage(sourceRef.current, id, action, expected);
        commit(result.source);
        changePage(result.pageId);
        setError("");
      } catch (error) {
        setError(error instanceof Error ? error.message : "页面操作失败。");
      }
    });
  };
  const addText = () =>
    flush(() => {
      try {
        if (!page) return;
        finishInsert(insertSlideText(sourceRef.current, page.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "文字插入失败。");
      }
    });
  const chooseImage = (objectId?: string, mode?: "background") => {
    if (
      direct ||
      textDraftRef.current ||
      styleDraftRef.current ||
      positionDraft
    ) {
      setError("请先结束编辑，再选择图片。");
      return;
    }
    if (!page || !ready || busy.current || flushRef.current) return;
    imageIntent.current = {
      epoch: editEpoch.current,
      source: sourceRef.current,
      pageId: page.id,
      versionId: versionRef.current,
      ...(objectId ? { objectId } : {}),
      ...(mode === "background" ? { mode, background } : {}),
      ...(objectId && selectedImageSize.current
        ? { imageSize: { ...selectedImageSize.current } }
        : {}),
    };
    // Preserve the browser's user activation for the native file picker.
    imageInput.current?.click();
  };
  const readImage = async (file?: File) => {
    const intent = imageIntent.current;
    imageIntent.current = null;
    if (!file || !intent) return;
    setReadingImage(true);
    try {
      const image = await prepareLocalImage(file);
      if (!alive.current) return;
      if (
        intent.epoch !== editEpoch.current ||
        intent.source !== sourceRef.current ||
        intent.versionId !== versionRef.current ||
        intent.pageId !== pageIdRef.current ||
        busy.current ||
        flushRef.current
      ) {
        setError("页面已变化，请重新插入图片。");
        return;
      }
      if (intent.objectId) {
        const object = inspectSlides(sourceRef.current)
          .find((p) => p.id === intent.pageId)
          ?.objects.find((o) => o.id === intent.objectId);
        if (!object || selectionRef.current.id !== intent.objectId)
          throw new Error("对象已变化，请重新选择图片。");
        commit(
          intent.mode === "background"
            ? patchBackgroundImage(
                sourceRef.current,
                object,
                image,
                intent.background ?? "",
              )
            : replaceObjectImage(
                sourceRef.current,
                object,
                image,
                intent.imageSize,
              ),
        );
        setError("");
      } else
        finishInsert(insertSlideImage(sourceRef.current, intent.pageId, image));
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "图片插入失败。");
    } finally {
      if (alive.current) setReadingImage(false);
    }
  };
  return (
    <>
      <div
        className="slide-editor-surface"
        inert={presentation !== null || undefined}
      >
        <header className="toolbar slide-toolbar">
          <div className="document-title">
            <strong>{record.name}</strong>
            <small>
              {styleDraft
                ? "样式未应用"
                : textDraft
                  ? "文字未应用"
                  : positionDraft
                    ? "位置未应用"
                    : direct
                      ? "正在编辑"
                      : dirty
                        ? "版本未保存"
                        : "已保存在本机"}
            </small>
          </div>
          <div className="toolbar-actions">
            <button
              aria-label="从当前页放映"
              ref={presentButton}
              disabled={
                !ready ||
                saving ||
                readingImage ||
                !page ||
                textDraft ||
                styleDraft ||
                positionDraft
              }
              onClick={() =>
                flush(() => {
                  if (page) {
                    editEpoch.current += 1;
                    imageIntent.current = null;
                    setPresentation({
                      source: sourceRef.current,
                      pageId: page.id,
                    });
                  }
                })
              }
            >
              ▶ <span>放映</span>
            </button>
            <div
              className="slide-insert-tools"
              role="group"
              aria-label="插入对象"
            >
              <button
                onClick={addText}
                disabled={
                  !ready ||
                  saving ||
                  textDraft ||
                  styleDraft ||
                  positionDraft ||
                  !insertion.allowed
                }
                title={insertion.reason || "插入文字"}
                aria-label="插入文字"
              >
                T <span>文字</span>
              </button>
              <button
                onClick={() => chooseImage()}
                disabled={
                  !ready ||
                  saving ||
                  readingImage ||
                  direct ||
                  textDraft ||
                  styleDraft ||
                  positionDraft ||
                  !insertion.allowed
                }
                title={
                  direct
                    ? "请先结束文字编辑"
                    : insertion.reason || "插入本机图片"
                }
                aria-label="插入图片"
              >
                ▧ <span>{readingImage ? "读取中…" : "图片"}</span>
              </button>
              <input
                ref={imageInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                aria-label="选择本机图片"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  void readImage(file);
                }}
              />
            </div>
            <button
              disabled={!ready || saving || !history.current.past.length}
              onClick={() =>
                flush(() => {
                  history.current = moveHistory(history.current, "undo");
                  commit(history.current.present, true, false);
                  setSelected("");
                  selectionRef.current = { id: "", editable: false };
                  setEditable(false);
                })
              }
            >
              撤销
            </button>
            <button
              disabled={!ready || saving || !history.current.future.length}
              onClick={() =>
                flush(() => {
                  history.current = moveHistory(history.current, "redo");
                  commit(history.current.present, true, false);
                  setSelected("");
                  selectionRef.current = { id: "", editable: false };
                  setEditable(false);
                })
              }
            >
              重做
            </button>
            <ExportControl
              name={record.name}
              url={
                !textDraft && !styleDraft && !positionDraft && !direct
                  ? download
                  : ""
              }
              disabled={!ready || saving || readingImage}
              onDismiss={() => setDownload("")}
              onPrepare={() =>
                flush(() =>
                  setDownload(
                    URL.createObjectURL(htmlExportBlob(sourceRef.current)),
                  ),
                )
              }
            />
            <ResourcePanel
              source={source}
              contextKey={record.versions.at(-1)!.id}
              disabled={
                !ready ||
                saving ||
                readingImage ||
                direct ||
                textDraft ||
                styleDraft ||
                positionDraft
              }
              onApply={(expected, next) => {
                if (sourceRef.current !== expected || busy.current)
                  throw new Error("文档已变化，请重试。");
                commit(next);
                resetSelection();
              }}
            />
            <button
              className="primary"
              disabled={!ready || saving}
              onClick={save}
            >
              {saving ? "保存中…" : "保存版本"}
            </button>
          </div>
        </header>
        <div className="context-bar">
          <details className="slide-page-menu">
            <summary aria-label="页面操作">演示页 ▾</summary>
            <div
              className="slide-page-menu-actions"
              role="group"
              aria-label="页面操作选项"
            >
              {(
                [
                  ["duplicate", "复制", pageActions?.duplicate],
                  ["remove", "删除", pageActions?.remove],
                  ["up", "上移", pageActions?.moveUp],
                  ["down", "下移", pageActions?.moveDown],
                ] as const
              ).map(([action, label, allowed]) => (
                <button
                  key={action}
                  aria-label={`${label}页面`}
                  disabled={
                    !allowed ||
                    !ready ||
                    saving ||
                    readingImage ||
                    direct ||
                    textDraft ||
                    styleDraft ||
                    positionDraft
                  }
                  title={!allowed ? pageActions?.reason : undefined}
                  onClick={(event) => {
                    arrangePage(action);
                    event.currentTarget
                      .closest("details")
                      ?.removeAttribute("open");
                  }}
                >
                  {label}
                </button>
              ))}
              {pageActions?.warning && <p>{pageActions.warning}</p>}
              {pageActions?.reason && <p>{pageActions.reason}</p>}
            </div>
          </details>
          <span>
            {size} · 第 {pageIndex + 1} / {pages.length} 页
          </span>
        </div>
        {error && (
          <div role="alert" className="error">
            {error}
            <button onClick={() => setError("")}>关闭</button>
          </div>
        )}
        <div className="slide-workspace">
          <SlideThumbnails
            source={source}
            pages={pages}
            currentPageId={page?.id ?? ""}
            disabled={
              saving || !ready || textDraft || styleDraft || positionDraft
            }
            onSelect={(id) => flush(() => changePage(id))}
          />
          <div className="slide-canvas-viewport" ref={viewport}>
            <iframe
              className="slide-frame"
              style={{
                transform: `translate(-50%, -50%) scale(${canvasScale})`,
                pointerEvents:
                  positionDraft || textDraft || styleDraft || saving
                    ? "none"
                    : undefined,
              }}
              inert={
                positionDraft || textDraft || styleDraft || saving || undefined
              }
              ref={frame}
              title="HTML 演示画布"
              srcDoc={preview}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              allow="camera 'none'; microphone 'none'; geolocation 'none'"
            />
          </div>
          <aside className="slide-inspector">
            {target && capabilities && (
              <div
                className="object-actions"
                role="group"
                aria-label="选中对象操作"
              >
                <button
                  aria-label="复制对象"
                  title={
                    capabilities.duplicate ? "复制对象" : capabilities.reason
                  }
                  disabled={
                    !capabilities.duplicate ||
                    !ready ||
                    saving ||
                    textDraft ||
                    styleDraft ||
                    positionDraft
                  }
                  onClick={() =>
                    flush(() => {
                      try {
                        const object = inspectSlides(sourceRef.current)[
                          pageIndex
                        ]?.objects.find((o) => o.id === selected);
                        if (!object) throw new Error("请重新选择对象。");
                        finishInsert(
                          duplicateObject(sourceRef.current, object),
                        );
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "复制失败。");
                      }
                    })
                  }
                >
                  复制
                </button>
                <button
                  aria-label="删除对象"
                  title={
                    capabilities.remove
                      ? "删除对象，可撤销"
                      : capabilities.reason
                  }
                  disabled={
                    !capabilities.remove ||
                    !ready ||
                    saving ||
                    textDraft ||
                    styleDraft ||
                    positionDraft
                  }
                  onClick={() =>
                    flush(() => {
                      try {
                        const object = inspectSlides(sourceRef.current)[
                          pageIndex
                        ]?.objects.find((o) => o.id === selected);
                        if (!object) throw new Error("请重新选择对象。");
                        commit(removeObject(sourceRef.current, object));
                        setSelected("");
                        selectionRef.current = { id: "", editable: false };
                        setEditable(false);
                        setError("");
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "删除失败。");
                      }
                    })
                  }
                >
                  删除
                </button>
                {capabilities.replaceImage && (
                  <button
                    aria-label="替换图片"
                    disabled={
                      !ready ||
                      saving ||
                      readingImage ||
                      direct ||
                      textDraft ||
                      styleDraft ||
                      positionDraft
                    }
                    onClick={() => chooseImage(target.id)}
                  >
                    替换图片
                  </button>
                )}
                {background && (
                  <button
                    aria-label="替换背景图片"
                    disabled={
                      !ready ||
                      saving ||
                      readingImage ||
                      direct ||
                      textDraft ||
                      styleDraft ||
                      positionDraft
                    }
                    onClick={() => chooseImage(target.id, "background")}
                  >
                    换背景
                  </button>
                )}
              </div>
            )}
            {target?.tag === "img" && <h2>图片</h2>}
            {target && target.tag !== "img" && textRuns && (
              <TextRunInspector
                key={`${selected}:${textRevision}`}
                target={textRuns}
                disabled={
                  !ready || saving || positionDraft || styleDraft || direct
                }
                onDraft={changeTextDraft}
                onApply={(values) => {
                  try {
                    const next = patchTextRuns(
                      sourceRef.current,
                      textRuns,
                      values,
                    );
                    changeTextDraft(false);
                    commit(next);
                    setError("");
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "改字失败，请重试。",
                    );
                  }
                }}
              />
            )}
            {target && capabilities?.textStyle && (
              <ObjectStyleInspector
                key={`style:${selected}:${textRevision}`}
                disabled={
                  !ready || saving || positionDraft || textDraft || direct
                }
                onDraft={changeStyleDraft}
                onApply={(patch) => {
                  try {
                    const next = patchObjectTextStyle(
                      sourceRef.current,
                      target,
                      patch,
                    );
                    changeStyleDraft(false);
                    commit(next);
                    setError("");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "样式修改失败。");
                  }
                }}
              />
            )}
            {target && (
              <section
                onKeyDown={(e) => {
                  if (
                    e.key !== "Escape" ||
                    composingKey(e.nativeEvent) ||
                    !positionDraft ||
                    saving
                  )
                    return;
                  e.preventDefault();
                  e.stopPropagation();
                  setPosition(appliedPosition.current);
                  setPositionDraft(false);
                  setError("");
                }}
              >
                <h2>排列</h2>
                {!editable && <p>此对象无法移动，可尝试选择外层容器。</p>}
                {editable && (
                  <>
                    <details className="object-alignment">
                      <summary>对齐到页面</summary>
                      <div role="group" aria-label="对齐到页面">
                        {(
                          [
                            ["left", "左对齐"],
                            ["center", "水平居中"],
                            ["right", "右对齐"],
                            ["top", "顶对齐"],
                            ["middle", "垂直居中"],
                            ["bottom", "底对齐"],
                          ] as const
                        ).map(([edge, label]) => (
                          <button
                            key={edge}
                            aria-label={label}
                            title={label}
                            disabled={
                              !editable ||
                              !selectedGeometry.current ||
                              !ready ||
                              saving ||
                              direct ||
                              textDraft ||
                              styleDraft ||
                              positionDraft
                            }
                            onClick={() => alignObject(edge)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </details>
                    <details className="object-placement" key={selected}>
                      <summary>
                        位置与缩放{positionDraft ? " · 未应用" : ""}
                      </summary>
                      <div className="position-fields">
                        {(
                          [
                            ["x", "水平偏移"],
                            ["y", "垂直偏移"],
                            ["scale", "缩放比例"],
                          ] as const
                        ).map(([key, label]) => (
                          <label key={key}>
                            {label}
                            <input
                              aria-label={label}
                              type="number"
                              step={key === "scale" ? 0.1 : 1}
                              disabled={
                                !editable ||
                                saving ||
                                !ready ||
                                direct ||
                                textDraft ||
                                styleDraft
                              }
                              value={position[key]}
                              onChange={(e) => {
                                editEpoch.current += 1;
                                setPositionDraft(true);
                                setPosition({
                                  ...position,
                                  [key]: Number(e.target.value),
                                });
                              }}
                            />
                          </label>
                        ))}
                      </div>
                      {positionDraft && (
                        <div className="text-run-actions">
                          <button
                            className="primary"
                            disabled={
                              !editable ||
                              saving ||
                              !ready ||
                              direct ||
                              textDraft ||
                              styleDraft
                            }
                            onClick={() => move(position)}
                          >
                            应用
                          </button>
                          {positionDraft && (
                            <button
                              title="取消位置修改（Esc）"
                              onClick={() => {
                                setPosition(appliedPosition.current);
                                setPositionDraft(false);
                                setError("");
                              }}
                            >
                              取消
                            </button>
                          )}
                        </div>
                      )}
                      <div className="nudge-buttons">
                        <button
                          aria-label="左移十像素"
                          disabled={
                            !editable ||
                            saving ||
                            !ready ||
                            direct ||
                            positionDraft ||
                            textDraft ||
                            styleDraft
                          }
                          onClick={() =>
                            move({ ...position, x: position.x - 10 })
                          }
                        >
                          ←
                        </button>
                        <button
                          aria-label="上移十像素"
                          disabled={
                            !editable ||
                            saving ||
                            !ready ||
                            direct ||
                            positionDraft ||
                            textDraft ||
                            styleDraft
                          }
                          onClick={() =>
                            move({ ...position, y: position.y - 10 })
                          }
                        >
                          ↑
                        </button>
                        <button
                          aria-label="下移十像素"
                          disabled={
                            !editable ||
                            saving ||
                            !ready ||
                            direct ||
                            positionDraft ||
                            textDraft ||
                            styleDraft
                          }
                          onClick={() =>
                            move({ ...position, y: position.y + 10 })
                          }
                        >
                          ↓
                        </button>
                        <button
                          aria-label="右移十像素"
                          disabled={
                            !editable ||
                            saving ||
                            !ready ||
                            direct ||
                            positionDraft ||
                            textDraft ||
                            styleDraft
                          }
                          onClick={() =>
                            move({ ...position, x: position.x + 10 })
                          }
                        >
                          →
                        </button>
                      </div>
                    </details>
                  </>
                )}
              </section>
            )}
            {!target && (
              <div className="slide-selection-empty">
                <strong>格式</strong>
                <p>选择画布中的对象</p>
              </div>
            )}
            <details className="slide-object-list">
              <summary>
                对象 <small>{page?.objects.length ?? 0}</small>
              </summary>
              <nav aria-label="本页对象">
                {page?.objects.map((o) => (
                  <button
                    key={o.id}
                    style={{ marginLeft: Math.min(o.depth, 4) * 8 }}
                    aria-pressed={o.id === selected}
                    disabled={
                      !ready ||
                      saving ||
                      positionDraft ||
                      textDraft ||
                      styleDraft
                    }
                    onClick={() => select(o.id)}
                  >
                    <small>{o.tag.toUpperCase()}</small>
                    {o.title}
                  </button>
                ))}
              </nav>
            </details>
            <details className="slide-help">
              <summary>编辑帮助</summary>
              <p>单击选择，双击编辑纯文字。混合文字在右侧修改，保留原格式。</p>
              <p>拖动选中对象移动，拖动角点等比缩放。复杂变换不支持移动。</p>
              <p>仅保存本机。历史和批注请切换“长文档”；原页面脚本不运行。</p>
            </details>
          </aside>
        </div>
      </div>
      {presentation && (
        <SlidePresentation
          source={presentation.source}
          pages={inspectSlides(presentation.source)}
          initialPageId={presentation.pageId}
          onClose={(id) => {
            setPresentation(null);
            changePage(id);
          }}
        />
      )}
    </>
  );
}
