import { ImportError, validateDocument } from "./document-import";
export type ImportResult = { ok: true } | { ok: false; reason: "rejected" | "too_large" | "invalid" | "timeout" | "storage" };
export type HandoffItem = { name: string; source: string; label?: string };
type Options = {
  opener: Window;
  nonce: string;
  send: (data: unknown, origin: string) => void;
  confirm: (message: string) => boolean | Promise<boolean>;
  save: (item: HandoffItem) => Promise<ImportResult>;
  notice: (message: string) => void;
  complete: () => void;
};
export function createHandoff(options: Options) {
  let phase: "waiting" | "importing" | "done" = "waiting";
  const timer = setTimeout(() => {
    if (phase !== "waiting") return;
    phase = "done";
    options.notice("没有收到文档，请回到来源页面重试。");
    options.complete();
  }, 15_000);
  const finish = (result: ImportResult, origin: string) => {
    if (phase === "done") return;
    phase = "done";
    try { options.send({ type: "opendesign:handoff-result", v: 1, nonce: options.nonce, ...result }, origin); }
    finally { options.complete(); }
  };
  const receive = async (event: Pick<MessageEvent, "source" | "origin" | "data">) => {
    if (phase !== "waiting" || event.source !== options.opener) return;
    const data = event.data;
    if (!data || data.type !== "opendesign:handoff" || data.v !== 1 || data.nonce !== options.nonce) return;
    try { if (!["https:", "http:"].includes(new URL(event.origin).protocol)) return; } catch { return; }
    phase = "importing";
    clearTimeout(timer);
    try {
      const doc = data.document;
      const item = validateDocument(doc?.name, doc?.html);
      for (const key of ["generator", "sourceUrl"] as const)
        if (doc[key] !== undefined && (typeof doc[key] !== "string" || doc[key].length > 2048))
          throw new ImportError("invalid", "来源信息格式无效。");
      options.notice("");
      if (!await options.confirm(`来自 ${event.origin} 的文档\n《${item.name}》 · ${Math.ceil(item.bytes / 1024)} KB\n\n导入到此浏览器？`)) {
        finish({ ok: false, reason: "rejected" }, event.origin); return;
      }
      if ((phase as string) === "done") return;
      const result = await options.save({ name: item.name, source: item.source, label: `从 ${event.origin} 导入` });
      finish(result, event.origin);
    } catch (error) {
      options.notice(error instanceof Error ? error.message : "导入失败，请重试。");
      finish({ ok: false, reason: error instanceof ImportError ? error.reason : "storage" }, event.origin);
    }
  };
  return {
    ready: () => options.send({ type: "opendesign:handoff-ready", v: 1, nonce: options.nonce }, "*"),
    receive,
    dispose: () => { phase = "done"; clearTimeout(timer); },
  };
}
export function startHandoff(win: Window, save: Options["save"], notice: Options["notice"], confirm: Options["confirm"] = message => win.confirm(message)) {
  if (win.location.hash !== "#handoff=v1") return () => {};
  win.history.replaceState(win.history.state, "", win.location.pathname + win.location.search);
  const opener = win.opener as Window | null;
  if (!opener) { notice("无法连接来源页面，请回到来源重试，或下载 HTML 后导入。"); return () => {}; }
  let receiver: ReturnType<typeof createHandoff>;
  const listen = (event: MessageEvent) => { void receiver.receive(event); };
  receiver = createHandoff({ opener, nonce: crypto.randomUUID(), save, notice,
    confirm,
    send: (data, origin) => { try { opener.postMessage(data, origin); } catch { /* Source may have closed. The local document is still valid. */ } },
    complete: () => win.removeEventListener("message", listen),
  });
  win.addEventListener("message", listen);
  notice("正在接收来源文档…");
  receiver.ready();
  return () => { receiver.dispose(); win.removeEventListener("message", listen); };
}
