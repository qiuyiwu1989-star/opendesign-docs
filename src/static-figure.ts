import type { DefaultTreeAdapterMap } from "parse5";
type Element = DefaultTreeAdapterMap["element"];
const svgTags = new Set("svg g path rect circle ellipse line polyline polygon text tspan title desc a".split(" "));
/** A bounded inert chart subtree, never permission to execute or rewrite SVG. */
export function staticFigure(node: Element, nodes: Element[], malformed: readonly number[]) {
  if (node.tagName !== "figure" || !node.childNodes.some(n => "tagName" in n && n.tagName === "svg")) return false;
  const outer = node.sourceCodeLocation;
  if (!outer?.endTag) return false;
  return nodes.every(n => {
    const loc = n.sourceCodeLocation;
    const html = n.namespaceURI === "http://www.w3.org/1999/xhtml";
    const svg = n.namespaceURI === "http://www.w3.org/2000/svg";
    if (!loc?.startTag || loc.startOffset < outer.startOffset || loc.endOffset > outer.endOffset ||
        malformed.some(offset => offset >= loc.startOffset && offset <= loc.startTag!.endOffset)) return false;
    if (html ? !["figure", "figcaption", "span", "strong", "em", "a", "sup"].includes(n.tagName) : !svg || !svgTags.has(n.tagName)) return false;
    // SVG self-closing elements have no endTag. Recovered/unclosed elements are rejected.
    if (!loc.endTag && (html || loc.endOffset !== loc.startTag.endOffset)) return false;
    return n.attrs.every(a => {
      if (/^on|^data-doc-/i.test(a.name) || ["contenteditable", "src", "srcdoc", "target", "id", "name", "tabindex"].includes(a.name)) return false;
      if (a.name === "href") return a.value.startsWith("#") && a.value.length > 1;
      if (/(?:url\s*\(|@import|expression\s*\()/i.test(a.value)) return false;
      return true;
    });
  });
}
