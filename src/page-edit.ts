import { parse, type DefaultTreeAdapterMap } from "parse5";
import { inspectSlides } from "./slides";
import { MAX_DOCUMENT_BYTES } from "./slide-insert";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
export type PageAction = "duplicate" | "remove" | "up" | "down";
export type PageTarget = { start: number; raw: string };
export type PageCapabilities = {
  duplicate: boolean;
  remove: boolean;
  moveUp: boolean;
  moveDown: boolean;
  reason?: string | undefined;
  warning?: string;
};
const isElement = (node: Node): node is Element => "tagName" in node;
const bytes = (source: string) => new TextEncoder().encode(source).length;
const voidTags = new Set("br img hr wbr".split(" "));
const staticTags = new Set(
  "div section article main header footer aside nav h1 h2 h3 h4 h5 h6 p span a em strong b i u s small sub sup code pre mark blockquote figure figcaption ul ol li dl dt dd table thead tbody tfoot tr th td caption colgroup col br img hr wbr".split(
    " ",
  ),
);
const referenceAttrs = new Set(
  "id name for form headers usemap aria-labelledby aria-describedby aria-controls aria-owns aria-flowto aria-activedescendant".split(
    " ",
  ),
);
const warning =
  "页序已改变时，原导航脚本、编号样式和跨页引用不会自动调整。导出后请核对。";
const unsupported = () =>
  new Error("此页含局部样式、脚本或复杂结构，暂不支持页面操作。");

