export type GestureGeometry = {
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
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
      before.height,
      before.originX,
      before.originY,
      dx,
      dy,
    ].every(Number.isFinite) ||
    before.scale <= 0 ||
    before.width <= 0 ||
    before.height <= 0
  )
    throw new Error("Invalid gesture geometry");
  // Project the pointer onto the original diagonal. Both horizontal and vertical
  // movement contribute, without changing the aspect ratio or jumping axes.
  const growth =
    (dx * before.width + dy * before.height) /
    (before.width * before.width + before.height * before.height);
  let scale = resize
    ? Math.min(5, Math.max(0.1, before.scale * (1 + growth)))
    : before.scale;
  if (resize) {
    // Limit scale, not the compensated position, at placement boundaries. This
    // preserves the fixed corner even when an object is close to +/-10000.
    let low = 0.1;
    let high = 5;
    for (const [position, origin] of [[before.x, before.originX], [before.y, before.originY]] as const) {
      if (!origin) continue;
      const a = before.scale + (-10000 - position) / origin;
      const b = before.scale + (10000 - position) / origin;
      low = Math.max(low, Math.min(a, b));
      high = Math.min(high, Math.max(a, b));
    }
    scale = Math.min(high, Math.max(low, scale));
  }
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
