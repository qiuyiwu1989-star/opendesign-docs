import { createPreview } from "./html";
import { validateAnchor, type ReviewRecord, type ReviewThread } from "./review";
import notice from "../NOTICE?raw";
import { reviewMarkerScript } from "./bento-review-markers";

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** An explicit, read-only snapshot, not the original HTML and not a live room. */
export function reviewExportHtml(name: string, version: { id: string; source: string; label: string }, review: ReviewRecord) {
  const channel = crypto.randomUUID();
  const threads = review.threads.filter(t => t.versionId === version.id).map(thread => ({
    ...thread, anchor: validateAnchor(thread.anchor, version.source),
  }));
  // Use the same inert renderer as editing. Source scripts and external loads
  // never get privileges merely because the user exported a review snapshot.
  const preview = createPreview(version.source, channel, false, 0, true, undefined, reviewMarkerScript, true);
  const payload = JSON.stringify({ channel, threads }).replace(/</g, "\\u003c");
  const runtime = function ({ channel, threads }: { channel: string; threads: ReviewThread[] }) {
    const frame = document.querySelector<HTMLIFrameElement>("iframe")!;
    const send = (type: string, extra = {}) => frame.contentWindow?.postMessage({ channel, type, ...extra }, "*");
    const list = document.querySelector("aside")!;
    const nodes = new Map<string, HTMLElement>();
    for (const [index, thread] of threads.entries()) {
      const item = document.createElement("article"); item.tabIndex = -1;
      const locate = document.createElement("button");
      locate.textContent = `${index + 1} · ${thread.resolved ? "已解决" : "待处理"}`;
      locate.addEventListener("click", () => send("review-locate", { anchor: thread.anchor }));
      item.append(locate);
      for (const message of thread.messages) {
        const author = document.createElement("strong"); author.textContent = message.author;
        const time = document.createElement("small"); time.textContent = message.createdAt;
        const body = document.createElement("p"); body.textContent = message.body;
        item.append(author, time, body);
      }
      list.append(item); nodes.set(thread.id, item);
    }
    if (!threads.length) { const empty = document.createElement("p"); empty.textContent = "此版本暂无批注"; list.append(empty); }
    const status = document.querySelector<HTMLElement>("[role=status]")!;
    window.addEventListener("message", event => {
      if (event.source !== frame.contentWindow || event.data?.channel !== channel) return;
      if (event.data.type === "ready") send("review-markers", { threads });
      if (event.data.type === "review-open") {
        const item = nodes.get(event.data.id); item?.scrollIntoView({ block: "nearest" }); item?.focus({ preventScroll: true });
      }
      if (event.data.type === "anchor-unavailable") status.textContent = "窗口宽度不同，位置无法精确还原；批注内容已保留。";
    });
    frame.addEventListener("load", () => send("request-ready"));
    send("request-ready");
  };
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${channel}'; style-src 'unsafe-inline'; frame-src about:; img-src data:; base-uri 'none'; form-action 'none'">
<title>${escape(name)} · 审阅副本</title><style>html,body{margin:0;height:100%;font:14px system-ui;color:#213c33;background:#f5f7f5}body{display:flex;flex-direction:column}header{padding:10px 16px;border-bottom:1px solid #d9e1dc}header p{margin:4px 0;color:#52665b;font-size:12px}main{display:flex;min-height:0;flex:1}iframe{border:0;flex:1;min-width:0;background:white}aside{width:280px;max-width:40vw;overflow:auto;padding:12px;box-sizing:border-box}article{padding:12px;margin-bottom:12px;border:1px solid #cbd8cf;border-radius:8px;overflow-wrap:anywhere}article:focus{outline:2px solid #267565}button{background:#e2eee7;color:inherit;border:0;border-radius:6px;padding:6px 10px;cursor:pointer}strong,small{display:block;margin-top:8px}small{color:#53665d;font-size:11px}article p{white-space:pre-wrap}h2{font-size:14px;margin:0 0 12px}</style></head>
<body><header><strong>${escape(name)} · ${escape(version.label)}</strong><p>只读审阅副本 · 不会同步回复 · 已隔离原脚本与外部资源</p><p role="status"></p></header><main><iframe title="审阅文档" sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="${escape(preview)}"></iframe><aside aria-label="批注"><h2>批注 · ${threads.length}</h2></aside></main>
<!-- ${notice.replace(/--/g, "—")} -->
<script nonce="${channel}">(${runtime.toString()})(${payload});</script></body></html>`;
}
