import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { StudioObjectPreview } from './StudioObjectPreview';
import { historyOf, moveHistory } from './history';
import { deferredFeature } from './deferred-feature';
import { applyWorkspaceChange } from './studio-workspace-model';
const ObjectPanel = deferredFeature<ComponentProps<typeof import('./DocumentObjectPanel').DocumentObjectPanel>>(
  () => import('./DocumentObjectPanel').then(m => ({ default: m.DocumentObjectPanel })), 'Studio 对象工具');

type Props = {
  source: string;
  onSave: (source: string) => Promise<void>;
  onBack: () => void;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
};
/** Studio owns persistence; the shared object tools only propose source patches. */
export function StudioObjectWorkspace({ source: baseline, onSave, onBack, onDirty, onBusy }: Props) {
  const [history, setHistory] = useState(() => historyOf(baseline));
  const current = useRef(history); current.current = history;
  const [selected, setSelected] = useState('');
  const [pending, setPending] = useState(false);
  const [panelEpoch, setPanelEpoch] = useState(0);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [leave, setLeave] = useState(false);
  const changed = history.present !== baseline;
  useEffect(() => { onDirty(changed || pending); }, [changed, pending, onDirty]);
  const move = (direction: 'undo' | 'redo') => {
    const next = moveHistory(current.current, direction);
    current.current = next; setHistory(next); setSelected(''); setPanelEpoch(n => n + 1);
  };
  const save = async () => {
    if (savingRef.current || pending || !changed) return;
    savingRef.current = true; setSaving(true); onBusy(true); setLeave(false); setError('');
    try { await onSave(current.current.present); }
    catch (e) { setError(e instanceof Error ? e.message : '保存失败，修改仍保留在当前工作区。'); }
    finally { savingRef.current = false; setSaving(false); onBusy(false); }
  };
  return <section aria-label="Studio 排版编辑" className="studio-object-workspace">
    <h3>排版与对象编辑</h3>
    <p>修改本机 Studio 作品；保存后产生新版本。云端副本与 Docs 副本不会随之修改。</p>
    <p>从图层选择对象，调整样式、插入图片或调整顺序；普通段落保持文档流。演示页支持点击选择对象；暂不支持在画布上拖动或替换已有图片。</p>
    {error && <p role="alert">{error}</p>}
    <div className="studio-object-actions">
      <button disabled={saving || pending || !history.past.length} onClick={() => move('undo')}>撤销</button>
      <button disabled={saving || pending || !history.future.length} onClick={() => move('redo')}>重做</button>
      <button className="primary" disabled={saving || pending || !changed} onClick={() => void save()}>保存为 Studio 新版本</button>
      <button disabled={saving} onClick={() => changed || pending ? setLeave(true) : onBack()}>返回文字与 AI 修改</button>
    </div>
    <p role="status">{saving ? '正在保存…' : pending ? '属性输入尚未应用，请应用或取消输入后保存。' : changed ? '排版有未保存修改' : '当前已保存版本'}</p>
    {pending && <button disabled={saving} onClick={() => { setPending(false); setPanelEpoch(n => n + 1); }}>取消未应用属性输入</button>}
    {leave && <div role="alert"><p>离开会放弃当前未保存的排版与属性输入。</p><button disabled={saving} onClick={() => setLeave(false)}>继续编辑</button><button disabled={saving} onClick={onBack}>放弃修改并返回</button></div>}
    <div className="studio-object-columns">
      <div>
        <ObjectPanel key={panelEpoch} source={history.present} selected={selected} disabled={saving} onInputDraft={setPending}
          onSelect={id => { if (pending) { setError('请先应用或取消属性输入，再选择其他对象。'); return; } setSelected(id); setError(''); }}
          onApply={(expected, next) => {
            try {
              const updated = applyWorkspaceChange(current.current, expected, next);
              current.current = updated; setHistory(updated); setPending(false); setSelected(''); setPanelEpoch(n => n + 1); setError('');
            } catch (e) { setError(e instanceof Error ? e.message : '对象已变化，请重新选择。'); }
          }} />
      </div>
      <StudioObjectPreview source={history.present} selected={selected} disabled={saving || pending} onSelect={id => { if (!savingRef.current && !pending) setSelected(id); }} />
    </div>
  </section>;
}
