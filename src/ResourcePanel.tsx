import { useEffect, useMemo, useRef, useState } from "react";
import { inspectResources, replaceResourceImage } from "./resource-diagnostics";
import { prepareLocalImage } from "./image-import";
import { repairEmbeddedImages } from "./image-repair";
import "./resources.css";

export function ResourcePanel({ source, disabled, contextKey, onApply }: {
  source: string;
  disabled: boolean;
  contextKey: string;
  onApply: (expected: string, next: string) => void;
}) {
  const issues = useMemo(() => inspectResources(source), [source]);
  const repair = useMemo(() => repairEmbeddedImages(source), [source]);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const intent = useRef<{ source: string; offset: number; epoch: number } | null>(null);
  const epoch = useRef(0), alive = useRef(true);
  const latest = useRef({ source, disabled, onApply });
  latest.current = { source, disabled, onApply };
  useEffect(() => {
    epoch.current++;
    intent.current = null;
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
      <p className="resource-note">修复只改工作副本，可撤销。保存版本后再备份或导出。</p>
      {reading && <p role="status">正在读取图片…</p>}
      {error && <p role="alert">{error}</p>}
      <input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ""; void upload(file);
      }} />
    </div>
  </details>;
}
