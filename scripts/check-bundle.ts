import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { staticFiles, type Manifest } from "./bundle-metrics";

const root = resolve("dist");
const manifest: Manifest = JSON.parse(readFileSync(resolve(root, ".vite/manifest.json"), "utf8"));
const initial = staticFiles(manifest, "index.html");
const slides = staticFiles(manifest, "src/SlidesEditor.tsx");
const resource = manifest["src/ResourcePanelBody.tsx"];
if (!resource || initial.js.includes(resource.file) || slides.js.includes(resource.file))
  throw new Error("Repair tools must remain on-demand in both views.");
if (initial.js.includes(manifest["src/SlidesEditor.tsx"]!.file))
  throw new Error("Slide editor must remain outside the static entry closure.");
for (const [name, files, limit] of [["initial", initial, 450_000], ["slides without tools", slides, 490_000]] as const) {
  const content = files.js.map(file => readFileSync(resolve(root, file)));
  const bytes = content.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const gzip = content.reduce((sum, chunk) => sum + gzipSync(chunk).byteLength, 0);
  console.log(`${name}: JS ${bytes} bytes, gzip ${gzip} bytes (${files.js.length} chunks)`);
  if (bytes > limit) throw new Error(`${name} JS exceeds ${limit} bytes; inspect static imports before changing the budget.`);
}
