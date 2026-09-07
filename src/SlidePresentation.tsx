import { useEffect, useMemo, useRef, useState } from "react";
import type { SlidePage } from "./slides";
import { createThumbnailFactory } from "./thumbnail-preview";
import "./slide-presentation.css";

export function presentationIndexForKey(
  index: number,
  count: number,
  key: string,
): number | null {
  const last = Math.max(0, count - 1);
  if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(key))
    return Math.min(last, index + 1);
  if (["ArrowLeft", "ArrowUp", "PageUp"].includes(key))
    return Math.max(0, index - 1);
  if (key === "Home") return 0;
  if (key === "End") return last;
  return null;
}

export function SlidePresentation({
  source,
  pages,
  initialPageId,
  onClose,
}: {
  source: string;
  pages: SlidePage[];
  initialPageId: string;
  onClose: (pageId: string) => void;
}) {
  const [index, setIndex] = useState(
    Math.max(
      0,
      pages.findIndex((p) => p.id === initialPageId),
    ),
  );
  const [scale, setScale] = useState(1);
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const exit = useRef<HTMLButtonElement>(null);
  const leaving = useRef(false);
  const indexRef = useRef(index);
  indexRef.current = index;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const factory = useMemo(() => createThumbnailFactory(source), [source]);
  const preview = useMemo(
    () => (pages[index] ? factory(pages[index]!.id) : ""),
    [factory, pages, index],
  );
  const leave = () => {
    if (leaving.current) return;
    leaving.current = true;
    if (document.fullscreenElement === root.current)
      void document.exitFullscreen().catch(() => {});
    closeRef.current(pages[indexRef.current]?.id ?? initialPageId);
  };
  const fullscreen = () => {
    // Denied/fullscreen-unavailable browsers continue presenting in this dialog.
    try {
      const request = root.current?.requestFullscreen?.();
      if (request) void request.catch(() => {});
    } catch {
      /* Window presentation remains usable. */
    }
  };
  useEffect(() => {
    leaving.current = false;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    let wasFullscreen = false;
    const fullscreenChanged = () => {
      if (document.fullscreenElement === root.current) wasFullscreen = true;
      else if (wasFullscreen) leave();
    };
    document.addEventListener("fullscreenchange", fullscreenChanged);
    exit.current?.focus();
    fullscreen();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        leave();
      } else if (
        presentationIndexForKey(indexRef.current, pages.length, event.key) !==
        null
      ) {
        event.preventDefault();
        setIndex(
          (n) => presentationIndexForKey(n, pages.length, event.key) ?? n,
        );
      } else if (event.key === "Tab") {
        const buttons = [
          ...(root.current?.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ) ?? []),
        ];
        const position = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        event.preventDefault();
        buttons[
          (position + (event.shiftKey ? buttons.length - 1 : 1)) %
            buttons.length
        ]?.focus();
      }
    };
    document.addEventListener("keydown", keyboard, true);
    return () => {
      document.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("fullscreenchange", fullscreenChanged);
      document.body.style.overflow = previousOverflow;
      // The parent restores focus after removing inert from the editor.
    };
  }, []);
  useEffect(() => {
    const area = stage.current;
    if (!area) return;
    const observer = new ResizeObserver(() =>
      setScale(
        Math.max(
          0.05,
          Math.min(area.clientWidth / 1280, area.clientHeight / 720),
        ),
      ),
    );
    observer.observe(area);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={root}
      className="slide-presentation"
      role="dialog"
      aria-modal="true"
      aria-label="幻灯片放映"
    >
      <div className="slide-presentation-stage" ref={stage}>
        <iframe
          title="只读放映画面"
          tabIndex={-1}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          allow="camera 'none'; microphone 'none'; geolocation 'none'"
          srcDoc={preview}
          style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
        />
      </div>
      <nav className="slide-presentation-controls" aria-label="放映控制">
        <button
          disabled={index === 0}
          onClick={() => setIndex((n) => n - 1)}
          aria-label="上一页"
        >
          ←
        </button>
        <span aria-live="polite">
          {index + 1} / {pages.length}
        </span>
        <button
          disabled={index === pages.length - 1}
          onClick={() => setIndex((n) => n + 1)}
          aria-label="下一页"
        >
          →
        </button>
        <button onClick={fullscreen}>全屏</button>
        <button ref={exit} onClick={leave}>
          结束放映
        </button>
      </nav>
    </div>
  );
}
