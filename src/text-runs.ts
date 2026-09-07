import { parse, type DefaultTreeAdapterMap } from "parse5";
import type { SlideObject } from "./slides";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
export type TextRun = {
  start: number;
  end: number;
  text: string;
  raw: string;
  tag: string;
  line: number;
};
export type TextRuns = {
  start: number;
  end: number;
  raw: string;
  runs: TextRun[];
  reason: string;
};
const inline = new Set(
  "span strong em b i u s small sub sup mark code a br".split(" "),
);
const roots = new Set("h1 h2 h3 h4 h5 h6 p div blockquote li span".split(" "));
const isElement = (node: Node): node is Element => "tagName" in node;

// Only inline text is exposed. Source offsets, not DOM serialization, preserve layout.
export function inspectTextRuns(
  source: string,
  object: Pick<SlideObject, "start" | "raw">,
): TextRuns {
  const result: TextRuns = {
    start: object.start,
    end: object.start,
    raw: "",
    runs: [],
    reason: "请选择标题、段落或更具体的文字对象。",
  };
  let selected: Element | undefined;
  const find = (node: Node) => {
    if (
      isElement(node) &&
      node.sourceCodeLocation?.startTag?.startOffset === object.start
    )
      selected = node;
    if ("childNodes" in node) node.childNodes.forEach(find);
  };
  find(parse(source, { sourceCodeLocationInfo: true }));
  const loc = selected?.sourceCodeLocation;
  if (
    !selected ||
    !loc?.startTag ||
    !loc.endTag ||
    !roots.has(selected.tagName) ||
    source.slice(loc.startTag.startOffset, loc.startTag.endOffset) !==
      object.raw
  )
    return result;
  result.end = loc.endOffset;
  result.raw = source.slice(result.start, result.end);
  let valid = true,
    line = 1;
  const visit = (node: Element) => {
    if (node.namespaceURI !== "http://www.w3.org/1999/xhtml") {
      valid = false;
      return;
    }
    if (node.tagName === "br") {
      line++;
      return;
    }
    for (const child of node.childNodes) {
      if (child.nodeName === "#comment") continue;
      if (isElement(child)) {
        if (!inline.has(child.tagName)) {
          valid = false;
          return;
        }
        visit(child);
      } else if (
        child.nodeName === "#text" &&
        "value" in child &&
        child.sourceCodeLocation
      ) {
        const { startOffset: start, endOffset: end } = child.sourceCodeLocation;
        if (child.value.trim())
          result.runs.push({
            start,
            end,
            raw: source.slice(start, end),
            text: child.value,
            tag: node.tagName,
            line,
          });
      } else {
        valid = false;
        return;
      }
    }
    // An emptied styled leaf remains refillable without inserting or deleting tags.
    const at = node.sourceCodeLocation;
    if (!node.childNodes.length && at?.startTag && at.endTag)
      result.runs.push({
        start: at.startTag.endOffset,
        end: at.endTag.startOffset,
        raw: "",
        text: "",
        tag: node.tagName,
        line,
      });
  };
  visit(selected);
  if (
    !valid ||
    !result.runs.length ||
    result.runs.length > 40 ||
    result.runs.some(
      (r) =>
        r.start < loc.startTag!.endOffset || r.end > loc.endTag!.startOffset,
    )
  ) {
    result.runs = [];
    return result;
  }
  result.reason = "";
  return result;
}

export function patchTextRuns(
  source: string,
  target: TextRuns,
  values: string[],
): string {
  if (
    !target.runs.length ||
    target.reason ||
    source.slice(target.start, target.end) !== target.raw
  )
    throw new Error("文字已经变化，请重新选择对象。");
  if (
    values.length !== target.runs.length ||
    values.some(
      (v) => typeof v !== "string" || v.length > 100000 || /\u0000/.test(v),
    )
  )
    throw new Error("文字无效或过长。");
  let next = source;
  // Validate every span before the atomic patch; unchanged entities remain byte-identical.
  for (let i = 0; i < target.runs.length; i++) {
    const run = target.runs[i]!;
    if (
      run.start < target.start ||
      run.end > target.end ||
      run.start > run.end ||
      (i > 0 && run.start < target.runs[i - 1]!.end) ||
      source.slice(run.start, run.end) !== run.raw
    )
      throw new Error("文字锚点无效，请重新选择。");
  }
  for (let i = target.runs.length - 1; i >= 0; i--) {
    const run = target.runs[i]!,
      value = values[i]!;
    if (value === run.text) continue;
    const escaped = value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\r/g, "&#13;");
    next = next.slice(0, run.start) + escaped + next.slice(run.end);
  }
  return next;
}
