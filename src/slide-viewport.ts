import type { Geometry } from "./object-arrange";
export type ViewportSize = { width: number; height: number };
export type ViewportCamera = { scale: number; x: number; y: number };
export function fitSlideViewport(viewport: ViewportSize): ViewportCamera {
  return { scale: Math.max(0.05, Math.min((viewport.width - 32) / 1280, (viewport.height - 32) / 720, 1)), x: 0, y: 0 };
}
export function focusSlideObject(viewport: ViewportSize, geometry: Geometry): ViewportCamera {
  // The sandbox bridge fits each source page inside the 1280x720 frame with
  // a 20px gutter. Convert its page-space geometry to iframe CSS pixels first.
  const innerScale = Math.max(0.05, Math.min(1240 / geometry.pageWidth, 680 / geometry.pageHeight, 1));
  const left = Math.max(20, (1280 - geometry.pageWidth * innerScale) / 2);
  const top = Math.max(20, (720 - geometry.pageHeight * innerScale) / 2);
  const scale = Math.max(0.05, Math.min((viewport.width - 64) / (geometry.width * innerScale), (viewport.height - 64) / (geometry.height * innerScale), 2));
  return { scale, x: (640 - left - (geometry.left + geometry.width / 2) * innerScale) * scale, y: (360 - top - (geometry.top + geometry.height / 2) * innerScale) * scale };
}
/** Keep at least 48px of the page within reach while panning. */
export function panSlideViewport(camera: ViewportCamera, viewport: ViewportSize, delta: { x: number; y: number }): ViewportCamera {
  const limitX = Math.max(0, (viewport.width + 1280 * camera.scale) / 2 - 48);
  const limitY = Math.max(0, (viewport.height + 720 * camera.scale) / 2 - 48);
  return { ...camera, x: Math.max(-limitX, Math.min(limitX, camera.x + delta.x)), y: Math.max(-limitY, Math.min(limitY, camera.y + delta.y)) };
}
