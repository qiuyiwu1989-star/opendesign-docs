import { describe, expect, it } from "vitest";
import { gesturePlacement } from "./slide-geometry";
const base = { x: 20, y: 30, scale: 1, width: 200, originX: 100, originY: 50 };
describe("spec 014 gesture geometry", () => {
  it("moves by unzoomed deltas and bounds offsets", () => {
    expect(gesturePlacement(base, 40, -10, false)).toEqual({
      x: 60,
      y: 20,
      scale: 1,
    });
    expect(gesturePlacement(base, 20000, -20000, false)).toEqual({
      x: 10000,
      y: -10000,
      scale: 1,
    });
  });
  it("keeps the top-left corner fixed during proportional resize", () => {
    const next = gesturePlacement(base, 100, 0, true);
    expect(next).toEqual({ x: 70, y: 55, scale: 1.5 });
    expect(next.x + base.originX * (1 - next.scale)).toBe(base.x);
    expect(next.y + base.originY * (1 - next.scale)).toBe(base.y);
  });
  it("resizes an already-scaled object using its rendered width", () => {
    expect(
      gesturePlacement({ ...base, scale: 2, width: 400 }, 100, 0, true),
    ).toEqual({ x: 70, y: 55, scale: 2.5 });
  });
  it("handles top-left origins and clamps extreme scaling", () => {
    expect(
      gesturePlacement({ ...base, originX: 0, originY: 0 }, 100, 0, true),
    ).toEqual({ x: 20, y: 30, scale: 1.5 });
    expect(gesturePlacement(base, -1000, 0, true).scale).toBe(0.1);
    expect(gesturePlacement(base, 100000, 0, true).scale).toBe(5);
    expect(() => gesturePlacement(base, NaN, 0, false)).toThrow();
  });
});
