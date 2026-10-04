import { useEffect, useMemo, useRef, useState } from "react";
import { documentLayers, layerAncestors, type DocumentLayer } from "./document-layers";
import "./document-layers.css";
import { canMoveDocumentObjectTo, documentFlowCapabilities } from "./document-edit";

export function DocumentLayers({ source, selected, disabled, onSelect, onMove }: {
  source: string; selected: string; disabled: boolean; onSelect: (id: string) => void;
  onMove?: (expected: string, from: string, to: string, side: "before" | "after") => void;
}) {
  const layers = useMemo(() => documentLayers(source), [source]);
  const byId = useMemo(() => new Map(layers.map(layer => [layer.object.id, layer])), [layers]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const ancestors = useMemo(() => layerAncestors(layers, selected), [layers, selected]);
  useEffect(() => { setCollapsed(new Set()); }, [source]);
  useEffect(() => {
    setCollapsed(previous => {
      if (!ancestors.some(id => previous.has(id))) return previous;
      return new Set([...previous].filter(id => !ancestors.includes(id)));
    });
  }, [ancestors]);
  const dragging = useRef<{ source: string; id: string } | null>(null);
  const dropCache = useRef(new Map<string, boolean>());
  const [drop, setDrop] = useState<{ id: string; side: "before" | "after" } | null>(null);
  const clearDrag = () => { dragging.current = null; dropCache.current.clear(); setDrop(null); };
  useEffect(() => { clearDrag(); }, [source, disabled]);
  const movable = useMemo(() => new Set(layers.filter(layer => {
    const flow = documentFlowCapabilities(source, layer.object); return flow.up || flow.down;
  }).map(layer => layer.object.id)), [layers, source]);
  const validDrop = (id: string) => {
    const active = dragging.current, from = active && byId.get(active.id), to = byId.get(id);
    if (disabled || !onMove || active?.source !== source || !from || !to) return false;
    if (!dropCache.current.has(id)) dropCache.current.set(id, canMoveDocumentObjectTo(source, from.object, to.object));
    return dropCache.current.get(id)!;
  };
  const parent = ancestors[0];
  const renderLayer = (layer: DocumentLayer) => <li key={layer.object.id}>
    <div className="document-layer-row" data-selected={selected === layer.object.id || undefined}
      data-drop={drop?.id === layer.object.id ? drop.side : undefined}
      onDragOver={event => {
        event.stopPropagation();
        if (!validDrop(layer.object.id)) { event.dataTransfer.dropEffect = "none"; setDrop(null); return; }
        event.preventDefault(); event.dataTransfer.dropEffect = "move";
        const rect = event.currentTarget.getBoundingClientRect();
        setDrop({ id: layer.object.id, side: event.clientY < rect.top + rect.height / 2 ? "before" : "after" });
      }}
      onDragLeave={() => setDrop(current => current?.id === layer.object.id ? null : current)}
      onDrop={event => {
        event.preventDefault(); event.stopPropagation();
        const active = dragging.current;
        if (active && validDrop(layer.object.id)) {
          const rect = event.currentTarget.getBoundingClientRect();
          onMove?.(active.source, active.id, layer.object.id, event.clientY < rect.top + rect.height / 2 ? "before" : "after");
        }
        clearDrag();
      }}>
      {layer.children.length ? <button className="document-layer-disclosure" disabled={disabled}
        aria-label={`${collapsed.has(layer.object.id) ? "展开" : "收起"}图层 ${layer.object.tag.toUpperCase()} · ${layer.object.title}`}
        aria-expanded={!collapsed.has(layer.object.id)}
        onClick={() => setCollapsed(previous => {
          const next = new Set(previous); if (next.has(layer.object.id)) next.delete(layer.object.id); else next.add(layer.object.id); return next;
        })}>{collapsed.has(layer.object.id) ? "▸" : "▾"}</button> : <span className="document-layer-disclosure" />}
      {onMove && <span className="document-layer-drag" draggable={!disabled && movable.has(layer.object.id)}
        title={movable.has(layer.object.id) ? "拖动调整同一容器内的顺序；Esc 取消" : "此图层暂不支持拖动排序"}
        aria-hidden="true"
        onDragStart={event => {
          if (disabled || !movable.has(layer.object.id)) { event.preventDefault(); return; }
          dropCache.current.clear(); setDrop(null);
          dragging.current = { source, id: layer.object.id };
          event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", layer.object.id);
        }} onDragEnd={clearDrag}>⠿</span>}
      <button className="document-layer-select" disabled={disabled} aria-pressed={selected === layer.object.id}
        title={`${layer.object.tag.toUpperCase()} · ${layer.object.title}`} onClick={() => onSelect(layer.object.id)}>
        <small>{layer.object.tag.toUpperCase()}</small><span>{layer.object.title}</span>
      </button>
    </div>
    {!!layer.children.length && <ul hidden={collapsed.has(layer.object.id)}>{layer.children.map(id => renderLayer(byId.get(id)!))}</ul>}
  </li>;
  return <section className="document-layers" aria-label="文档图层">
    <div className="document-layers-heading"><strong>图层</strong><button disabled={disabled || !parent}
      onClick={() => { if (parent) onSelect(parent); }}>选择父级</button></div>
    {onMove && <small className="muted">拖动手柄调整同层顺序，也可选中后用下方前后移动按钮。</small>}
    <ul aria-label="内容层级">{layers.filter(layer => !layer.parent).map(renderLayer)}</ul>
    {!layers.length && <p>这份文档暂时没有可选择的内容块。</p>}
  </section>;
}
