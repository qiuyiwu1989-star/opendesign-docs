import { parse, type DefaultTreeAdapterMap } from "parse5";
import { createPreview } from "./html";
import { slideBridge } from "./slides-bridge";
type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
export type SlideObject = {
  id: string;
  tag: string;
  title: string;
  depth: number;
  start: number;
  end: number;
  raw: string;
  style: string;
  styleStart: number | undefined;
  styleEnd: number | undefined;
};
export type SlidePage = {
  id: string;
  title: string;
  start: number;
  objects: SlideObject[];
};
export type Placement = { x: number; y: number; scale: number };
const element = (node: Node): node is Element => "tagName" in node;
const attr = (node: Element, name: string) =>
  node.attrs.find((a) => a.name === name)?.value ?? "";
function text(node: Node): string {
  return "value" in node
    ? node.value
    : "childNodes" in node
      ? node.childNodes.map(text).join("")
      : "";
}
function descendants(
  node: Element,
  depth = 0,
): { node: Element; depth: number; path: string }[] {
  const allowed = new Set(
    "h1 h2 h3 h4 p div section article img svg ul ol li table blockquote figure span".split(
      " ",
    ),
  );
  return node.childNodes
    .filter(element)
    .filter((n) => allowed.has(n.tagName) && n.sourceCodeLocation?.startTag)
    .flatMap((n, j) => [
      { node: n, depth, path: String(j) },
      ...(n.tagName === "svg"
        ? []
        : descendants(n, depth + 1).map((child) => ({
            ...child,
            path: `${j}-${child.path}`,
          }))),
    ]);
}
export function inspectSlides(source: string): SlidePage[] {
  const tree = parse(source, { sourceCodeLocationInfo: true });
  const candidates: Element[] = [];
  const visit = (node: Node) => {
    if (
      element(node) &&
      ["script", "style", "template", "svg", "head"].includes(node.tagName)
    )
      return;
    if (
      element(node) &&
      node.sourceCodeLocation?.endTag &&
      (node.attrs.some((a) => a.name === "data-slide") ||
        attr(node, "class")
          .split(/\s+/)
          .some((c) => ["slide", "ppt-slide", "slide-page"].includes(c)))
    ) {
      candidates.push(node);
      return;
    }
    if ("childNodes" in node) node.childNodes.forEach(visit);
  };
  visit(tree);
  if (
    !candidates.length ||
    candidates.length > 100 ||
    candidates.some((n) => n.parentNode !== candidates[0]!.parentNode)
  )
    return [];
  return candidates.map((node, i) => ({
    id: `page-${i}`,
    start: node.sourceCodeLocation!.startOffset,
    title:
      text(
        descendants(node).find(
          ({ node: n }) =>
            /^h[1-3]$/.test(n.tagName) ||
            /(?:^|\s)h[1-3](?:\s|$)/.test(attr(n, "class")),
        )?.node ?? node,
      )
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 48) || `第 ${i + 1} 页`,
    objects: descendants(node)
      .slice(0, 400)
      .map(({ node: n, depth, path }) => {
        const loc = n.sourceCodeLocation!,
          style = loc.attrs?.style;
        return {
          id: `object-${i}-${path}`,
          depth,
          tag: n.tagName,
          title:
            text(n).trim().replace(/\s+/g, " ").slice(0, 48) ||
            attr(n, "alt") ||
            n.tagName.toUpperCase(),
          start: loc.startTag!.startOffset,
          end: loc.startTag!.endOffset,
          raw: source.slice(loc.startTag!.startOffset, loc.startTag!.endOffset),
          style: attr(n, "style"),
          styleStart: style?.startOffset,
          styleEnd: style?.endOffset,
        };
      }),
  }));
}
export function validatePlacement(value: unknown): Placement {
  const p = value as Placement;
  if (
    !p ||
    ![p.x, p.y, p.scale].every(
      (n) => typeof n === "number" && Number.isFinite(n),
    ) ||
    Math.abs(p.x) > 10000 ||
    Math.abs(p.y) > 10000 ||
    p.scale < 0.1 ||
    p.scale > 5
  )
    throw new Error("位置或缩放超出范围。");
  return {
    x: Math.round(p.x * 10) / 10,
    y: Math.round(p.y * 10) / 10,
    scale: Math.round(p.scale * 1000) / 1000,
  };
}
// Only modify the start-tag style attribute. Everything else remains byte-equivalent.
export function patchPlacement(
  source: string,
  target: SlideObject,
  value: Placement,
): string {
  const current = inspectSlides(source)
    .flatMap((p) => p.objects)
    .find((o) => o.id === target.id);
  if (!current || current.start !== target.start || current.raw !== target.raw)
    throw new Error("对象已变化，请重新选择。");
  const p = validatePlacement(value);
  // Coalesce our previous final declarations, keeping all preceding styles.
  // Repeated nudges must not grow the HTML by two declarations on every step.
  const baseStyle = target.style.replace(
    /(?:translate:-?[\d.]+px -?[\d.]+px!important;scale:[\d.]+!important;)+$/,
    "",
  );
  const style = `${baseStyle}${baseStyle.trim().endsWith(";") || !baseStyle.trim() ? "" : ";"}translate:${p.x}px ${p.y}px!important;scale:${p.scale}!important;`;
  const encoded = style
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
  if (target.styleStart !== undefined && target.styleEnd !== undefined)
    return (
      source.slice(0, target.styleStart) +
      `style="${encoded}"` +
      source.slice(target.styleEnd)
    );
  const offset =
    target.end - (source.slice(target.end - 2, target.end) === "/>" ? 2 : 1);
  return source.slice(0, offset) + ` style="${encoded}"` + source.slice(offset);
}
export function createSlidePreview(
  source: string,
  channel: string,
  pageId: string,
  selectionOnly = false,
): string {
  const pages = inspectSlides(source),
    page = pages.find((p) => p.id === pageId);
  if (!page) throw new Error("未识别到演示页面，请使用长文档模式。");
  const pageOffsets = new Map(pages.map((p) => [p.start, p.id]));
  const objectOffsets = new Map(page.objects.map((o) => [o.start, o.id]));
  const preview = createPreview(source, channel, false, 0, false, (node) => {
    const offset = node.sourceCodeLocation?.startTag?.startOffset;
    if (offset === undefined) return;
    const pid = pageOffsets.get(offset),
      oid = objectOffsets.get(offset);
    if (pid) node.attrs.push({ name: "data-doc-slide", value: pid });
    if (oid)
      node.attrs.push(
        { name: "data-doc-object", value: oid },
        { name: "tabindex", value: "0" },
      );
  });
  return preview.replace(
    new RegExp(`<script nonce="${channel}">[\\s\\S]*?<\\/script>`),
    `<script nonce="${channel}">${slideBridge(channel, pageId, selectionOnly)}</script>`,
  );
}
