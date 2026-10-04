import { documentObjectNodes, inspectDocumentObjects } from "./document-objects";
import { getObjectCapabilities } from "./object-edit";
import type { SlideObject } from "./slides";
import { MAX_DOCUMENT_BYTES } from "./slide-insert";
import { validateLocalImage, type LocalImage } from "./image-import";

const failure = () => new Error("此结构暂不支持调整，请选择独立的段落、图片或内容块。");
function locate(source: string, target: SlideObject) {
  const current = inspectDocumentObjects(source)[0]!.objects.find(o => o.id === target.id);
  if (!current || current.raw !== target.raw || current.title !== target.title || current.end !== target.end) throw new Error("对象已变化，请重新选择。");
  const entry = documentObjectNodes(source).find(n => n.node.sourceCodeLocation!.startOffset === target.start)!;
  const node = entry.node, loc = node.sourceCodeLocation!;
  if (!loc.startTag || (node.tagName !== "img" && !loc.endTag)) throw failure();
  return { node, loc };
}
function finish(source: string) {
  if (new TextEncoder().encode(source).byteLength > MAX_DOCUMENT_BYTES) throw new Error("修改后文件超过 5 MB，请减少内容。");
  return source;
}
function neighbor(source: string, target: SlideObject, direction: -1 | 1) {
  const { node } = locate(source, target);
  const siblings = node.parentNode?.childNodes ?? [];
  let i = siblings.indexOf(node) + direction;
  for (; i >= 0 && i < siblings.length; i += direction) {
    const next = siblings[i]!;
    if (next.nodeName === "#text" && "value" in next && !next.value.trim()) continue;
    // Comments, direct text and active/unrecognized siblings are boundaries.
    const other = inspectDocumentObjects(source)[0]!.objects.find(o => o.start === next.sourceCodeLocation?.startOffset);
    if (!other || !getObjectCapabilities(source, other, inspectDocumentObjects).reorder) return null;
    return other;
  }
  return null;
}
export function documentFlowCapabilities(source: string, target: SlideObject) {
  try {
    const { node } = locate(source, target);
    const independent = getObjectCapabilities(source, target, inspectDocumentObjects).reorder;
    const parent = node.parentNode;
    const insertion = !!parent && "tagName" in parent && ["body", "main", "div", "section", "article", "aside", "header", "footer", "blockquote", "figure"].includes(parent.tagName);
    return { up: independent && !!neighbor(source, target, -1), down: independent && !!neighbor(source, target, 1), insert: independent && insertion };
  } catch { return { up: false, down: false, insert: false }; }
}
/** Reorder sibling source blocks in document flow, not absolute slide coordinates. */
export function moveDocumentObject(source: string, target: SlideObject, direction: -1 | 1) {
  if (direction !== -1 && direction !== 1) throw failure();
  if (!documentFlowCapabilities(source, target)[direction === -1 ? "up" : "down"]) throw failure();
  const other = neighbor(source, target, direction)!;
  const a = locate(source, target).loc, b = locate(source, other).loc;
  const first = a.startOffset < b.startOffset ? a : b, last = first === a ? b : a;
  const next = finish(source.slice(0, first.startOffset) + source.slice(last.startOffset, last.endOffset) +
    source.slice(first.endOffset, last.startOffset) + source.slice(first.startOffset, first.endOffset) + source.slice(last.endOffset));
  const offset = direction === -1 ? b.startOffset : b.endOffset - (a.endOffset - a.startOffset);
  return { source: next, objectId: `doc-${offset}` };
}
export function insertDocumentObject(source: string, target: SlideObject, content: { text: string } | { image: LocalImage }) {
  if (!documentFlowCapabilities(source, target).insert) throw failure();
  const { loc } = locate(source, target);
  const encode = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  let fragment: string;
  if ("text" in content) {
    if (typeof content.text !== "string" || !content.text.trim() || content.text.length > 100_000) throw new Error("请输入有效文字。");
    fragment = `<p>${encode(content.text)}</p>`;
  } else {
    const image = validateLocalImage(content.image);
    fragment = `<img src="${image.dataUrl}" alt="${encode(image.alt)}" width="${image.width}" height="${image.height}" style="max-width:100%;height:auto">`;
  }
  const next = finish(source.slice(0, loc.endOffset) + fragment + source.slice(loc.endOffset));
  const added = inspectDocumentObjects(next)[0]!.objects.find(o => o.start === loc.endOffset);
  if (!added) throw failure();
  return { source: next, objectId: added.id };
}

/** Validate against real parents, including filtered wrappers and unsafe sibling boundaries. */
export function canMoveDocumentObjectTo(source: string, target: SlideObject, destination: SlideObject) {
  try {
    const a = locate(source, target), b = locate(source, destination);
    if (target.id === destination.id || !a.node.parentNode || a.node.parentNode !== b.node.parentNode) return false;
    const siblings = a.node.parentNode.childNodes;
    const from = siblings.indexOf(a.node), to = siblings.indexOf(b.node);
    const objects = inspectDocumentObjects(source)[0]!.objects;
    return siblings.slice(Math.min(from, to), Math.max(from, to) + 1).every(node => {
      if (node.nodeName === "#text" && "value" in node && !node.value.trim()) return true;
      const object = objects.find(item => item.start === node.sourceCodeLocation?.startOffset);
      return !!object && getObjectCapabilities(source, object, inspectDocumentObjects).reorder;
    });
  } catch { return false; }
}
/** A complete drag becomes one source change; preview/cancel never call this function. */
export function moveDocumentObjectTo(source: string, target: SlideObject, destination: SlideObject, side: "before" | "after") {
  if ((side !== "before" && side !== "after") || !canMoveDocumentObjectTo(source, target, destination)) throw failure();
  const a = locate(source, target), b = locate(source, destination);
  const siblings = a.node.parentNode!.childNodes.filter(node => !(node.nodeName === "#text" && "value" in node && !node.value.trim()));
  const from = siblings.indexOf(a.node), to = siblings.indexOf(b.node);
  if ((side === "before" && from + 1 === to) || (side === "after" && from === to + 1)) return { source, objectId: target.id };
  const start = a.loc.startOffset, end = a.loc.endOffset;
  const at = side === "before" ? b.loc.startOffset : b.loc.endOffset;
  const without = source.slice(0, start) + source.slice(end);
  const offset = at > start ? at - (end - start) : at;
  return { source: finish(without.slice(0, offset) + source.slice(start, end) + without.slice(offset)), objectId: `doc-${offset}` };
}
