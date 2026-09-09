import type { SlideObject, SlidePage } from "./slides";
import { readSourceTree, type SourceElement as Element, type SourceNode as Node } from "./source-tree";

const allowed = new Set("h1 h2 h3 h4 p div section article blockquote figure ul ol li img".split(" "));
const blocked = new Set("head script style svg math template noscript iframe object embed textarea".split(" "));
const isElement = (node: Node): node is Element => "tagName" in node;
// One source only: capability checks share a parse without retaining a document history.
let cachedSource: string | undefined;
let cachedNodes: { node: Element; depth: number }[] = [];
function text(node: Node): string {
  return "value" in node ? node.value : "childNodes" in node ? node.childNodes.map(text).join("") : "";
}
export function documentObjectNodes(source: string) {
  if (source === cachedSource) return cachedNodes;
  const nodes: { node: Element; depth: number }[] = [];
  const visit = (node: Node, depth: number) => {
    if (isElement(node)) {
      if (blocked.has(node.tagName) || node.namespaceURI !== "http://www.w3.org/1999/xhtml") return;
      if (allowed.has(node.tagName) && node.sourceCodeLocation?.startTag) nodes.push({ node, depth });
    }
    if ("childNodes" in node) node.childNodes.forEach(child => visit(child, depth + 1));
  };
  visit(readSourceTree(source).root, 0);
  cachedSource = source;
  cachedNodes = nodes.slice(0, 400);
  return cachedNodes;
}
/** Same exact-source object contract as slides, without wrapping or reserializing HTML. */
export function inspectDocumentObjects(source: string): SlidePage[] {
  const objects: SlideObject[] = documentObjectNodes(source).map(({ node, depth }) => {
    const loc = node.sourceCodeLocation!, tag = loc.startTag!, style = loc.attrs?.style;
    return { id: `doc-${tag.startOffset}`, tag: node.tagName, depth,
      title: text(node).trim().replace(/\s+/g, " ").slice(0, 48) || node.attrs.find(a => a.name === "alt")?.value || node.tagName.toUpperCase(),
      start: tag.startOffset, end: tag.endOffset, raw: source.slice(tag.startOffset, tag.endOffset),
      style: node.attrs.find(a => a.name === "style")?.value ?? "", styleStart: style?.startOffset, styleEnd: style?.endOffset };
  });
  return [{ id: "document", title: "文档", start: 0, objects }];
}
