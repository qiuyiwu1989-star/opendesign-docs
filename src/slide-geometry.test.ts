import { describe, expect, it } from "vitest";
import { gesturePlacement } from "./slide-geometry";
const base = { x: 20, y: 30, scale: 1, width: 200, height: 100, originX: 100, originY: 50 };
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
    const next = gesturePlacement(base, 100, 50, true);
    expect(next).toEqual({ x: 70, y: 55, scale: 1.5 });
    expect(next.x + base.originX * (1 - next.scale)).toBe(base.x);
    expect(next.y + base.originY * (1 - next.scale)).toBe(base.y);
  });
  it("resizes an already-scaled object using its rendered width", () => {
    expect(
      gesturePlacement({ ...base, scale: 2, width: 400, height: 200 }, 100, 50, true),
    ).toEqual({ x: 70, y: 55, scale: 2.5 });
  });
  it("handles top-left origins and clamps extreme scaling", () => {
    expect(
      gesturePlacement({ ...base, originX: 0, originY: 0 }, 100, 50, true),
    ).toEqual({ x: 20, y: 30, scale: 1.5 });
    expect(gesturePlacement(base, -1000, 0, true).scale).toBe(0.1);
    expect(gesturePlacement(base, 100000, 0, true).scale).toBe(5);
    expect(() => gesturePlacement(base, NaN, 0, false)).toThrow();
  });
});

describe("spec022 two-axis proportional resize", () => {
  it("responds to vertical movement and projects mixed directions smoothly", () => {
    expect(gesturePlacement(base, 0, 50, true).scale).toBeCloseTo(1.1);
    expect(gesturePlacement(base, 100, 0, true).scale).toBeCloseTo(1.4);
    expect(gesturePlacement(base, 50, -100, true).scale).toBe(1);
  });
  it("preserves the fixed corner at the translation limit", () => {
    const start = { ...base, x: 9990 };
    const next = gesturePlacement(start, 100, 50, true);
    expect(next.scale).toBeCloseTo(1.1);
    expect(next.x).toBe(10000);
    expect(next.x + start.originX * (1 - next.scale)).toBeCloseTo(start.x);
    expect(next.y + start.originY * (1 - next.scale)).toBeCloseTo(start.y);
  });
  it("rejects zero or nonfinite heights before resize arithmetic", () => {
    expect(() => gesturePlacement({ ...base, height: 0 }, 0, 50, true)).toThrow();
    expect(() => gesturePlacement({ ...base, height: Infinity }, 0, 50, true)).toThrow();
  });
});
