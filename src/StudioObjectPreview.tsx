import { useEffect, useMemo, useRef, useState } from 'react';
import { createPreview } from './html';
import { studioPages } from './studio-pages';
import { createSlidePreview } from './slides';
import { objectPreviewPage, previewObjectId, workspaceObjectId } from './studio-workspace-model';

export function StudioObjectPreview({ source, selected, disabled, onSelect }: { source: string; selected: string; disabled: boolean; onSelect: (id: string) => void }) {
  const pages = useMemo(() => studioPages(source), [source]);
  const [pageId, setPageId] = useState('page-0');
  const selectedPage = useMemo(() => objectPreviewPage(source, selected), [source, selected]);
  useEffect(() => { if (selectedPage) setPageId(selectedPage); }, [selectedPage, selected]);
  const page = pages.find(p => p.id === pageId) ?? pages[0];
  const channel = useMemo(() => crypto.randomUUID(), [source, page?.id]);
  const preview = useMemo(() => page ? createSlidePreview(source, channel, page.id, true) : createPreview(source, channel, false), [source, page?.id, channel]);
  const frame = useRef<HTMLIFrameElement>(null);
  const live = useRef({ channel, disabled });
  live.current = { channel, disabled };
  const syncSelection = () => {
    const target = frame.current?.contentWindow;
    target?.postMessage({ channel, type: 'selection-enabled', enabled: !disabled }, '*');
    target?.postMessage({ channel, type: 'select-object', id: page ? previewObjectId(source, page.id, selected) : '' }, '*');
  };
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.channel !== channel || channel !== live.current.channel || !page) return;
      if (event.data.type === 'slide-ready') { syncSelection(); return; }
      if (live.current.disabled) return;
      if (event.data.type === 'object-select') {
        const id = workspaceObjectId(source, page.id, event.data.id);
        if (id && id !== selected) onSelect(id);
      }
      // Ignore object-clear from synchronization: explicit page changes clear selection.
    };
    window.addEventListener('message', receive);
    syncSelection();
    return () => window.removeEventListener('message', receive);
  }, [channel, source, page?.id, disabled, selected, onSelect]);
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observe = () => setWidth(Math.max(1, node.clientWidth));
    const observer = new ResizeObserver(observe);
    observer.observe(node); observe();
    return () => observer.disconnect();
  }, []);
  return <div className="studio-object-preview" ref={viewport}>
    {page ? <>
      <label>预览页面<select aria-label="排版预览页面" value={page.id} disabled={disabled} onChange={event => { onSelect(''); setPageId(event.target.value); }}>
        {pages.map((p, i) => <option key={p.id} value={p.id}>{i + 1}. {p.title}</option>)}
      </select></label>
      <p>第 {pages.indexOf(page) + 1} / {pages.length} 页 · 点击对象可选择图层</p>
      <div className="studio-object-slide-viewport" style={{ height: width * 720 / 1280 }}>
        <iframe ref={frame} onLoad={syncSelection} title="Studio 演示页排版预览" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={preview}
          style={{ width: '100%', height: '100%', minHeight: 0, pointerEvents: disabled ? 'none' : undefined }} />
      </div>
    </> : <iframe title="Studio 长文排版预览" sandbox="" referrerPolicy="no-referrer" srcDoc={preview} />}
  </div>;
}
