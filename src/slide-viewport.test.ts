import { describe, it, expect } from "vitest";
import { fitSlideViewport, focusSlideObject, panSlideViewport } from "./slide-viewport";

describe("presentation viewport camera", () => {
  it("fits the full page with a margin after sidebar resize", () => {
    expect(fitSlideViewport({ width: 1312, height: 752 })).toEqual({ scale: 1, x: 0, y: 0 });
    const small = fitSlideViewport({ width: 672, height: 400 });
    expect(small.scale).toBe(0.5);
    expect(fitSlideViewport({ width: 0, height: 0 }).scale).toBe(0.05);
  });
  it("centers the selected visual box without modifying geometry", () => {
    const geometry = { left: 100, top: 80, width: 200, height: 100, pageWidth: 1280, pageHeight: 720 };
    const original = { ...geometry };
    const camera = focusSlideObject({ width: 800, height: 600 }, geometry);
    expect(camera.scale).toBe(2);
    expect(((geometry.left + geometry.width / 2 - 640) * (680 / 720)) * camera.scale + camera.x).toBeCloseTo(0);
    expect(((geometry.top + geometry.height / 2 - 360) * (680 / 720)) * camera.scale + camera.y).toBeCloseTo(0);
    expect(geometry).toEqual(original);
  });
  it("maps nonstandard page sizes through the sandbox fit", () => {
    const camera = focusSlideObject({ width: 800, height: 600 }, { left: 0, top: 0, width: 400, height: 200, pageWidth: 400, pageHeight: 200 });
    expect(camera.x).toBe(0);
    expect(camera.y).toBe(0);
  });
  it("pans in screen pixels independent of scale and retains a reachable page", () => {
    const original = { scale: 0.5, x: 0, y: 0 };
    expect(panSlideViewport(original, { width: 800, height: 600 }, { x: 40, y: -20 })).toEqual({ scale: 0.5, x: 40, y: -20 });
    expect(panSlideViewport(original, { width: 800, height: 600 }, { x: 9000, y: -9000 })).toEqual({ scale: 0.5, x: 672, y: -432 });
    expect(original).toEqual({ scale: 0.5, x: 0, y: 0 });
  });
});
