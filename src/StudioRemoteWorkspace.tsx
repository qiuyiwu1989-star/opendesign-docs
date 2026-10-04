import { useEffect, useMemo, useRef, useState } from "react";
import type { StudioTask } from "./studio-store";
import type { HandoffItem, ImportResult } from "./handoff";
import { inspectHtml } from "./html";
import { applyProposal, proposeText, type TextProposal } from "./studio-model";
import { StudioCanvasPreview } from "./StudioCanvasPreview";
import { loadRemote, createRemote, resumeRemote, refreshRemote, generateRemote, acceptRemote, discardRemoteCandidate, saveRemote } from "./studio-remote-client";

type Props = { task: StudioTask; existingOnly?: boolean; onBack: () => void; onCreate: (items: HandoffItem[]) => Promise<ImportResult>; onBusy: (busy: boolean) => void; onDirty: (dirty: boolean) => void };
type RecordState = Awaited<ReturnType<typeof loadRemote>>;
export function StudioRemoteWorkspace({ task, existingOnly = false, onBack, onCreate, onBusy, onDirty }: Props) {
  const [record, setRecord] = useState<RecordState>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [targetId, setTargetId] = useState(""), [replacement, setReplacement] = useState(""), [instruction, setInstruction] = useState("");
  const [manual, setManual] = useState<TextProposal | null>(null);
  const [notice, setNotice] = useState("");
  const running = useRef(false), alive = useRef(true);
  const callbacks = useRef({ onBusy, onDirty }); callbacks.current = { onBusy, onDirty };
  const project = record?.project;
  const head = project?.revisions.find(revision => revision.id === project.headRevision);
  const version = useMemo(() => head ? { id: head.id, source: head.source, label: "服务端版本" } : null, [head]);
  const targets = useMemo(() => head ? inspectHtml(head.source).targets : [], [head]);
  const target = targets.find(item => item.id === targetId);
  const dirty = replacement !== (target?.text ?? "") || !!instruction.trim() || !!manual;
  const pending = !!record?.pending;
  const candidate = record?.candidate?.proposal;
  const preview = useMemo(() => { try { return version && (manual || candidate) ? applyProposal(version, manual || candidate!) : head?.source ?? ""; } catch { return head?.source ?? ""; } }, [version, manual, candidate, head]);
  useEffect(() => { callbacks.current.onDirty(dirty || pending); }, [dirty, pending]);
  useEffect(() => {
    alive.current = true;
    void loadRemote(task.id).then(value => { if (alive.current) setRecord(value); }).catch(reason => { if (alive.current) { setLoadFailed(true); setError(reason instanceof Error ? reason.message : "无法读取服务端副本记录。"); } }).finally(() => { if (alive.current) setLoading(false); });
    return () => { alive.current = false; callbacks.current.onBusy(false); callbacks.current.onDirty(false); };
  }, [task.id]);
  const run = async (operation: () => Promise<void>) => {
    if (running.current) return;
    running.current = true; setBusy(true); callbacks.current.onBusy(true); setError(""); setNotice("");
    try { await operation(); }
    catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : "操作未完成，请保留输入后重试。");
      try { const saved = await loadRemote(task.id); if (alive.current) { setRecord(saved); setLoadFailed(false); } } catch { if (alive.current) { setLoadFailed(true); setError("操作状态与本机恢复记录均未能读取。已有显示和输入保留，请勿重复提交；稍后重新打开此工作区核对。"); } }
    } finally { running.current = false; if (alive.current) { setBusy(false); callbacks.current.onBusy(false); } }
  };
  const installed = (next: RecordState, message: string) => { setRecord(next); setTargetId(""); setReplacement(""); setInstruction(""); setManual(null); setNotice(message); };
  const locked = busy || loading;
  const canMutate = !locked && !loadFailed && !pending && !candidate;
  return <section aria-label="服务端副本工作区">
    <div className="studio-task-heading"><h3>{existingOnly ? '云端作品' : '云端副本'}</h3><button disabled={locked || dirty || pending} onClick={onBack}>{existingOnly ? '返回云端作品列表' : '返回本地任务'}</button></div>
    <p>免费试用，无需登录。通过当前浏览器的 30 天匿名身份访问，暂不支持跨设备；清除 Cookie 或身份到期后无法继续访问原云端副本。请及时创建 Docs 副本并导出。原本地作品保留，双方不会自动互相覆盖。</p>
    {error && <p role="alert">{error} 输入保留；请先核对操作状态，不要重复创建修改。</p>}
    {notice && <p role="status">{notice}</p>}
    {loading && <p role="status">正在读取副本记录…</p>}
    {loadFailed && <button disabled={locked} onClick={() => void run(async () => { setRecord(await loadRemote(task.id)); setLoadFailed(false); })}>重试读取本机恢复记录</button>}
    {pending && <section className="studio-diff"><h4>有待核对的服务端操作</h4><p>可能已在服务端完成，本机尚未同步。恢复会核对同一操作，不会新建第二次修改。</p><button disabled={locked} onClick={() => void run(async () => { const next = await resumeRemote(task.id); setRecord(next); setNotice("已恢复查询，请核对当前版本和候选。已有输入保留。"); })}>恢复并核对操作</button></section>}
    {!loading && !loadFailed && !project && !pending && (existingOnly ? <p role="alert">本机恢复记录不可用，请返回列表重新打开作品。</p> : <><p>将当前已保存作品上传，以便生成 AI 修改候选；原本地作品保留。模型会接收你选中的文字与修改要求。</p><button className="primary" disabled={locked || !task.draft.versions.length} onClick={() => void run(async () => { installed(await createRemote(task.id, task.draft.versions.at(-1)!.source), "服务端副本已创建，原本机任务保持不变。"); })}>创建云端副本</button></>)}
    {head && version && <>
      <p className="studio-version-label">云端第 {project!.revisions.length} 版 · 以已保存的云端版本为准</p>
      <button disabled={locked || dirty || pending || !!candidate} onClick={() => void run(async () => installed(await refreshRemote(task.id), "已重新读取服务端版本。"))}>重新读取服务端版本</button>
      <StudioCanvasPreview source={head.source} previewSource={preview} selectedId={targetId} disabled={!canMutate || dirty} onSelect={id => { if (!canMutate || dirty) return; setTargetId(id); setReplacement(targets.find(item => item.id === id)?.text ?? ""); }} />
      <fieldset disabled={!canMutate} className="studio-editor-fields">
        <label>修改位置<select value={targetId} disabled={dirty} onChange={event => { setTargetId(event.target.value); setReplacement(targets.find(item => item.id === event.target.value)?.text ?? ""); }}><option value="">选择文字</option>{targets.map(item => <option key={item.id} value={item.id}>{item.text.slice(0,65)}</option>)}</select></label>
        <label>AI 修改要求<textarea value={instruction} maxLength={2000} onChange={event => setInstruction(event.target.value)} /></label>
        <button disabled={!target || !instruction.trim() || replacement !== target.text || !!manual} onClick={() => void run(async () => { const next = await generateRemote(task.id, targetId, instruction); setRecord(next); setNotice("生成候选已同步，确认后才保存作品。"); })}>生成服务端候选</button>
        <label>手动替换文字<textarea value={replacement} maxLength={3000} onChange={event => { setReplacement(event.target.value); setManual(null); }} /></label>
        <button disabled={!target || !!instruction.trim()} onClick={() => { try { setManual(proposeText(version, targetId, replacement)); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "无法预览修改。"); } }}>预览手动修改</button>
        {dirty && <button onClick={() => { setInstruction(""); setReplacement(target?.text ?? ""); setManual(null); setError(""); }}>取消未保存输入</button>}
      </fieldset>
      {manual && <div className="studio-diff"><h4>手动修改候选</h4><p>{manual.before}</p><p>{manual.after}</p><button disabled={!canMutate} onClick={() => void run(async () => installed(await saveRemote(task.id, applyProposal(version, manual)), "服务端修改已保存并同步到本机缓存。"))}>保存手动修改到服务端</button></div>}
      {candidate && <div className="studio-diff"><h4>服务端 AI 候选 · 尚未应用</h4><p>{candidate.before}</p><p>{candidate.after}</p><button disabled={locked || pending} onClick={() => void run(async () => installed(await acceptRemote(task.id), "服务端已接受候选并同步到本机缓存。"))}>确认服务端候选</button><button disabled={locked || pending} onClick={() => void run(async () => { setRecord(await discardRemoteCandidate(task.id)); setNotice("候选已放弃，作品未修改；输入保留。"); })}>放弃服务端候选</button></div>}
      <details><summary>服务端版本</summary>{project!.revisions.map((revision,index) => <p key={revision.id}>第 {index+1} 版 <button disabled={!canMutate || dirty || revision.id === head.id} onClick={() => void run(async () => installed(await saveRemote(task.id, revision.source), "已将历史内容恢复为新的服务端版本。"))}>恢复为新版本</button></p>)}</details>
      <button className="primary" disabled={!canMutate || dirty} onClick={() => void run(async () => { const result = await onCreate([{ name: `${task.draft.brief.title || "Studio"}.html`, source: head.source, label: "Studio 服务端独立副本" }]); if (!result.ok) throw new Error("未创建 Docs 副本，请处理文档提示后重试。"); setNotice("已创建独立 Docs 副本，服务端作品保持不变。"); })}>创建 Docs 编辑副本</button>
    </>}
  </section>;
}
