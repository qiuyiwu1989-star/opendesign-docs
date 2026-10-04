import { build } from "esbuild";
await build({ entryPoints: ["sdk/opendesign.ts"], bundle: true, minify: true, target: "es2022",
  format: "iife", globalName: "OpenDesign", outfile: "public/sdk/opendesign.js" });
await build({ entryPoints: ["sdk/opendesign.ts"], bundle: true, minify: true, target: "es2022",
  format: "esm", outfile: "public/sdk/opendesign.mjs" });
