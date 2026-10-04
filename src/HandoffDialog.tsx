import { useEffect, useRef } from "react";
export type ImportConfirmation = { message: string; resolve: (accepted: boolean) => void };
export function HandoffDialog({ request, close }: { request: ImportConfirmation; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const answer = (accepted: boolean) => { request.resolve(accepted); close(); };
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, [request]);
  return <dialog ref={dialog} aria-labelledby="handoff-title" onCancel={event => { event.preventDefault(); answer(false); }}
    style={{ maxWidth: "min(440px, 90vw)", border: "1px solid #8885", borderRadius: 14, padding: 24 }}>
    <h2 id="handoff-title" style={{ marginTop: 0, fontSize: 18 }}>导入外部文档</h2>
    <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.7 }}>{request.message}</p>
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
      <button autoFocus onClick={() => answer(false)}>取消</button>
      <button className="primary" onClick={() => answer(true)}>导入并打开</button>
    </div>
  </dialog>;
}
