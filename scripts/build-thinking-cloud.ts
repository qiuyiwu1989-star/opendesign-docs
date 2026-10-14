import {build} from 'esbuild';
await build({entryPoints:['services/thinking-cloud/server.ts'],outfile:'dist-thinking-cloud/server.mjs',bundle:true,platform:'node',target:'node24',format:'esm'});
console.log('Built Thinking Cloud service for Node 24.');
