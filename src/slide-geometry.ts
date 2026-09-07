export type GestureGeometry = {
  x: number;
  y: number;
  scale: number;
  width: number;
  originX: number;
  originY: number;
};

// Self-contained: also embedded in the trusted iframe bridge, so unit tests
// exercise the exact same gesture calculation as the browser.
export function gesturePlacement(
  before: GestureGeometry,
  dx: number,
  dy: number,
  resize: boolean,
) {
  if (
    ![
      before.x,
      before.y,
      before.scale,
      before.width,
      before.originX,
      before.originY,
      dx,
      dy,
    ].every(Number.isFinite) ||
    before.scale <= 0 ||
    before.width <= 0
  )
    throw new Error("Invalid gesture geometry");
  const scale = resize
    ? Math.min(5, Math.max(0.1, before.scale * (1 + dx / before.width)))
    : before.scale;
  // CSS scale is about transform-origin (usually the center). Compensate its
  // shift so dragging the bottom-right handle leaves the top-left in place.
  const x = before.x + (resize ? (scale - before.scale) * before.originX : dx);
  const y = before.y + (resize ? (scale - before.scale) * before.originY : dy);
  return {
    x: Math.min(10000, Math.max(-10000, x)),
    y: Math.min(10000, Math.max(-10000, y)),
    scale,
  };
}
