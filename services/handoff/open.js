const status = document.querySelector('#status');
const button = document.querySelector('#open');
let token = location.hash.slice(1), item, config, expiryTimer;
const api = async (path, data) => {
  const response = await fetch(`.${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '服务暂不可用，请重试。');
  return result;
};
const expire = () => { item = undefined; button.disabled = true; status.textContent = '交接链接已过期，请重新生成。'; };
async function prepare() {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { status.textContent = '请从生成文档的网站或 AI 工具获取交接链接。'; return; }
  try {
    const response = await fetch('./config');
    if (!response.ok) throw new Error('无法获取打开地址。');
    config = await response.json();
    item = await api('/api/read', { token });
    document.querySelector('#name').textContent = item.name;
    status.textContent = `文档已准备好 · 有效至 ${new Date(item.expiresAt).toLocaleTimeString()}\n点击后将在新标签页确认导入。`;
    if (item.expiresAt <= Date.now()) { expire(); return; }
    expiryTimer = setTimeout(expire, item.expiresAt - Date.now()); button.disabled = false;
  } catch (error) { status.textContent = error.message; }
}
button.onclick = async () => {
  if (!item || item.expiresAt <= Date.now()) { expire(); return; }
  button.disabled = true;
  clearTimeout(expiryTimer); // Once sent, the user can take their time confirming in Docs.
  status.textContent = '正在连接 OpenDesign Docs…';
  try {
    const result = await OpenDesign.open({ name: item.name, html: item.html }, { docsUrl: config.docsUrl,
      onReady: () => { status.textContent = '已连接，请在 Docs 标签页确认导入。'; } });
    if (result.ok) {
      item = undefined;
      history.replaceState(null, '', location.pathname);
      status.textContent = '已导入并保存在 Docs。可以关闭此页。';
      try { await api('/api/complete', { token }); }
      catch { status.textContent += '\n临时副本未能立即清除，将在到期时自动清除。'; }
      token = ''; return;
    }
    const messages = { rejected: '已取消导入。', blocked: '新窗口被浏览器拦截，请允许后重试。',
      closed: 'Docs 窗口已关闭。', timeout: '连接超时，请检查 Docs 标签页是否已导入，避免重复。',
      unavailable: '无法连接，请检查浏览器是否允许跨窗口连接。', storage: 'Docs 本地保存失败，请检查浏览器存储空间。',
      invalid: 'HTML 格式无效。', too_large: '文档超过 5 MiB 限制。' };
    status.textContent = messages[result.reason] || '未完成导入。';
  } catch (error) { status.textContent = error.message; }
  if (item && item.expiresAt > Date.now()) { button.disabled = false; expiryTimer = setTimeout(expire, item.expiresAt - Date.now()); }
  else expire();
};
void prepare();
