import { useEffect, useMemo, useRef, useState } from "react";
import { inspectDocumentObjects } from "./document-objects";
import { documentFlowCapabilities, insertDocumentObject, moveDocumentObject } from "./document-edit";
import { duplicateObject, getObjectCapabilities, patchObjectTextStyle, removeObject, replaceObjectImage, type ObjectTextStyle } from "./object-edit";
import { readObjectTextStyle } from "./object-style-read";
import { imageRepairIsCurrent, prepareLocalImage } from "./image-import";
import "./document-objects.css";

export type DocumentObjectPanelProps = {
  source: string; selected: string; disabled: boolean;
  size?: { width: number; height: number } | undefined;
  onSelect: (id: string) => void;
  onApply: (expected: string, next: string, selected: string) => void;
};
export function DocumentObjectPanel(props: DocumentObjectPanelProps) {
  const { source, selected, disabled, size, onSelect, onApply } = props;
  const current = useRef(props); current.current = props;
  const epoch = useRef(0);
  const context = `${source}\u0000${selected}\u0000${disabled}`;
  const previousContext = useRef(context);
  if (previousContext.current !== context) {
    previousContext.current = context;
    epoch.current++;
  }
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const objects = useMemo(() => inspectDocumentObjects(source)[0]!.objects, [source]);
  const target = objects.find(o => o.id === selected);
  const caps = useMemo(() => target && getObjectCapabilities(source, target, inspectDocumentObjects), [source, target]);
  const flow = useMemo(() => target && documentFlowCapabilities(source, target), [source, target]);
  const styleHints = useMemo(() => {
    if (!target || !caps?.textStyle) return undefined;
    try { return readObjectTextStyle(source, target, inspectDocumentObjects); }
    catch { return undefined; }
  }, [source, target, caps?.textStyle]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fontSize, setFontSize] = useState(() => typeof styleHints?.fontSize === "number" ? String(styleHints.fontSize) : "");
  const [color, setColor] = useState(() => typeof styleHints?.color === "string" && /^#[\da-f]{6}$/i.test(styleHints.color) ? styleHints.color : "#000000");
  useEffect(() => {
    setFontSize(typeof styleHints?.fontSize === "number" ? String(styleHints.fontSize) : "");
    setColor(typeof styleHints?.color === "string" && /^#[\da-f]{6}$/i.test(styleHints.color) ? styleHints.color : "#000000");
  }, [selected, styleHints?.fontSize, styleHints?.color]);
  const input = useRef<HTMLInputElement>(null);
  const uploadIntent = useRef<"insert" | "replace">("replace");
  const active = !disabled && !busy;
  const apply = (action: () => string | { source: string; objectId: string }) => {
    if (!active || !target) return;
    try {
      setError("");
      const result = action();
      onApply(source, typeof result === "string" ? result : result.source, typeof result === "string" ? selected : result.objectId);
    } catch (e) { setError(e instanceof Error ? e.message : "修改失败。"); }
  };
  const style = (patch: ObjectTextStyle) => apply(() => patchObjectTextStyle(source, target!, patch, inspectDocumentObjects));
  const upload = async (file: File) => {
    if (!active || !target) return;
    const capture = { source, contextKey: selected, epoch: epoch.current }, intent = uploadIntent.current;
    setBusy(true); setError("");
    try {
      const image = await prepareLocalImage(file);
      if (!mounted.current) return;
      if (!imageRepairIsCurrent(capture, { source: current.current.source, contextKey: current.current.selected,
        epoch: epoch.current, disabled: current.current.disabled })) throw new Error("页面已变化，请重新选择图片。");
      const result = intent === "insert" ? insertDocumentObject(source, target, { image }) :
        { source: replaceObjectImage(source, target, image, size, inspectDocumentObjects), objectId: selected };
      onApply(source, result.source, result.objectId);
    } catch (e) { setError(e instanceof Error ? e.message : "图片处理失败。"); }
    finally { setBusy(false); }
  };
  return <section aria-label="对象工具" className="document-object-tools">
    <label>对象
      <select aria-label="选择内容块" value={target?.id ?? ""} disabled={!active}
        onChange={e => { setError(""); onSelect(e.target.value); }}>
        <option value="">点击页面选择</option>
        {objects.map(o => <option key={o.id} value={o.id}>{"　".repeat(Math.min(o.depth - 3, 4))}{o.tag.toUpperCase()} · {o.title}</option>)}
      </select>
    </label>
    {target && <>
      <div className="toolbar-actions" style={{ marginBlock: 12, flexWrap: "wrap" }}>
        <button title="向前移动" aria-label="向前移动内容块" disabled={!active || !flow?.up} onClick={() => apply(() => moveDocumentObject(source, target, -1))}>↑</button>
        <button title="向后移动" aria-label="向后移动内容块" disabled={!active || !flow?.down} onClick={() => apply(() => moveDocumentObject(source, target, 1))}>↓</button>
        <button disabled={!active || !caps?.duplicate} onClick={() => apply(() => duplicateObject(source, target, inspectDocumentObjects))}>复制</button>
        <button title="删除选中内容，可撤销" disabled={!active || !caps?.remove}
          onClick={() => apply(() => ({ source: removeObject(source, target, inspectDocumentObjects), objectId: "" }))}>删除</button>
      </div>
      {caps?.textStyle && <fieldset disabled={!active}>
        <legend>样式</legend>
        <div className="toolbar-actions" style={{ flexWrap: "wrap" }}>
          <input type="number" aria-label="字号" min="8" max="200" value={fontSize}
            placeholder={styleHints?.fontSize === "mixed" ? "混合" : "未指定"} style={{ width: 76 }} onChange={e => setFontSize(e.target.value)} />
          <button disabled={!fontSize || Number(fontSize) < 8 || Number(fontSize) > 200}
            onClick={() => style({ fontSize: Number(fontSize) })}>字号</button>
          <input type="color" aria-label={`文字颜色，${styleHints?.color === "mixed" ? "混合" : styleHints?.color ?? "未指定"}`}
            value={color} onChange={e => { setColor(e.target.value); style({ color: e.target.value }); }} />
          <button title="加粗" aria-pressed={styleHints?.bold === true} onClick={() => style({ bold: true })}><b>B</b></button>
          <button title="常规字重" aria-pressed={styleHints?.bold === false} onClick={() => style({ bold: false })}>常规</button>
          <select aria-label="文字对齐" value={typeof styleHints?.align === "string" ? styleHints.align : ""}
            onChange={e => style({ align: e.target.value as "left" | "center" | "right" })}>
            <option value="" disabled>{styleHints?.align === "mixed" ? "混合对齐" : "未指定对齐"}</option>
            <option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option>
          </select>
        </div>
        <small className="muted">{styleHints ? "显示源码中的内联样式" : "样式未知，可选择后统一"}</small>
      </fieldset>}
      <div className="toolbar-actions" style={{ marginBlock: 12, flexWrap: "wrap" }}>
        {caps?.replaceImage && <button disabled={!active || !size} onClick={() => { uploadIntent.current = "replace"; input.current?.click(); }}>替换图片</button>}
        <button title="在选中内容后插入段落" disabled={!active || !flow?.insert} onClick={() => apply(() => insertDocumentObject(source, target, { text: "新段落" }))}>＋ 文字</button>
        <button title="在选中内容后插入图片" disabled={!active || !flow?.insert} onClick={() => { uploadIntent.current = "insert"; input.current?.click(); }}>＋ 图片</button>
      </div>
      {!caps?.remove && <small className="muted">含引用或复杂结构，仅开放安全操作。</small>}
    </>}
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="选择本机图片" onChange={e => {
      const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(file);
    }} />
    {busy && <small role="status">处理图片…</small>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
