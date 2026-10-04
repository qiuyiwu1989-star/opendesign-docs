import { useEffect, useRef, useState } from 'react';
import { listCloudProjects, readCloudProject, type CloudProjectSummary } from './studio-cloud-projects';
import type { RemoteProject } from './studio-remote-store';
export type StudioCloudProjectsProps = { disabled?: boolean; onOpen: (project: RemoteProject) => void | Promise<void> };
export function StudioCloudProjects({ disabled = false, onOpen }: StudioCloudProjectsProps) {
  const [projects, setProjects] = useState<CloudProjectSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const request = useRef<AbortController | null>(null);
  const disabledRef = useRef(disabled); disabledRef.current = disabled;
  const run = async (operation: (signal: AbortSignal) => Promise<void>, retryOperation: () => void) => {
    if (disabledRef.current) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setRetry(null);
    try { await operation(controller.signal); }
    catch (reason) { if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : '读取失败，请重试。'); setRetry(() => retryOperation); } }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const load = (after?: string) => void run(async signal => {
    const page = await listCloudProjects(after, signal);
    if (signal.aborted) return;
    setProjects(previous => after ? [...previous.filter(p => !page.projects.some(next => next.id === p.id)), ...page.projects] : page.projects);
    setCursor(page.nextCursor); setLoaded(true);
  }, () => load(after));
  const open = (id: string) => void run(async signal => {
    const project = await readCloudProject(id, signal);
    if (!signal.aborted && !disabledRef.current) {
      setOpening(true);
      try { await onOpen(project); } finally { if (!signal.aborted) setOpening(false); }
    }
  }, () => open(id));
  useEffect(() => { if (disabled) { request.current?.abort(); setBusy(false); } }, [disabled]);
  useEffect(() => () => { request.current?.abort(); }, []);
  return <section aria-label="云端作品列表" aria-busy={busy}>
    <div className="studio-task-heading"><h3>云端作品</h3><button disabled={disabled || busy} onClick={() => load()}>{loaded ? '刷新云端作品' : '读取云端作品'}</button></div>
    <p>免费试用，通过当前浏览器的 30 天匿名身份访问，暂不支持跨设备。清除 Cookie 或身份到期后无法继续访问原云端作品，请及时导出。</p>
    {!loaded && !busy && !error && <p>读取后显示当前浏览器身份可访问的作品。</p>}
    {busy && <p role="status">{opening ? '正在打开云端作品…' : '正在读取云端作品…'} <button disabled={opening} onClick={() => { request.current?.abort(); setBusy(false); }}>取消读取</button></p>}
    {error && <p role="alert">{error} {retry && <button disabled={disabled || busy} onClick={retry}>重试</button>}</p>}
    {loaded && projects.length === 0 && <p>当前身份没有云端作品。可从已保存的本地任务创建云端副本。</p>}
    <ul>{projects.map(project => <li key={project.id}>
      <p>作品 ID：<code>{project.id}</code></p>
      <p>更新于 <time dateTime={project.updatedAt}>{new Date(project.updatedAt).toLocaleString('zh-CN')}</time> · {project.revisionCount} 个保留版本</p>
      <button disabled={disabled || busy} onClick={() => open(project.id)}>打开云端作品 {project.id.slice(0, 8)}</button>
    </li>)}</ul>
    {cursor && <button disabled={disabled || busy} onClick={() => load(cursor)}>加载更多云端作品</button>}
  </section>;
}
