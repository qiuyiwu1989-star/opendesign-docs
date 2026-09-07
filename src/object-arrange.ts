import { validatePlacement, type Placement } from "./slides";

export type Geometry = {
  left: number;
  top: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
};
export type Alignment =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom";
export function validateGeometry(value: unknown): Geometry {
  const g = value as Geometry;
  if (
    !g ||
    ![g.left, g.top, g.width, g.height, g.pageWidth, g.pageHeight].every(
      (n) =>
        typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 20000,
    ) ||
    [g.width, g.height, g.pageWidth, g.pageHeight].some((n) => n <= 0)
  )
    throw new Error("对象尺寸尚未就绪，请重新选择。");
  return {
    left: g.left,
    top: g.top,
    width: g.width,
    height: g.height,
    pageWidth: g.pageWidth,
    pageHeight: g.pageHeight,
  };
}
/** Geometry is the visual box in page CSS pixels, including object scale. */
export function alignmentPlacement(
  value: Placement,
  geometry: Geometry,
  alignment: Alignment,
): Placement {
  const p = validatePlacement(value),
    g = validateGeometry(geometry);
  switch (alignment) {
    case "left":
      p.x -= g.left;
      break;
    case "center":
      p.x += (g.pageWidth - g.width) / 2 - g.left;
      break;
    case "right":
      p.x += g.pageWidth - g.width - g.left;
      break;
    case "top":
      p.y -= g.top;
      break;
    case "middle":
      p.y += (g.pageHeight - g.height) / 2 - g.top;
      break;
    case "bottom":
      p.y += g.pageHeight - g.height - g.top;
      break;
    default:
      throw new Error("对齐方式无效。");
  }
  return validatePlacement(p);
}
