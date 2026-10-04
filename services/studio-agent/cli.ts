import { runTextEdit, type EditRequest } from './run';

// Local development entry. Key is read exclusively from the server environment.
async function main() {
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey) throw new Error('请在服务端环境设置 ARK_API_KEY。');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk.toString();
    if (Buffer.byteLength(input) > 250000) throw new Error('请求过大。');
  }
  let request: EditRequest;
  try { request = JSON.parse(input) as EditRequest; } catch { throw new Error('请输入有效的 JSON 请求。'); }
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());
  const candidate = await runTextEdit(request, { apiKey }, controller.signal);
  process.stdout.write(JSON.stringify({ status: 'candidate', applied: false, candidate }) + '\n');
}
main().catch(() => { process.stderr.write('生成候选失败，请检查服务端配置、输入或网络。未修改作品。\n'); process.exitCode = 1; });
