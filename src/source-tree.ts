import { parse, type DefaultTreeAdapterMap } from "parse5";

export type SourceNode = DefaultTreeAdapterMap["node"];
export type SourceElement = DefaultTreeAdapterMap["element"];
type SourceDocument = DefaultTreeAdapterMap["document"];
export type SourceTree = {
  root: SourceDocument;
  elementsByStart: ReadonlyMap<number, SourceElement>;
  duplicateAttributeOffsets: readonly number[];
};

// One immutable read snapshot only. Callers must never decorate or serialize this tree.
let cachedSource: string | undefined;
let cachedTree: SourceTree | undefined;

export function readSourceTree(source: string): SourceTree {
  if (source === cachedSource && cachedTree) return cachedTree;
  const duplicateAttributeOffsets: number[] = [];
  const root = parse(source, {
    sourceCodeLocationInfo: true,
    onParseError: error => {
      if (error.code === "duplicate-attribute") duplicateAttributeOffsets.push(error.startOffset);
    },
  });
  const elementsByStart = new Map<number, SourceElement>();
  const visit = (node: SourceNode) => {
    if ("tagName" in node && node.sourceCodeLocation?.startTag)
      elementsByStart.set(node.sourceCodeLocation.startOffset, node);
    if ("childNodes" in node) node.childNodes.forEach(visit);
  };
  visit(root);
  cachedSource = source;
  cachedTree = { root, elementsByStart, duplicateAttributeOffsets };
  return cachedTree;
}
