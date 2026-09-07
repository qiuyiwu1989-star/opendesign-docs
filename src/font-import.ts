export const MAX_FONT_BYTES = 2 * 1024 * 1024;
export const MAX_DECLARED_FONT_BYTES = 12 * 1024 * 1024;
export type LocalFont = Readonly<{ dataUrl: string; format: "woff" | "woff2" }>;
const decoded = new WeakSet<object>();

export function fontResultIsCurrent(captured: { source: string; epoch: number }, current: { source: string; epoch: number; disabled: boolean; fontRights: boolean }) {
  return captured.epoch === current.epoch && captured.source === current.source && !current.disabled && current.fontRights;
}

// Header bounds are an early filter, not a full font sanitizer. FontFace.load
// subsequently invokes the browser decoder. WOFF2 totalSfntSize is advisory.
// Sources: https://www.w3.org/TR/WOFF/ and https://www.w3.org/TR/WOFF2/
export function inspectFontHeader(bytes: Uint8Array): "woff" | "woff2" {
  if (bytes.length < 44 || bytes.length > MAX_FONT_BYTES) throw new Error("字体需小于 2 MiB，且文件完整。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0);
  const format = magic === 0x774f4632 ? "woff2" : magic === 0x774f4646 ? "woff" : null;
  if (!format) throw new Error("仅支持 WOFF / WOFF2 字体。");
  const headerSize = format === "woff2" ? 48 : 44;
  if (bytes.length < headerSize || view.getUint32(8) !== bytes.length) throw new Error("字体文件长度不完整。");
  if (![0x00010000, 0x4f54544f, 0x74727565].includes(view.getUint32(4))) throw new Error("暂不支持字体集合或此字体类型。");
  const tables = view.getUint16(12), expanded = view.getUint32(16);
  if (!tables || tables > 256 || expanded < 12 + 16 * tables || expanded > MAX_DECLARED_FONT_BYTES)
    throw new Error("字体声明的展开大小或表数量超出限制。");
  const block = (offset: number, length: number) => {
    if ((offset === 0) !== (length === 0) || (length && (offset < headerSize || offset + length > bytes.length)))
      throw new Error("字体数据块越界。");
  };
  const meta = format === "woff2" ? 28 : 24;
  block(view.getUint32(meta), view.getUint32(meta + 4));
  block(view.getUint32(meta + 12), view.getUint32(meta + 16));
  if (view.getUint32(meta + 8) > MAX_DECLARED_FONT_BYTES) throw new Error("字体元数据过大。");
  if (format === "woff2") {
    const compressed = view.getUint32(20);
    if (!compressed || compressed > bytes.length - headerSize) throw new Error("字体压缩数据不完整。");
  } else {
    if (view.getUint16(14) !== 0 || 44 + 20 * tables > bytes.length) throw new Error("字体表头不完整。");
    let total = 12 + 16 * tables;
    for (let i = 0; i < tables; i++) {
      const start = 44 + 20 * i, offset = view.getUint32(start + 4), length = view.getUint32(start + 8), original = view.getUint32(start + 12);
      if (offset < 44 + 20 * tables || !length || length > original) throw new Error("字体表无效。");
      block(offset, length);
      total += Math.ceil(original / 4) * 4;
    }
    if (total !== expanded || total > MAX_DECLARED_FONT_BYTES) throw new Error("字体展开大小不一致。");
  }
  return format;
}

export async function prepareLocalFont(file: File): Promise<LocalFont> {
  const extension = /\.(woff2?)$/i.exec(file.name)?.[1]?.toLowerCase();
  if (!extension) throw new Error("请选择 .woff 或 .woff2 文件。");
  if (!file.size || file.size > MAX_FONT_BYTES) throw new Error("字体不能超过 2 MiB。");
  const buffer = await file.arrayBuffer(), bytes = new Uint8Array(buffer);
  const format = inspectFontHeader(bytes);
  if (format !== extension) throw new Error("字体扩展名与内容不一致。");
  if (typeof FontFace !== "function") throw new Error("当前浏览器无法验证本地字体。");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const face = new FontFace(`docs-font-check-${crypto.randomUUID()}`, buffer);
    await Promise.race([
      face.load(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 15000); }),
    ]);
  } catch { throw new Error("字体无法解码或读取超时，请更换文件。"); }
  finally { clearTimeout(timer); }
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  const font = Object.freeze({ dataUrl: `data:font/${format};base64,${btoa(binary)}`, format });
  decoded.add(font);
  return font;
}

export function requireDecodedFont(font: LocalFont) {
  if (!font || !decoded.has(font)) throw new Error("请重新选择并验证本机字体。");
}
