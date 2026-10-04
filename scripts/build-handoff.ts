import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
const root = "dist-handoff";
await mkdir(`${root}/services/handoff`, { recursive: true });
await mkdir(`${root}/public/sdk`, { recursive: true });
await build({ entryPoints: ["services/handoff/server.ts"], outfile: `${root}/services/handoff/server.mjs`, bundle: true,
  platform: "node", target: "node22", format: "esm", banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' } });
for (const name of ["open.html", "open.js"]) await copyFile(`services/handoff/${name}`, `${root}/services/handoff/${name}`);
await copyFile("public/sdk/opendesign.js", `${root}/public/sdk/opendesign.js`);
console.log("Built standalone Node 22 handoff runtime.");
