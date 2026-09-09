import { describe, expect, it } from "vitest";
import { scaleAtFixedCorner, translateFromBeforeDist, type Matrix2D } from "./coordinates";
import { inspectSlides, patchPlacement, validatePlacement } from "../../src/slides";

const angle = 6 * Math.PI / 180;
const matrix: Matrix2D = { a: Math.cos(angle), b: Math.sin(angle), c: -Math.sin(angle), d: Math.cos(angle), e: 0, f: 0 };
describe("spec032 bounded Moveable coordinate adapter", () => {
  it("maps inverse-before-matrix distance to CSS translate, regardless of outer iframe display zoom", () => {
    for (const outerZoom of [1, .75, .5]) {
      const requestedDocumentPixels = 10;
      const before = { x: 0, y: 0, scale: 1.096 };
      // iframe client coordinates already exclude the outer iframe CSS scale.
      // A request remains ten document pixels (10 * outerZoom visible pixels).
      const libraryBeforeDist = requestedDocumentPixels / before.scale;
      const result = validatePlacement(translateFromBeforeDist(before, [libraryBeforeDist, 0]));
      expect(result.x).toBe(10);
      expect(result.x * outerZoom).toBeCloseTo(10 * outerZoom);
      expect(result.y).toBe(0);
    }
  });
  it("preserves a rotated fixed corner with center transform origin", () => {
    const before = { x: 10, y: 20, scale: 1.096 };
    const geometry = { width: 314, height: 194, originX: 157, originY: 97, matrix, direction: [1, 1] as const };
    const next = scaleAtFixedCorner(before, 1.2, geometry);
    const vector = { x: matrix.a * -157 + matrix.c * -97, y: matrix.b * -157 + matrix.d * -97 };
    expect(next.x + next.scale * vector.x).toBeCloseTo(before.x + before.scale * vector.x);
    expect(next.y + next.scale * vector.y).toBeCloseTo(before.y + before.scale * vector.y);
  });
  it("keeps a top-left origin fixed when growing from its opposite corner", () => {
    expect(scaleAtFixedCorner({ x: 10, y: 20, scale: 1 }, 1.096, {
      width: 314, height: 194, originX: 0, originY: 0, matrix, direction: [1, 1],
    })).toEqual({ x: 10, y: 20, scale: 1.096 });
  });
  it("round-trips scale, nudge and original rotation through source patch and saved-source serialization", () => {
    const original = '<!doctype html><section class="slide"><div style="transform:rotate(6deg);transform-origin:0 0">Example</div></section>';
    const target = inspectSlides(original)[0]!.objects.find(o => o.tag === "div")!;
    const scaled = scaleAtFixedCorner({ x: 0, y: 0, scale: 1 }, 1.096, {
      width: 314, height: 194, originX: 0, originY: 0, matrix, direction: [1, 1],
    });
    let source = patchPlacement(original, target, scaled);
    const moved = translateFromBeforeDist(scaled, [10 / 1.096, 0]);
    source = patchPlacement(source, inspectSlides(source)[0]!.objects.find(o => o.tag === "div")!, moved);
    const saved = JSON.stringify({ source });
    const restored = JSON.parse(saved).source as string;
    expect(restored).toBe(source);
    expect(restored).toContain("transform:rotate(6deg);transform-origin:0 0");
    expect(restored).toContain("translate:10px 0px!important;scale:1.096!important;");
    expect((restored.match(/translate:/g) || []).length).toBe(1);
    expect(inspectSlides(restored)[0]!.objects.find(o => o.tag === "div")!.title).toBe("Example");
  });
  it("rejects unsupported scale arithmetic rather than silently corrupting a source patch", () => {
    expect(() => translateFromBeforeDist({ x: 0, y: 0, scale: 0 }, [10, 0])).toThrow();
    expect(() => scaleAtFixedCorner({ x: 0, y: 0, scale: 1 }, 6, {
      width: 314, height: 194, originX: 0, originY: 0, matrix, direction: [1, 1],
    })).toThrow();
  });
});
