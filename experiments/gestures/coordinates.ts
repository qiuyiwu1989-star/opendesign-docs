// Experimental adapter for Moveable 0.53.0 / react-moveable 0.56.0.
// Draggable.beforeDist is inverse-before-matrix space, not CSS translate space.
// Under our bounded contract the only linear individual transform is scale;
// legacy `transform` (including its rotation) is after that insertion point.
export type Placement = { x: number; y: number; scale: number };
export type Matrix2D = { a: number; b: number; c: number; d: number; e: number; f: number };
export type FixedGeometry = {
  width: number; height: number; originX: number; originY: number;
  matrix: Matrix2D; direction: readonly [number, number];
};
export function translateFromBeforeDist(before: Placement, distance: readonly number[]): Placement {
  const [dx, dy] = distance;
  if (dx === undefined || dy === undefined || ![dx, dy, before.scale].every(Number.isFinite) || before.scale <= 0)
    throw new Error("Unsupported drag distance");
  return { ...before, x: before.x + dx * before.scale, y: before.y + dy * before.scale };
}
export function scaleAtFixedCorner(before: Placement, scale: number, geometry: FixedGeometry): Placement {
  const { width, height, originX, originY, matrix: m, direction } = geometry;
  if (![scale, width, height, originX, originY, m.a, m.b, m.c, m.d, m.e, m.f].every(Number.isFinite) || scale < .1 || scale > 5 || width <= 0 || height <= 0)
    throw new Error("Unsupported scale geometry");
  const fx = (1 - direction[0]) * width / 2 - originX;
  const fy = (1 - direction[1]) * height / 2 - originY;
  // CSS order: translate -> individual scale -> legacy transform, all about O.
  // Preserve layout + translate + O + scale * (legacyMatrix * (fixed - O)).
  return {
    x: before.x + (before.scale - scale) * (m.a * fx + m.c * fy + m.e),
    y: before.y + (before.scale - scale) * (m.b * fx + m.d * fy + m.f), scale,
  };
}
