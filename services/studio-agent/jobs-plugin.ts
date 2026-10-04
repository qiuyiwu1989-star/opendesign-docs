import type { Plugin } from 'vite';
import { createStudioAgentService } from './http-service';

/** Thin Vite adapter for the local-only service. */
export function studioAgentJobsPlugin(): Plugin {
  let service: ReturnType<typeof createStudioAgentService> | undefined;
  return { name: 'studio-agent-jobs', apply: 'serve', configureServer(server) {
    service = createStudioAgentService();
    const current = service;
    server.httpServer?.once('close', () => { void current.close().catch(() => {}); });
    server.middlewares.use('/api/studio-agent', (req,res) => { void current.handle(req,res); });
  }, async closeBundle() {await service?.close();} };
}
