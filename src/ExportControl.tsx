import { useEffect, useId, useRef, useState } from "react";
import { htmlExportName } from "./html-export";
import { resourcePosition } from "./ResourcePanel";
import "./export.css";

export function ExportControl({ name, url, disabled, onPrepare, onDismiss, reviewUrl = "", versionLabel = "" }: {
  name: string; url: string; disabled: boolean;
  onPrepare: () => void; onDismiss: () => void;
  reviewUrl?: string; versionLabel?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const lastPreparedUrl = useRef("");
  const [open, setOpen] = useState(false);
  const positionPanel = () => {
    if (!trigger.current || !panel.current) return;
    const position = resourcePosition(trigger.current.getBoundingClientRect(), window.innerWidth, window.innerHeight);
    Object.assign(panel.current.style, { left: `${position.left}px`, top: `${position.top}px`, maxHeight: `${position.maxHeight}px` });
  };
  useEffect(() => {
    if (!url || disabled) { panel.current?.hidePopover(); return; }
    // A selection briefly changes pending-text state; restoring the same link
    // must not reopen a popup that the user already dismissed.
    if (lastPreparedUrl.current === url) return;
    lastPreparedUrl.current = url;
    positionPanel();
    panel.current?.showPopover();
    // Preparation follows an iframe flush, so explicitly continue keyboard focus.
    panel.current?.querySelector<HTMLAnchorElement>("a")?.focus();
  }, [url, disabled]);
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", positionPanel);
    return () => window.removeEventListener("resize", positionPanel);
  }, [open]);
  const close = () => {
    panel.current?.hidePopover();
    trigger.current?.focus();
  };
  return <>
    <button ref={trigger} type="button" disabled={disabled} aria-controls={id}
      aria-expanded={open} title="导出当前 HTML" onClick={() => {
        if (open) close();
        else if (url) { positionPanel(); panel.current?.showPopover(); panel.current?.querySelector<HTMLAnchorElement>("a")?.focus(); }
        else onPrepare();
      }}>导出</button>
    <div ref={panel} id={id} popover="auto" role="dialog" aria-label="导出 HTML"
      className="resource-panel export-panel" onToggle={event => setOpen(event.newState === "open")}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
      }}>
      <div className="resource-heading"><strong>导出 HTML</strong>
        <button type="button" aria-label="关闭导出" onClick={() => { close(); onDismiss(); }}>×</button>
      </div>
      {url && <div className="export-body">
        <p className="export-filename" title={htmlExportName(name)}>{htmlExportName(name)}</p>
        <p>保留原脚本和资源引用，仅打开可信文档。</p>
        {versionLabel && <small>当前审阅：{versionLabel}</small>}
        <a className="export-download" href={url} download={htmlExportName(name)}>{versionLabel ? "导出内容 · 不含批注" : "下载 HTML"}</a>
        {reviewUrl && <>
          <a className="export-download" href={reviewUrl} download={htmlExportName(name).replace(/-edited\.html$/, "-review.html")}>导出审阅副本 · 含批注</a>
          <small>只读副本 · 不会同步回复 · 外部资源和原脚本不运行</small>
        </>}
        <small>全部版本与批注请用“备份与恢复”。</small>
      </div>}
    </div>
  </>;
}
