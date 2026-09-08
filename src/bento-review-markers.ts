// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// Adapted from nyblnet/bento slides/src/editor/comments.ts, CommentsUI.refresh.
// See NOTICE. Store/coordinates replaced with version-bound HTML anchors;
// shadow layer, viewport mismatch handling and bridge integration are local.
import type { ReviewThread } from "./review";
import notice from "../NOTICE?raw";

/** Self-contained: serialized into the isolated preview, never imported HTML. */
export function mountReviewMarkers(open: (id: string) => void) {
  const host = document.createElement("div");
  host.setAttribute("data-doc-review", "");
  host.style.cssText = "all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483647!important;";
  const layer = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `button{position:absolute;pointer-events:auto;box-sizing:border-box;min-width:24px;height:24px;padding:0 5px;border:1px solid #fff;border-radius:12px;background:#b66016;color:#fff;box-shadow:0 1px 5px #0004;font:600 12px system-ui;cursor:pointer}button.resolved{background:#50716a}button:focus-visible{outline:3px solid #177ae6;outline-offset:2px}button[data-missing]{border:2px dashed #fff}`;
  layer.appendChild(style);
  document.documentElement.appendChild(host);
  let items: { thread: ReviewThread; marker: HTMLButtonElement }[] = [];
  const position = () => {
    let missing = 0;
    const occupied = new Map<string, number>();
    const targets = new Map([...document.querySelectorAll<HTMLElement>("[data-doc-text]")].map(n => [n.getAttribute("data-doc-text"), n]));
    for (const { thread, marker } of items) {
      const a = thread.anchor;
      let x: number | undefined, y: number | undefined;
      if (a.kind === "text") {
        const el = targets.get(a.id);
        if (el && el.textContent === a.quote) {
          const rect = el.getBoundingClientRect();
          if (rect.width || rect.height) { x = rect.right - 12; y = rect.top - 12; }
        }
      } else if (Math.abs(window.innerWidth - a.viewportWidth) <= 2) {
        x = a.x + a.width - window.scrollX - 12;
        y = a.y - window.scrollY - 12;
      }
      const unavailable = x === undefined || y === undefined;
      marker.toggleAttribute("data-missing", unavailable);
      if (unavailable) { x = 8; y = 8 + missing++ * 28; }
      else {
        const key = `${Math.round(x! / 24)}:${Math.round(y! / 24)}`;
        const offset = occupied.get(key) ?? 0;
        occupied.set(key, offset + 1); y! += offset * 26;
      }
      marker.style.left = `${Math.max(0, Math.min(window.innerWidth - 28, x!))}px`;
      marker.style.top = `${y!}px`;
      marker.hidden = y! < -24 || y! > window.innerHeight;
      const message = thread.messages[0];
      marker.title = `${unavailable ? "位置待定位 · " : ""}${thread.resolved ? "已解决" : "待处理"} · ${message?.author ?? ""}: ${message?.body.slice(0, 80) ?? ""}`;
      marker.setAttribute("aria-label", marker.title);
    }
  };
  window.addEventListener("scroll", position, { passive: true });
  window.addEventListener("resize", position);
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(position).observe(document.body);
  void document.fonts?.ready.then(position);
  return {
    update(threads: ReviewThread[]) {
      items.forEach(item => item.marker.remove());
      items = threads.slice(0, 500).map(thread => {
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = "ed-comment-marker" + (thread.resolved ? " resolved" : "");
        marker.textContent = String(thread.messages.length);
        marker.addEventListener("click", ev => { ev.stopPropagation(); open(thread.id); });
        layer.appendChild(marker);
        return { thread, marker };
      });
      position();
    },
  };
}

// Notices travel with the code even when the trusted function is serialized.
export const reviewMarkerScript = `/* ${notice.replace(/\*\//g, "* /")} */(${mountReviewMarkers.toString()})`;
