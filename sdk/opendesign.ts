import { validateDocument } from "../src/document-import";
import type { ImportResult } from "../src/handoff";

export type DocumentInput = { name: string; html: string };
export type OpenResult = ImportResult | { ok: false; reason: "blocked" | "closed" | "unavailable" };
export type OpenOptions = {
  docsUrl?: string;
  /** Connection timeout only. A user may take as long as needed to confirm. */
  readyTimeoutMs?: number;
  onReady?: () => void;
};

/** Call directly in a click handler, with HTML already prepared. Success means IndexedDB committed. */
export function open(document: DocumentInput, options: OpenOptions = {}): Promise<OpenResult> {
  return openWithWindow(window, document, options);
}

/** Dependency seam for protocol tests. Consumers should use open(). */
export function openWithWindow(win: Window, document: DocumentInput, options: OpenOptions = {}): Promise<OpenResult> {
  const item = validateDocument(document.name, document.html);
  const url = new URL(options.docsUrl ?? "https://doc.opendesign.cc/");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new Error("docsUrl must be an HTTP(S) URL without credentials.");
  url.hash = "handoff=v1";
  const timeout = options.readyTimeoutMs ?? 20_000;
  if (!Number.isFinite(timeout) || timeout < 1000 || timeout > 120_000)
    throw new Error("readyTimeoutMs must be between 1000 and 120000.");
  return new Promise(resolve => {
    let child: Window | null = null;
    let nonce: string | undefined;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    const finish = (result: OpenResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer); clearInterval(poll);
      win.removeEventListener("message", receive);
      resolve(result);
    };
    const receive = (event: MessageEvent) => {
      if (!child || event.source !== child || event.origin !== url.origin || event.data?.v !== 1) return;
      const data = event.data;
      if (data.type === "opendesign:handoff-ready" && nonce === undefined &&
          typeof data.nonce === "string" && data.nonce.length >= 16 && data.nonce.length <= 128) {
        nonce = data.nonce;
        clearTimeout(timer);
        try {
          child.postMessage({ type: "opendesign:handoff", v: 1, nonce,
            document: { name: item.name, html: item.source } }, url.origin);
        } catch { finish({ ok: false, reason: "unavailable" }); return; }
        // UI callbacks cannot interrupt the protocol or cause a duplicate send.
        try { options.onReady?.(); } catch { /* caller-owned UI */ }
      } else if (data.type === "opendesign:handoff-result" && nonce !== undefined && data.nonce === nonce) {
        if (data.ok === true) finish({ ok: true });
        else if (data.ok === false && ["rejected", "too_large", "invalid", "timeout", "storage"].includes(data.reason))
          finish({ ok: false, reason: data.reason as Exclude<ImportResult, { ok: true }>["reason"] });
      }
    };
    win.addEventListener("message", receive);
    // This stays synchronous: awaiting preparation before window.open loses the user gesture.
    try { child = win.open(url.href, "_blank"); } catch { finish({ ok: false, reason: "blocked" }); return; }
    if (!child) { finish({ ok: false, reason: "blocked" }); return; }
    timer = setTimeout(() => finish({ ok: false, reason: "timeout" }), timeout);
    poll = setInterval(() => { if (child?.closed) finish({ ok: false, reason: "closed" }); }, 500);
  });
}
