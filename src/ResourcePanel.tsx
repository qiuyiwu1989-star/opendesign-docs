import { useEffect, useId, useRef, useState } from "react";
import { deferredFeature } from "./deferred-feature";
import "./resources.css";

export type ResourcePanelProps = {
  source: string;
  disabled: boolean;
  contextKey: string;
  onApply: (expected: string, next: string) => void;
};
const Tools = deferredFeature<ResourcePanelProps>(() => import("./ResourcePanelBody").then(m => ({ default: m.ResourcePanelBody })), "资源工具");

export function ResourcePanel(props: ResourcePanelProps) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [activated, setActivated] = useState(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8, maxHeight: 480 });
  const positionPanel = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) setPosition(resourcePosition(rect, window.innerWidth, window.innerHeight));
  };
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", positionPanel);
    return () => window.removeEventListener("resize", positionPanel);
  }, [open]);
  useEffect(() => { panel.current?.hidePopover(); }, [props.contextKey]);
  return <>
    <button ref={trigger} type="button" className="resource-trigger tool-button" data-icon="resources"
      popoverTarget={id} aria-expanded={open} aria-controls={id}
      title="资源 · 检查与修复图片、字体" onClick={positionPanel}>资源</button>
    <div ref={panel} id={id} popover="auto" className="resource-panel"
      role="dialog" aria-label="图片与字体" style={position}
      onToggle={event => {
        const shown = event.newState === "open";
        setOpen(shown);
        if (shown) setActivated(true);
      }}>
      <div className="resource-heading">
        <strong>图片与字体</strong>
        <button type="button" aria-label="关闭资源" title="关闭" onClick={() => {
          panel.current?.hidePopover();
          trigger.current?.focus();
        }}>×</button>
      </div>
      {activated && <Tools {...props} />}
    </div>
  </>;
}

/** Fixed top-layer placement, right-aligned to its trigger and bounded by the viewport. */
export function resourcePosition(rect: { right: number; bottom: number }, width: number, height: number) {
  const panelWidth = Math.min(400, Math.max(0, width - 16));
  const top = Math.max(8, Math.min(rect.bottom + 8, height - 128));
  return { left: Math.max(8, Math.min(rect.right - panelWidth, width - panelWidth - 8)),
    top, maxHeight: Math.max(0, height - top - 8) };
}
