import { parse, type DefaultTreeAdapterMap } from "parse5";
import { validateLocalImage, type LocalImage } from "./image-import";
import { MAX_DOCUMENT_BYTES } from "./slide-insert";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
export type PictureTarget = { offset: number; label: string; raw: string; image: Element; candidates: Element[] };
const inert = new Set(["script", "template", "noscript", "svg", "math", "iframe", "object"]);
const candidateAttrs = new Set(["srcset", "sizes", "media", "type", "width", "height"]);
const bitmap = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/i;

/** Conservative static targets; parse-recovered or scripted picture content is not editable. */
export function inspectPictureTargets(source: string): PictureTarget[] {
  const errors: { startOffset: number; endOffset: number }[] = [];
  const tree = parse(source, { sourceCodeLocationInfo: true, onParseError: e => {
    if (e.code !== "missing-doctype") errors.push(e);
  } });
  const targets: PictureTarget[] = [];
  const visit = (node: Node, inPicture = false) => {
    if ("tagName" in node) {
      if (inert.has(node.tagName)) return;
      if (node.tagName === "picture") {
        const loc = node.sourceCodeLocation;
        let cursor = loc?.startTag?.endOffset;
        const continuous = node.childNodes.every(n => {
          const span = n.sourceCodeLocation;
          if (!span || span.startOffset !== cursor) return false;
          cursor = span.endOffset;
          return true;
        }) && cursor === loc?.endTag?.startOffset;
        const children = node.childNodes.filter(n => n.nodeName !== "#comment" && !("value" in n && !n.value.trim()));
        const elements = children.filter((n): n is Element => "tagName" in n);
        const img = elements.at(-1);
        const candidates = elements.slice(0, -1);
        const valid = !inPicture && continuous && loc?.startTag && loc.endTag && elements.length === children.length &&
          img?.tagName === "img" && candidates.every(n => n.tagName === "source" && n.attrs.every(a => candidateAttrs.has(a.name))) &&
          [node, ...elements].every(n => n.namespaceURI === "http://www.w3.org/1999/xhtml" &&
            n.sourceCodeLocation?.startTag && !n.attrs.some(a => /^on/i.test(a.name))) &&
          !errors.some(e => e.startOffset < loc.endOffset && e.endOffset >= loc.startOffset);
        if (valid) {
          const url = img.attrs.find(a => a.name === "src")?.value ?? "";
          const hasCandidates = candidates.some(n => n.attrs.some(a => a.name === "srcset")) || img.attrs.some(a => a.name === "srcset");
          if (hasCandidates || !bitmap.test(url)) {
            const label = img.attrs.find(a => a.name === "alt")?.value || url || "响应式图片";
            targets.push({ offset: loc.startOffset, raw: source.slice(loc.startOffset, loc.endOffset),
              label: /^data:/i.test(label) ? "内嵌图片" : label.slice(0, 180), image: img, candidates });
          }
        }
        // Nested pictures never become independently editable targets.
        inPicture = true;
      }
    }
    if ("childNodes" in node) node.childNodes.forEach(n => visit(n, inPicture));
  };
  visit(tree);
  return targets;
}

export function replacePictureImage(source: string, target: Pick<PictureTarget, "offset" | "raw">, image: LocalImage, confirmed: boolean): string {
  if (!confirmed) throw new Error("请先确认所有屏幕使用同一张图片。");
  validateLocalImage(image);
  const current = inspectPictureTargets(source).find(t => t.offset === target.offset && t.raw === target.raw);
  if (!current) throw new Error("响应式图片已变化或结构不支持，请重新选择。");
  const loc = current.image.sourceCodeLocation!;
  const patches = current.candidates.map(n => ({ start: n.sourceCodeLocation!.startTag!.startOffset,
    end: n.sourceCodeLocation!.startTag!.endOffset, value: "" }));
  for (const name of ["src", "srcset"]) {
    const span = loc.attrs?.[name];
    if (span) patches.push({ start: span.startOffset, end: span.endOffset, value: "" });
  }
  const start = loc.startTag!.startOffset;
  const insert = start + /^<img\b/i.exec(source.slice(start))![0].length;
  patches.push({ start: insert, end: insert, value: ` src="${image.dataUrl}"` });
  let next = source;
  for (const patch of patches.sort((a, b) => b.start - a.start)) next = next.slice(0, patch.start) + patch.value + next.slice(patch.end);
  if (new TextEncoder().encode(next).byteLength > MAX_DOCUMENT_BYTES) throw new Error("替换后 HTML 超过 5 MiB，请选择更小的图片。");
  return next;
}
