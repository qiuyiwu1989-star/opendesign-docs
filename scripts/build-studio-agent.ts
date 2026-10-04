import { build } from 'esbuild';
await build({entryPoints:['services/studio-agent/server.ts','services/studio-agent/worker-child.ts','services/studio-agent/pg-worker.ts','services/studio-agent/pg-migrate.ts','services/studio-agent/archive-cli.ts'],outdir:'dist-studio-agent',outExtension:{'.js':'.mjs'},bundle:true,platform:'node',target:'node24',format:'esm',banner:{js:"import { createRequire as __studioCreateRequire } from 'node:module'; const require = __studioCreateRequire(import.meta.url);"}});
console.log('Built standalone Studio Agent and worker for Node 24.');
