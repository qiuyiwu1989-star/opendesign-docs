import { runTextEdit, type EditRequest } from './run';
import { ArkRequestError } from './ark';
const controller = new AbortController();
let started = false;
function reply(message: unknown) {
  if (!process.connected || !process.send) { process.exit(1); return; }
  process.send(message as object, () => process.exit(0));
}
process.once('disconnect', () => { controller.abort(); process.exit(1); });
process.once('SIGTERM', () => { controller.abort(); process.exit(0); });
process.on('message', (message: unknown) => {
  if (started) return;
  started = true;
  void (async () => {
    try {
      if (!message || typeof message !== 'object' || (message as { type?: unknown }).type !== 'edit') throw new Error();
      const apiKey = process.env.ARK_API_KEY;
      if (!apiKey) throw new ArkRequestError('configuration');
      const candidate = await runTextEdit((message as { request: EditRequest }).request, { apiKey }, controller.signal);
      reply({ type: 'candidate', candidate });
    } catch (error) {
      reply(error instanceof ArkRequestError
        ? { type: 'failure', failureCode: error.code, ...(error.code === 'provider' && error.status !== undefined ? { providerStatus: error.status } : {}) }
        : { type: 'failure', failureCode: 'execution' });
    }
  })();
});
