const button = document.querySelector('#open');
const status = document.querySelector('#status');
button.onclick = async () => {
  button.disabled = true;
  status.textContent = '正在连接…';
  try {
    const result = await OpenDesign.open({ name: document.querySelector('#name').value, html: document.querySelector('#html').value },
      { docsUrl: new URL('../', location.href).href, onReady: () => { status.textContent = '请在 Docs 标签页确认导入。'; } });
    status.textContent = result.ok ? '已导入并保存在 Docs。' : `未完成导入（${result.reason}）。检查 Docs 标签页后再重试，或下载 HTML 手动导入。`;
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
};
