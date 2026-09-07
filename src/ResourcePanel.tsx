import { useEffect, useMemo, useRef, useState } from "react";
import { inspectResources, replaceResourceImage } from "./resource-diagnostics";
import { prepareLocalImage } from "./image-import";
import { repairEmbeddedImages } from "./image-repair";
import { inspectFontTargets, replaceFontSource, type FontTarget } from "./font-repair";
import { fontResultIsCurrent, prepareLocalFont } from "./font-import";
import "./resources.css";

export function ResourcePanel({ source, disabled, contextKey, onApply }: {
  source: string;
  disabled: boolean;
  contextKey: string;
  onApply: (expected: string, next: string) => void;
}) {
  const issues = useMemo(() => inspectResources(source), [source]);
  const repair = useMemo(() => repairEmbeddedImages(source), [source]);
  const fonts = useMemo(() => inspectFontTargets(source), [source]);
  const [fontRights, setFontRights] = useState(false);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const fontInput = useRef<HTMLInputElement>(null);
  const fontIntent = useRef<{ source: string; target: FontTarget; epoch: number } | null>(null);
  const intent = useRef<{ source: string; offset: number; epoch: number } | null>(null);
  const epoch = useRef(0), alive = useRef(true);
  const latest = useRef({ source, disabled, onApply, fontRights });
  latest.current = { source, disabled, onApply, fontRights };
  useEffect(() => {
    epoch.current++;
    intent.current = null;
    fontIntent.current = null;
    setFontRights(false);
    setError("");
  }, [source, contextKey, disabled]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; epoch.current++; }; }, []);
  const upload = async (file?: File) => {
    const captured = intent.current;
    intent.current = null;
    if (!file || !captured) return;
    setReading(true);
    setError("");
    try {
      const image = await prepareLocalImage(file);
      if (!alive.current) return;
      if (captured.epoch !== epoch.current || latest.current.disabled || captured.source !== latest.current.source)
        throw new Error("文档状态已变化，请重新选择图片。");
      const next = replaceResourceImage(captured.source, captured.offset, image);
      latest.current.onApply(captured.source, next);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "图片替换失败，请重试。");
    } finally { if (alive.current) setReading(false); }
  };
  const uploadFont = async (file?: File) => {
    const captured = fontIntent.current;
    fontIntent.current = null;
    if (!file || !captured || !latest.current.fontRights) return;
    setReading(true); setError("");
    try {
      const font = await prepareLocalFont(file);
      if (!alive.current) return;
      if (!fontResultIsCurrent(captured, { ...latest.current, epoch: epoch.current }))
        throw new Error("文档状态已变化，请重新选择字体。");
      latest.current.onApply(captured.source, replaceFontSource(captured.source, captured.target, font));
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "字体替换失败。");
    } finally { if (alive.current) setReading(false); }
  };
  const count = issues.length + repair.count;
  return <details className="resource-panel">
    <summary>资源{count ? ` · ${count} 项待检查` : ""}</summary>
    <div className="resource-body">
      <p className="resource-note">仅检查静态引用，不联网。未列出不代表资源已成功加载。</p>
      {disabled && <p className="resource-note">结束当前编辑后可修复；审阅模式只读。</p>}
      {repair.count > 0 && <div className="resource-row">
        <div><strong>内嵌图片引用 · {repair.count}</strong><p>引号或括号不完整</p></div>
        <button disabled={disabled || reading} onClick={() => {
          try { onApply(source, repair.source); }
          catch (e) { setError(e instanceof Error ? e.message : "修复失败。"); }
        }}>修复引用</button>
      </div>}
      {issues.slice(0, 30).map(issue => <div className="resource-row" key={issue.id}>
        <div><strong>{issue.kind} · {issue.reason}</strong><p className="resource-label" title={issue.label}>{issue.label}</p><small>{issue.hint}</small></div>
        {issue.imageOffset !== undefined && <button disabled={disabled || reading} aria-label={`替换图片：${issue.label}`} onClick={() => {
          intent.current = { source, offset: issue.imageOffset!, epoch: epoch.current };
          setError("");
          input.current?.click();
        }}>选本机图片</button>}
      </div>)}
      {!count && <p className="resource-note">未发现常见引用问题。脚本生成的内容及复杂 CSS 不在检查范围内。</p>}
      {issues.length > 30 && <p className="resource-note">显示前 30 项，共 {issues.length} 项；修复后自动更新。</p>}
      {fonts.length > 0 && <section aria-label="本地字体修复" className="resource-fonts">
        <label className="resource-font-rights"><input type="checkbox" checked={fontRights} disabled={disabled || reading} onChange={event => setFontRights(event.target.checked)} />我有权在此文档中嵌入该字体</label>
        {fonts.slice(0, 12).map(font => <div className="resource-row" key={font.id}>
          <div><strong>{font.family} · {font.embedded ? "已内嵌" : "字体声明"}</strong><p>{font.weight} / {font.style}</p><small>只替换此声明的来源；字形和换行可能变化。</small></div>
          <button disabled={disabled || reading || !fontRights} aria-label={`替换字体：${font.family}`} onClick={() => {
            fontIntent.current = { source, target: font, epoch: epoch.current };
            setError(""); fontInput.current?.click();
          }}>选本机字体</button>
        </div>)}
        {fonts.length > 12 && <p className="resource-note">当前显示前 12 条字体声明。</p>}
        <p className="resource-note">WOFF / WOFF2 · 最大 2 MiB。不会安装到系统；不验证授权或字形覆盖。</p>
      </section>}
      <p className="resource-note">修复只改工作副本，可撤销。保存版本后再备份或导出。</p>
      {reading && <p role="status">正在读取资源…</p>}
      {error && <p role="alert">{error}</p>}
      <input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ""; void upload(file);
      }} />
      <input ref={fontInput} hidden type="file" accept=".woff,.woff2,font/woff,font/woff2" onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ""; void uploadFont(file);
      }} />
    </div>
  </details>;
}
