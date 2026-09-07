import { useEffect, useMemo, useRef, useState } from "react";
import type { SlidePage } from "./slides";
import {
  createThumbnailFactory,
  THUMBNAIL_HEIGHT,
  THUMBNAIL_WIDTH,
  visibleThumbnailIds,
} from "./thumbnail-preview";
import "./slide-thumbnails.css";

type Props = {
  source: string;
  pages: SlidePage[];
  currentPageId: string;
  onSelect: (pageId: string) => void;
  disabled?: boolean;
};

export function SlideThumbnails({
  source,
  pages,
  currentPageId,
  onSelect,
  disabled,
}: Props) {
  const root = useRef<HTMLElement>(null);
  const [settledSource, setSettledSource] = useState(source);
  const [visible, setVisible] = useState<number[]>([]);
  const [width, setWidth] = useState(144);
  const current = Math.max(
    0,
    pages.findIndex((page) => page.id === currentPageId),
  );
  useEffect(() => {
    const timer = window.setTimeout(() => setSettledSource(source), 450);
    return () => window.clearTimeout(timer);
  }, [source]);
  const factory = useMemo(
    () => createThumbnailFactory(settledSource),
    [settledSource],
  );
  useEffect(() => {
    const nav = root.current;
    if (!nav) return;
    const buttons = [
      ...nav.querySelectorAll<HTMLButtonElement>(
        "button[data-thumbnail-index]",
      ),
    ];
    const inView = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = Number(
            (entry.target as HTMLElement).dataset.thumbnailIndex,
          );
          if (entry.isIntersecting) inView.add(index);
          else inView.delete(index);
        });
        setVisible([...inView]);
      },
      { root: nav, rootMargin: "100px" },
    );
    buttons.forEach((button) => observer.observe(button));
    const resize = new ResizeObserver(() => {
      const preview = nav.querySelector<HTMLElement>(".slide-thumbnail-view");
      if (preview) setWidth(Math.max(1, preview.clientWidth));
      // The strip changes from vertical to horizontal on narrow screens. The
      // previous scrollTop cannot reveal the selected page in that new axis.
      nav.querySelector('[aria-current="page"]')?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    });
    resize.observe(nav);
    return () => {
      observer.disconnect();
      resize.disconnect();
    };
  }, [pages.length]);
  useEffect(() => {
    root.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [currentPageId]);
  const previews = useMemo(() => {
    const result = new Map<string, string>();
    for (const index of visibleThumbnailIds(visible, current)) {
      const page = pages[index];
      if (!page) continue;
      try {
        result.set(page.id, factory(page.id));
      } catch {
        /* Page list may lead the debounced source. */
      }
    }
    return result;
  }, [visible, current, factory, pages.length]);
  return (
    <nav
      ref={root}
      className="slide-pages slide-thumbnails"
      aria-label="演示页面"
    >
      {pages.map((page, index) => (
        <button
          key={page.id}
          type="button"
          data-thumbnail-index={index}
          aria-current={page.id === currentPageId ? "page" : undefined}
          aria-label={`第 ${index + 1} 页：${page.title}`}
          title={page.title}
          disabled={disabled}
          onClick={() => onSelect(page.id)}
        >
          <span className="slide-thumbnail-view" aria-hidden="true">
            {previews.has(page.id) ? (
              <iframe
                title={`第 ${index + 1} 页缩略图`}
                tabIndex={-1}
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
                srcDoc={previews.get(page.id)}
                width={THUMBNAIL_WIDTH}
                height={THUMBNAIL_HEIGHT}
                style={{ transform: `scale(${width / THUMBNAIL_WIDTH})` }}
              />
            ) : (
              <span className="slide-thumbnail-placeholder">{page.title}</span>
            )}
          </span>
          <span className="slide-thumbnail-label">
            <span>{index + 1}</span>
            <strong>{page.title}</strong>
          </span>
        </button>
      ))}
    </nav>
  );
}
