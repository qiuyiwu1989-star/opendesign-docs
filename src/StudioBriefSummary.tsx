import { useEffect, useRef, useState } from "react";
import type { Brief } from "./studio-model";
import { StudioBriefPanel } from "./StudioBriefPanel";

type Props = {
  brief: Brief;
  onSave: (brief: Brief) => Promise<void>;
  disabled: boolean;
  onDirty?: (dirty: boolean) => void;
};

/** Editing keeps a local copy; a rejected save must not erase user input. */
export function StudioBriefSummary({ brief, onSave, disabled, onDirty }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Brief>(brief);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const mounted = useRef(true);
  const dirtyCallback = useRef(onDirty);
  dirtyCallback.current = onDirty;
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(brief);
  useEffect(() => { dirtyCallback.current?.(dirty); }, [dirty]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; dirtyCallback.current?.(false); };
  }, []);
  const locked = disabled || saving;
  const save = async () => {
    if (disabled || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave({ ...draft });
      if (mounted.current) { setEditing(false); dirtyCallback.current?.(false); }
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message.replace("可保留当前修改为新任务，或取消修改后重新打开任务。", "请复制需保留的输入，再取消编辑并重新打开任务。") : "需求保存失败，输入已保留，请重试。");
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  return <section className="studio-brief-summary" aria-label="需求摘要">
    <div className="studio-task-heading"><h3>需求摘要</h3>{!editing && <button type="button" disabled={locked} onClick={() => { setDraft({ ...brief }); setError(""); setEditing(true); }}>编辑需求</button>}</div>
    <p>修改需求只更新这份任务的说明，不会改动已有页面。页面内容请单独编辑。</p>
    {editing ? <>
      <fieldset disabled={locked} style={{ border: 0, margin: 0, padding: 0 }}>
        <StudioBriefPanel brief={draft} onChange={next => { if (!locked) { setDraft(next); setError(""); } }} />
        <div className="toolbar-actions">
          <button type="button" className="primary" disabled={!dirty} onClick={() => void save()}>{saving ? "保存需求中…" : "保存需求"}</button>
          <button type="button" onClick={() => { setDraft({ ...brief }); setEditing(false); setError(""); dirtyCallback.current?.(false); }}>取消编辑需求</button>
        </div>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </> : <dl style={{ overflowWrap: "anywhere" }}>
      <dt>场景</dt><dd>{brief.scenario === "enterprise" ? "企业提案" : brief.scenario === "course" ? "课程设计" : "未指定"}</dd>
      <dt>主题</dt><dd>{brief.title || "未填写"}</dd>
      <dt>受众</dt><dd>{brief.audience || "未填写"}</dd>
      <dt>目标</dt><dd style={{ whiteSpace: "pre-wrap" }}>{brief.goal || "未填写"}</dd>
      <dt>材料摘要</dt><dd style={{ whiteSpace: "pre-wrap" }}>{brief.materials || "未填写"}</dd>
    </dl>}
  </section>;
}
