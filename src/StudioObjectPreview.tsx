import { useEffect, useMemo, useRef, useState } from 'react';
import { createPreview } from './html';
import { studioPages } from './studio-pages';
import { createThumbnailFactory, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT } from './thumbnail-preview';
import { objectPreviewPage } from './studio-workspace-model';

export function StudioObjectPreview({ source, selected, disabled }: { source: string; selected: string; disabled: boolean }) {
  const pages = useMemo(() => studioPages(source), [source]);
  const [pageId, setPageId] = useState('page-0');
  const selectedPage = useMemo(() => objectPreviewPage(source, selected), [source, selected]);
  useEffect(() => { if (selectedPage) setPageId(selectedPage); }, [selectedPage, selected]);
  const page = pages.find(p => p.id === pageId) ?? pages[0];
  const factory = useMemo(() => pages.length ? createThumbnailFactory(source) : null, [source, pages]);
  const preview = useMemo(() => page && factory ? factory(page.id) : createPreview(source, 'studio-object-preview', false), [source, page, factory]);
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
      <label>预览页面<select aria-label="排版预览页面" value={page.id} disabled={disabled} onChange={event => setPageId(event.target.value)}>
        {pages.map((p, i) => <option key={p.id} value={p.id}>{i + 1}. {p.title}</option>)}
      </select></label>
      <p>第 {pages.indexOf(page) + 1} / {pages.length} 页 · 只读预览</p>
      <div className="studio-object-slide-viewport" style={{ height: width * THUMBNAIL_HEIGHT / THUMBNAIL_WIDTH }}>
        <iframe title="Studio 演示页排版预览" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={preview}
          style={{ width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT, minHeight: 0, transform: `scale(${width / THUMBNAIL_WIDTH})`, transformOrigin: '0 0' }} />
      </div>
    </> : <iframe title="Studio 长文排版预览" sandbox="" referrerPolicy="no-referrer" srcDoc={preview} />}
  </div>;
}