function locate(source: string, pageId: string, expected?: PageTarget) {
  if (bytes(source) > MAX_DOCUMENT_BYTES) throw new Error("HTML 超过 5 MiB。");
  const pages = inspectSlides(source);
  const index = pages.findIndex((page) => page.id === pageId);
  if (index < 0) throw new Error("页面已变化，请重新选择。");
  const parseErrors: number[] = [];
  const tree = parse(source, {
    sourceCodeLocationInfo: true,
    onParseError(error) {
      if (error.code !== "missing-doctype") parseErrors.push(error.startOffset);
    },
  });
  const nodes = new Map<number, Element>();
  function visit(node: Node) {
    if (isElement(node) && node.sourceCodeLocation?.startTag)
      nodes.set(node.sourceCodeLocation.startOffset, node);
    if ("childNodes" in node) node.childNodes.forEach(visit);
  }
  visit(tree);
  const ranges = pages.map((page) => {
    const node = nodes.get(page.start);
    if (!node?.sourceCodeLocation?.endTag) throw unsupported();
    const loc = node.sourceCodeLocation;
    return {
      node,
      start: loc.startOffset,
      end: loc.endOffset,
      raw: source.slice(loc.startOffset, loc.endOffset),
    };
  });
  const target = ranges[index]!;
  if (
    expected &&
    (target.start !== expected.start || target.raw !== expected.raw)
  )
    throw new Error("页面已变化，请重新选择。");
  const descendants: Element[] = [];
  function collect(node: Node) {
    if (isElement(node)) descendants.push(node);
    if ("childNodes" in node) node.childNodes.forEach(collect);
  }
  collect(target.node);
  function clean(range: typeof target) {
    let valid = true;
    function check(node: Node) {
      if (isElement(node)) {
        const loc = node.sourceCodeLocation;
        if (
          node.namespaceURI !== "http://www.w3.org/1999/xhtml" ||
          !staticTags.has(node.tagName) ||
          !loc?.startTag ||
          (!voidTags.has(node.tagName) &&
            node.tagName !== "col" &&
            !loc.endTag) ||
          loc.startOffset < range.start ||
          loc.endOffset > range.end ||
          node.attrs.some(
            (attr) => /^on/i.test(attr.name) || attr.name === "contenteditable",
          )
        )
          valid = false;
      }
      if ("childNodes" in node) node.childNodes.forEach(check);
    }
    check(range.node);
    return (
      valid &&
      !parseErrors.some((offset) => offset >= range.start && offset < range.end)
    );
  }
  const independent = descendants.every((node) =>
    node.attrs.every(
      (attr) =>
        !referenceAttrs.has(attr.name) &&
        !(attr.name === "data-slide" && attr.value.trim()) &&
        !(attr.name === "href" && attr.value.includes("#")) &&
        !(
          attr.name === "style" &&
          (/url\s*\([^)]*#/i.test(attr.value) || attr.value.includes("\\"))
        ) &&
        !(
          attr.name.startsWith("data-") &&
          /(?:id|index|target|ref|page|slide)(?:-|$)/i.test(attr.name) &&
          attr.value.trim()
        ),
    ),
  );
  return {
    pages,
    index,
    target,
    ranges,
    clean,
    independent,
    size: bytes(source),
  };
}

export function getPageTarget(source: string, pageId: string): PageTarget {
  const { target } = locate(source, pageId);
  return { start: target.start, raw: target.raw };
}

function capabilities(context: ReturnType<typeof locate>): PageCapabilities {
  const { target, pages, index, ranges, clean, independent, size } = context;
  if (!clean(target))
    return {
      duplicate: false,
      remove: false,
      moveUp: false,
      moveDown: false,
      reason: unsupported().message,
    };
  const fits = size + bytes(target.raw) <= MAX_DOCUMENT_BYTES;
  return {
    duplicate: independent && pages.length < 100 && fits,
    remove: pages.length > 1,
    moveUp: index > 0 && clean(ranges[index - 1]!),
    moveDown: index < pages.length - 1 && clean(ranges[index + 1]!),
    reason: !independent
      ? "此页含标识或引用，不能安全复制。"
      : pages.length >= 100
        ? "最多支持 100 页。"
        : !fits
          ? "复制后 HTML 将超过 5 MiB。"
          : undefined,
    warning,
  };
}

export function pageCapabilities(
  source: string,
  pageId: string,
): PageCapabilities {
  try {
    return capabilities(locate(source, pageId));
  } catch (error) {
    return {
      duplicate: false,
      remove: false,
      moveUp: false,
      moveDown: false,
      reason: error instanceof Error ? error.message : "无法操作此页。",
    };
  }
}

export function editPage(
  source: string,
  pageId: string,
  action: PageAction,
  expected?: PageTarget,
): { source: string; pageId: string } {
  const context = locate(source, pageId, expected);
  const cap = capabilities(context);
  const { target, index, ranges } = context;
  const key =
    action === "up" ? "moveUp" : action === "down" ? "moveDown" : action;
  if (!["duplicate", "remove", "up", "down"].includes(action) || !cap[key]) {
    if (action === "remove" && ranges.length === 1)
      throw new Error("至少保留一页。");
    throw new Error(cap.reason || "此页暂不能进行此操作。");
  }
  let next: string;
  let nextIndex = index;
  if (action === "duplicate") {
    // Insert only the copied node. Original whitespace/comments retain their bytes.
    next = source.slice(0, target.end) + target.raw + source.slice(target.end);
    nextIndex++;
  } else if (action === "remove") {
    next = source.slice(0, target.start) + source.slice(target.end);
    nextIndex = Math.min(index, ranges.length - 2);
  } else {
    const otherIndex = index + (action === "up" ? -1 : 1);
    const first = ranges[Math.min(index, otherIndex)]!;
    const last = ranges[Math.max(index, otherIndex)]!;
    // Swap node spans, not their gap: comments and global CSS/scripts stay put.
    next =
      source.slice(0, first.start) +
      last.raw +
      source.slice(first.end, last.start) +
      first.raw +
      source.slice(last.end);
    nextIndex = otherIndex;
  }
  if (bytes(next) > MAX_DOCUMENT_BYTES) throw new Error("HTML 超过 5 MiB。");
  const resultPages = inspectSlides(next);
  const expectedCount =
    ranges.length + (action === "duplicate" ? 1 : action === "remove" ? -1 : 0);
  if (resultPages.length !== expectedCount || !resultPages[nextIndex])
    throw unsupported();
  return { source: next, pageId: resultPages[nextIndex]!.id };
}
