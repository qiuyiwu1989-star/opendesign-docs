import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
const runtime = await build({ entryPoints: ["experiments/gestures/runtime.ts"], bundle: true, format: "iife", write: false, minify: true, legalComments: "inline" });
const host = await build({ entryPoints: ["experiments/gestures/host.ts"], bundle: true, format: "iife", write: false, minify: true,
  define: { LAB_RUNTIME: JSON.stringify(runtime.outputFiles[0]!.text) } });
const output = mkdtempSync(join(tmpdir(), "docs-gesture-lab-"));
writeFileSync(join(output, "index.html"), `<!doctype html><html lang="zh"><meta charset="utf-8"><title>手势库隔离验证</title>
<style>body{font:16px system-ui;margin:20px;background:#f5f6f3}nav{display:flex;gap:12px;align-items:center;margin-bottom:12px}iframe{display:block;width:960px;height:620px;border:1px solid #bfc9c1}textarea{width:960px;height:90px}output{display:block;margin:12px 0}</style>
<nav><b>仅本地实验</b><button id="nudge">请求右移 10px</button><button id="grow">请求等比放大</button><button id="undo">撤销</button><button id="save">保存实验副本</button><label>缩放<select id="zoom"><option value="1">100%</option><option value="0.75">75%</option><option value="0.5">50%</option></select></label></nav>
<iframe title="隔离手势画布" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe><output aria-live="polite"></output><textarea aria-label="源文件结果" readonly></textarea>
<script>${host.outputFiles[0]!.text.replace(/<\/script/gi, "<\\/script")}</script></html>`);
// Public, synthetic bitmap for exercising the real file picker/decoder boundary.
const chunk = (type: string, data: Buffer) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
};
const header = Buffer.alloc(13); header.writeUInt32BE(320); header.writeUInt32BE(180, 4); header[8] = 8; header[9] = 2;
const pixels = Buffer.alloc(180 * (320 * 3 + 1));
for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) {
  const i = y * 961 + 1 + x * 3; pixels[i] = x % 256; pixels[i + 1] = 170; pixels[i + 2] = y % 256;
}
writeFileSync(join(output, "pixel.png"), Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]));
console.log(JSON.stringify({ output, runtimeBytes: runtime.outputFiles[0]!.contents.byteLength, hostBytes: host.outputFiles[0]!.contents.byteLength }));
