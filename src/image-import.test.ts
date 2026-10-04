import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_IMAGE_BYTES,
  prepareLocalImage,
  validateLocalImage,
} from "./image-import";
function png(width = 2, height = 3) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
const file = (bytes: Uint8Array, type = "image/png") =>
  new File([bytes as Uint8Array<ArrayBuffer>], "local.png", { type });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
describe("spec 016 local bitmap import", () => {
  it("checks magic and dimensions, decodes and embeds without network", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 2, height: 3, close }),
    );
    const result = await prepareLocalImage(file(png()));
    expect(result).toMatchObject({ width: 2, height: 3, alt: "local.png" });
    expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(close).toHaveBeenCalledOnce();
    expect(validateLocalImage(result)).toBe(result);
  });
  it("rejects wrong MIME, magic, emptiness and size before decoding", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    for (const sample of [
      file(png(), "image/svg+xml"),
      file(png(), "image/jpeg"),
      file(new Uint8Array()),
      file(new Uint8Array(MAX_IMAGE_BYTES + 1)),
      file(new TextEncoder().encode("<svg/>")),
    ])
      await expect(prepareLocalImage(sample)).rejects.toThrow();
    expect(decode).not.toHaveBeenCalled();
  });
  it("rejects decompression-sized headers before browser decode", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    await expect(prepareLocalImage(file(png(10000, 10000)))).rejects.toThrow(
      "2000",
    );
    expect(decode).not.toHaveBeenCalled();
  });
  it("rejects animated PNG before browser decode", async () => {
    const bytes = new Uint8Array(53);
    bytes.set(png());
    const view = new DataView(bytes.buffer);
    view.setUint32(8, 13);
    view.setUint32(33, 8);
    bytes.set(new TextEncoder().encode("acTL"), 37);
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    await expect(prepareLocalImage(file(bytes))).rejects.toThrow("静态");
    expect(decode).not.toHaveBeenCalled();
  });
  it("rejects corrupt images on decoder failure and closes oversized decoded bitmap", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("bad")),
    );
    await expect(prepareLocalImage(file(png()))).rejects.toThrow("无法读取");
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 10000, height: 10000, close }),
    );
    await expect(prepareLocalImage(file(png()))).rejects.toThrow();
    expect(close).toHaveBeenCalledOnce();
  });
  it("accepts JPEG and WebP signatures with browser-verified dimensions", async () => {
    const jpeg = new Uint8Array([255, 216, 255, 192, 0, 8, 8, 0, 3, 0, 2, 0]);
    const webp = new Uint8Array(30);
    webp.set(new TextEncoder().encode("RIFF"));
    webp.set(new TextEncoder().encode("WEBPVP8X"), 8);
    webp[24] = 1;
    webp[27] = 2;
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 2, height: 3, close: vi.fn() }),
    );
    expect((await prepareLocalImage(file(jpeg, "image/jpeg"))).dataUrl).toMatch(
      /^data:image\/jpeg/,
    );
    expect((await prepareLocalImage(file(webp, "image/webp"))).dataUrl).toMatch(
      /^data:image\/webp/,
    );
    webp[20] = 2;
    await expect(prepareLocalImage(file(webp, "image/webp"))).rejects.toThrow(
      "静态",
    );
  });
});

describe("image decoder timeout", () => {
  it("rejects stalled bitmap decoding and closes a late bitmap", async () => {
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn(() => new Promise(resolve => { finish = resolve; })));
    const result = prepareLocalImage(file(png()));
    const rejected = expect(result).rejects.toThrow("超时");
    await vi.advanceTimersByTimeAsync(15000);
    await rejected;
    finish({ width: 2, height: 3, close });
    await vi.advanceTimersByTimeAsync(0);
    expect(close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("releases fallback URL and detaches handlers on timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("createImageBitmap", undefined);
    const instance = { onload: null, onerror: null, src: "", removeAttribute: vi.fn() };
    vi.stubGlobal("Image", class { constructor() { return instance; } });
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: () => "blob:test", revokeObjectURL: revoke });
    const result = prepareLocalImage(file(png()));
    const rejected = expect(result).rejects.toThrow("超时");
    await vi.advanceTimersByTimeAsync(15000);
    await rejected;
    expect(revoke).toHaveBeenCalledWith("blob:test");
    expect(instance.onload).toBeNull();
    expect(instance.onerror).toBeNull();
    expect(instance.removeAttribute).toHaveBeenCalledWith("src");
  });
});
