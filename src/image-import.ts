export type LocalImage = {
  dataUrl: string;
  width: number;
  height: number;
  alt: string;
};
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 20_000_000;
export function imageRepairIsCurrent(captured: { source: string; contextKey: string; epoch: number },
  current: { source: string; contextKey: string; epoch: number; disabled: boolean }): boolean {
  return !current.disabled && captured.source === current.source && captured.contextKey === current.contextKey && captured.epoch === current.epoch;
}
const mimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

function dimensions(width: number, height: number) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > MAX_IMAGE_PIXELS
  )
    throw new Error("图片不能超过 2000 万像素。");
  return { width, height };
}

function identify(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
    throw new Error("图片不能超过 4 MB。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, size: number) =>
    String.fromCharCode(...bytes.slice(offset, offset + size));
  if (
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n) &&
    ascii(12, 4) === "IHDR"
  ) {
    for (let offset = 8; offset + 8 <= bytes.length; ) {
      const size = view.getUint32(offset);
      if (ascii(offset + 4, 4) === "acTL") throw new Error("请使用静态图片。");
      if (size > bytes.length - offset - 12) break;
      offset += size + 12;
    }
    return {
      mime: "image/png",
      ...dimensions(view.getUint32(16), view.getUint32(20)),
    };
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  ) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (
        marker === 1 ||
        (marker !== undefined && marker >= 208 && marker <= 215)
      )
        continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        marker !== undefined &&
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        length >= 8
      )
        return {
          mime: "image/jpeg",
          ...dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3)),
        };
      offset += length;
    }
  }
  if (bytes.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const format = ascii(12, 4);
    const u24 = (offset: number) =>
      bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
    if (format === "VP8X") {
      if (bytes[20]! & 2) throw new Error("请使用静态图片。");
      return { mime: "image/webp", ...dimensions(u24(24) + 1, u24(27) + 1) };
    }
    if (
      format === "VP8 " &&
      bytes[23] === 157 &&
      bytes[24] === 1 &&
      bytes[25] === 42
    )
      return {
        mime: "image/webp",
        ...dimensions(
          view.getUint16(26, true) & 16383,
          view.getUint16(28, true) & 16383,
        ),
      };
    if (format === "VP8L" && bytes[20] === 47) {
      const bits = view.getUint32(21, true);
      return {
        mime: "image/webp",
        ...dimensions((bits & 16383) + 1, ((bits >>> 14) & 16383) + 1),
      };
    }
  }
  throw new Error("请选择有效的 PNG、JPEG 或 WebP 图片。");
}

/** Revalidate even prepared values at the source insertion boundary. */
export function validateLocalImage(image: LocalImage): LocalImage {
  if (
    !image ||
    typeof image.dataUrl !== "string" ||
    image.dataUrl.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64
  )
    throw new Error("图片不能超过 4 MB。");
  const match =
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      image.dataUrl,
    );
  if (!match) throw new Error("请选择本机 PNG、JPEG 或 WebP 图片。");
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(match[2]!), (c) => c.charCodeAt(0));
  } catch {
    throw new Error("图片内容无效。");
  }
  const info = identify(bytes);
  dimensions(image.width, image.height);
  // JPEG EXIF orientation may exchange axes after browser decoding.
  const exact = info.width === image.width && info.height === image.height;
  const rotated =
    info.mime === "image/jpeg" &&
    info.width === image.height &&
    info.height === image.width;
  if (info.mime !== match[1] || (!exact && !rotated))
    throw new Error("图片格式或尺寸不一致。");
  if (typeof image.alt !== "string" || image.alt.length > 1000)
    throw new Error("图片名称过长。");
  return image;
}

export async function prepareLocalImage(file: File): Promise<LocalImage> {
  if (!mimeTypes.has(file.type))
    throw new Error("请选择 PNG、JPEG 或 WebP 图片。");
  if (!file.size || file.size > MAX_IMAGE_BYTES)
    throw new Error("图片不能超过 4 MB。");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = identify(bytes);
  if (info.mime !== file.type) throw new Error("图片格式与内容不一致。");
  let decoded: { width: number; height: number };
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file);
      try {
        decoded = dimensions(bitmap.width, bitmap.height);
      } finally {
        bitmap.close();
      }
    } else {
      const url = URL.createObjectURL(file);
      try {
        decoded = await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => {
            try {
              resolve(dimensions(image.naturalWidth, image.naturalHeight));
            } catch (error) {
              reject(error);
            }
          };
          image.onerror = () => reject(new Error("图片无法读取。"));
          image.src = url;
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  } catch {
    throw new Error("图片无法读取，或超过 2000 万像素。");
  }
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return validateLocalImage({
    dataUrl: `data:${info.mime};base64,${btoa(binary)}`,
    ...decoded,
    alt: file.name.slice(0, 1000),
  });
}
