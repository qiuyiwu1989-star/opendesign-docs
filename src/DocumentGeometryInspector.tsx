import { useEffect, useMemo, useState } from "react";
import type { SlideObject } from "./slides";
import { readDocumentGeometry, patchDocumentGeometry, type DocumentGeometry } from "./document-geometry";
export function DocumentGeometryInspector({ source, target, disabled, onDraft, onApply }: {
  source: string; target: SlideObject; disabled: boolean; onDraft: (pending: boolean) => void; onApply: (next: string) => void;
}) {
  const info = useMemo(() => readDocumentGeometry(source, target), [source, target]);
  const initial = info.geometry;
  const [values, setValues] = useState(() => initial ? Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v)])) : {});
  const [error, setError] = useState("");
  useEffect(() => () => onDraft(false), [onDraft]);
  if (!initial) return <details><summary>位置与尺寸</summary><p className="muted">{info.reason}</p></details>;
  const pending = Object.entries(initial).some(([key, value]) => values[key] !== String(value));
  return <fieldset disabled={disabled}><legend>位置与尺寸 · px</legend>
    <small className="muted">内联 absolute；X/Y 相对定位容器。宽高遵循原盒模型。</small>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {([['x', 'X'], ['y', 'Y'], ['width', '宽'], ['height', '高']] as const).map(([key, label]) => <label key={key}>{label}
        <input style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }} type="number" aria-label={`对象${label}`} min={key === "x" || key === "y" ? -20000 : 1} max={20000} step={1} value={values[key] ?? ""}
          onChange={event => { const next = { ...values, [key]: event.target.value }; setValues(next); setError(""); onDraft(Object.entries(initial).some(([k, v]) => next[k] !== String(v))); }} />
      </label>)}
    </div>
    <small className="muted">X/Y ±20000；宽高 1–20000。</small>
    {pending && <div className="toolbar-actions"><button onClick={() => {
      try {
        if (Object.values(values).some(value => !value.trim())) throw new Error("请填写四项数值。");
        const geometry = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)])) as DocumentGeometry;
        const next = patchDocumentGeometry(source, target, geometry); onApply(next); onDraft(false);
      } catch (e) { setError(e instanceof Error ? e.message : "调整失败。"); }
    }}>应用位置尺寸</button><button onClick={() => { setValues(Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v)]))); setError(""); onDraft(false); }}>取消位置尺寸</button></div>}
    {error && <p role="alert">{error}</p>}
  </fieldset>;
}
