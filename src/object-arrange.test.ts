import { describe, it, expect } from "vitest";
import { alignmentPlacement, validateGeometry } from "./object-arrange";
describe("spec018 page alignment", () => {
  const geometry = {
    left: 120,
    top: 90,
    width: 400,
    height: 160,
    pageWidth: 1280,
    pageHeight: 720,
  };
  const position = { x: 20, y: 10, scale: 0.5 };
  it("aligns the visual box while retaining scale and untouched axis", () => {
    expect(alignmentPlacement(position, geometry, "left")).toEqual({
      x: -100,
      y: 10,
      scale: 0.5,
    });
    expect(alignmentPlacement(position, geometry, "center")).toEqual({
      x: 340,
      y: 10,
      scale: 0.5,
    });
    expect(alignmentPlacement(position, geometry, "right")).toEqual({
      x: 780,
      y: 10,
      scale: 0.5,
    });
    expect(alignmentPlacement(position, geometry, "top")).toEqual({
      x: 20,
      y: -80,
      scale: 0.5,
    });
    expect(alignmentPlacement(position, geometry, "middle")).toEqual({
      x: 20,
      y: 200,
      scale: 0.5,
    });
    expect(alignmentPlacement(position, geometry, "bottom")).toEqual({
      x: 20,
      y: 480,
      scale: 0.5,
    });
  });
  it("is idempotent once the measured box reaches the edge", () => {
    const p = alignmentPlacement(position, geometry, "right");
    expect(alignmentPlacement(p, { ...geometry, left: 880 }, "right")).toEqual(
      p,
    );
  });
  it("rejects absent, nonfinite and unbounded geometry or action", () => {
    for (const g of [
      null,
      {},
      { ...geometry, width: 0 },
      { ...geometry, left: NaN },
      { ...geometry, pageWidth: Infinity },
      { ...geometry, top: 20001 },
    ])
      expect(() => validateGeometry(g)).toThrow();
    expect(() =>
      alignmentPlacement(position, geometry, "bad" as never),
    ).toThrow();
    expect(() =>
      alignmentPlacement(position, { ...geometry, left: -20000 }, "right"),
    ).toThrow();
  });
});
