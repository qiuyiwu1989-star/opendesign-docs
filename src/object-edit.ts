import type { DefaultTreeAdapterMap } from "parse5";
import { staticFigure } from "./static-figure";
import { inspectSlides, type SlideObject, type SlidePage } from "./slides";
import { MAX_DOCUMENT_BYTES } from "./slide-insert";
import { validateLocalImage, type LocalImage } from "./image-import";
import { readSourceTree } from "./source-tree";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
type Edit = { start: number; end: number; value: string };
export type ObjectCatalog = (source: string) => SlidePage[];
export type ObjectTextStyle = {
  fontSize?: number;
  color?: string;
  bold?: boolean;
  align?: "left" | "center" | "right";
};
const isElement = (n: Node): n is Element => "tagName" in n;
const inline = new Set(
  "span em strong b i u s small sub sup code mark br a".split(" "),
);
const safe = new Set(
  "h1 h2 h3 h4 p div section article blockquote figure ul ol li img".split(" "),
);
const encode = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
const unsupported = () => new Error("此对象含复杂结构或引用，暂不支持此操作。");

// Appended declarations must not become part of an unterminated URL, comment,
// quoted string or escape in imported CSS. Leave such source untouched.
function appendableStyle(value: string) {
  let quote = "",
    depth = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value[i]!;
    if (char === "\\") {
      if (i + 1 === value.length) return false;
      i++;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && value[i + 1] === "*") {
      const end = value.indexOf("*/", i + 2);
      if (end < 0) return false;
      i = end + 1;
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if (char === "(") depth++;
    else if (char === ")" && --depth < 0) return false;
    else if (char === "{" || char === "}") return false;
  }
  return !quote && !depth;
}

function locate(source: string, target: SlideObject, catalog: ObjectCatalog = inspectSlides) {
  const pages = catalog(source);
  const page = pages.find((p) => p.objects.some((o) => o.id === target.id));
  const current = page?.objects.find((o) => o.id === target.id);
  if (
    !current ||
    current.start !== target.start ||
    current.end !== target.end ||
    current.raw !== target.raw ||
    current.title !== target.title
  )
    throw new Error("对象已变化，请重新选择。");
  const tree = readSourceTree(source);
  const malformed = tree.duplicateAttributeOffsets;
  const node = tree.elementsByStart.get(current.start);
  if (!node?.sourceCodeLocation?.startTag) throw unsupported();
  const nodes: Element[] = [];
  function collect(n: Node) {
    if (isElement(n)) nodes.push(n);
    if ("childNodes" in n) n.childNodes.forEach(collect);
  }
  collect(node);
  const loc = node.sourceCodeLocation;
  const complete = node.tagName === "img" || !!loc.endTag;
  const clean =
    complete &&
    nodes.every((n) => {
      const l = n.sourceCodeLocation;
      return (
        n.namespaceURI === "http://www.w3.org/1999/xhtml" &&
        l?.startTag &&
        l.startOffset >= loc.startOffset &&
        l.endOffset <= loc.endOffset &&
        (n.tagName === "br" || n.tagName === "img" || !!l.endTag) &&
        !malformed.some(
          (offset) =>
            offset >= l.startOffset && offset <= l.startTag!.endOffset,
        ) &&
        !n.attrs.some(
          (a) =>
            /^on/i.test(a.name) ||
            a.name === "contenteditable" ||
            a.name === "data-slide",
        )
      );
    });
  const basic =
    clean && nodes.every((n) => safe.has(n.tagName) || inline.has(n.tagName));
  const independent =
    basic &&
    nodes.every(
      (n) =>
        !n.attrs.some(
          (a) =>
            [
              "id",
              "name",
              "href",
              "for",
              "form",
              "headers",
              "usemap",
              "aria-labelledby",
              "aria-describedby",
              "aria-controls",
              "aria-owns",
            ].includes(a.name) ||
            (/(?:url\s*\(|var\s*\()/i.test(a.value) && a.name === "style"),
        ),
    );
  const textStyle =
    basic &&
    node.tagName !== "img" &&
    nodes.every((n) =>
      appendableStyle(n.attrs.find((a) => a.name === "style")?.value ?? ""),
    ) &&
    nodes.slice(1).every((n) => inline.has(n.tagName)) &&
    nodes.some((n) => n.childNodes.some((c) => "value" in c && c.value.trim()));
  // A picture/source parent would override img.src. Do not silently dismantle it.
  const replaceImage =
    basic &&
    node.tagName === "img" &&
    !(
      node.parentNode &&
      isElement(node.parentNode) &&
      node.parentNode.tagName === "picture"
    );
  const chart = staticFigure(node, nodes, malformed);
  return { node, nodes, page: page!, independent, basic, textStyle, replaceImage, chart };
}

export function getObjectCapabilities(source: string, target: SlideObject, catalog?: ObjectCatalog) {
  try {
    const c = locate(source, target, catalog);
    return {
      duplicate: c.independent && c.page.objects.length + c.nodes.length <= 400,
      remove: c.independent || c.chart,
      textStyle: c.textStyle,
      replaceImage: c.replaceImage,
      reorder: c.basic || c.chart,
      ...(!c.independent && !c.chart ? { reason: "复杂结构或引用仅支持局部修改。" } : {}),
    };
  } catch (e) {
    return {
      duplicate: false,
      remove: false,
      textStyle: false,
      replaceImage: false,
      reorder: false,
      reason: e instanceof Error ? e.message : "请重新选择对象。",
    };
  }
}

function apply(source: string, edits: Edit[]) {
  let next = source;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    next = next.slice(0, edit.start) + edit.value + next.slice(edit.end);
  if (new TextEncoder().encode(next).byteLength > MAX_DOCUMENT_BYTES)
    throw new Error("修改后文件超过 5 MB，请减少内容。");
  return next;
}

function attribute(
  source: string,
  node: Element,
  name: string,
  value: string | null,
): Edit {
  const loc = node.sourceCodeLocation!;
  const old = loc.attrs?.[name];
  if (old)
    return {
      start: old.startOffset,
      end: old.endOffset,
      value: value === null ? "" : `${name}="${encode(value)}"`,
    };
  const end = loc.startTag!.endOffset;
  const offset = end - (source.slice(end - 2, end) === "/>" ? 2 : 1);
  return {
    start: offset,
    end: offset,
    value: value === null ? "" : ` ${name}="${encode(value)}"`,
  };
}

/** Exact sibling copy. Keep its layout rather than guessing a CSS containing block. */
export function duplicateObject(source: string, target: SlideObject, catalog: ObjectCatalog = inspectSlides) {
  const c = locate(source, target, catalog);
  if (!c.independent || c.page.objects.length + c.nodes.length > 400)
    throw unsupported();
  const loc = c.node.sourceCodeLocation!;
  const fragment = source.slice(loc.startOffset, loc.endOffset);
  const next = apply(source, [
    { start: loc.endOffset, end: loc.endOffset, value: fragment },
  ]);
  const added = catalog(next)
    .find((p) => p.id === c.page.id)
    ?.objects.find((o) => o.start === loc.endOffset);
  if (!added || added.tag !== target.tag) throw unsupported();
  return { source: next, objectId: added.id };
}

export function removeObject(source: string, target: SlideObject, catalog?: ObjectCatalog) {
  const c = locate(source, target, catalog);
  if (!c.independent && !c.chart) throw unsupported();
  const loc = c.node.sourceCodeLocation!;
  return apply(source, [
    { start: loc.startOffset, end: loc.endOffset, value: "" },
  ]);
}

const managed =
  /(?:^|;)--docs-text-style-start:1;((?:(?:font-size|font-weight|color|text-align):[^;]+;)+)--docs-text-style-end:1;/g;
function styleValue(old: string, values: Record<string, string>) {
  const previous: Record<string, string> = {};
  for (const match of old.matchAll(managed))
    for (const pair of match[1]!.split(";")) {
      const colon = pair.indexOf(":");
      if (colon > 0) previous[pair.slice(0, colon)] = pair.slice(colon + 1);
    }
  // Keep placement's coalescible suffix last, even when formatting and dragging
  // alternate. Otherwise each subsystem would hide the other's managed tail.
  const clean = old.replace(managed, (_match, _body, offset: number) =>
    offset ? ";" : "",
  );
  const placement =
    clean.match(
      /(?:translate:-?[\d.]+px -?[\d.]+px!important;scale:[\d.]+!important;)+$/,
    )?.[0] ?? "";
  const base = placement ? clean.slice(0, -placement.length) : clean;
  const merged = {
    ...previous,
    ...Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, `${v}!important`]),
    ),
  };
  return `${base}${base.trim() && !base.trim().endsWith(";") ? ";" : ""}--docs-text-style-start:1;${Object.keys(
    merged,
  )
    .sort()
    .map((key) => `${key}:${merged[key]};`)
    .join("")}--docs-text-style-end:1;${placement}`;
}

/** Object-level formatting intentionally applies to all nested inline text runs. */
export function patchObjectTextStyle(
  source: string,
  target: SlideObject,
  patch: ObjectTextStyle,
  catalog?: ObjectCatalog,
) {
  const values: Record<string, string> = {};
  if (
    !patch ||
    Object.keys(patch).some(
      (k) => !["fontSize", "color", "bold", "align"].includes(k),
    )
  )
    throw new Error("文字样式无效。");
  if (patch.fontSize !== undefined) {
    if (
      !Number.isFinite(patch.fontSize) ||
      patch.fontSize < 8 ||
      patch.fontSize > 200
    )
      throw new Error("字号范围为 8–200。");
    values["font-size"] = `${Math.round(patch.fontSize * 10) / 10}px`;
  }
  if (patch.color !== undefined) {
    if (!/^#(?:[a-f\d]{3}|[a-f\d]{6}|[a-f\d]{8})$/i.test(patch.color))
      throw new Error("请选择有效颜色。");
    values.color = patch.color.toLowerCase();
  }
  if (patch.bold !== undefined) {
    if (typeof patch.bold !== "boolean") throw new Error("文字样式无效。");
    values["font-weight"] = patch.bold ? "700" : "400";
  }
  if (patch.align !== undefined) {
    if (!["left", "center", "right"].includes(patch.align))
      throw new Error("对齐方式无效。");
    values["text-align"] = patch.align;
  }
  const c = locate(source, target, catalog);
  if (!c.textStyle) throw unsupported();
  if (!Object.keys(values).length) return source;
  return apply(
    source,
    c.nodes
      .filter((n) => n.tagName !== "br")
      .map((n) =>
        attribute(
          source,
          n,
          "style",
          styleValue(
            n.attrs.find((a) => a.name === "style")?.value ?? "",
            values,
          ),
        ),
      ),
  );
}

export function replaceObjectImage(
  source: string,
  target: SlideObject,
  image: LocalImage,
  renderedSize?: { width: number; height: number },
  catalog?: ObjectCatalog,
) {
  validateLocalImage(image);
  const c = locate(source, target, catalog);
  if (!c.replaceImage) throw unsupported();
  const edits = [attribute(source, c.node, "src", image.dataUrl)];
  const style = c.node.attrs.find((a) => a.name === "style")?.value ?? "";
  const explicit =
    appendableStyle(style) &&
    !/(?:^|;)\s*all\s*:/i.test(style) &&
    ["width", "height"].every((key) => {
      const declarations = [
        ...style.matchAll(
          new RegExp(`(?:^|;)\\s*${key}\\s*:\\s*([^;]+)`, "gi"),
        ),
      ];
      const important = declarations.filter((d) =>
        /!important\s*$/i.test(d[1]!),
      );
      return (
        !!important.length &&
        /^(?:[1-9]\d*(?:\.\d+)?|0\.\d*[1-9]\d*)px\s*!important$/i.test(
          important.at(-1)![1]!.trim(),
        )
      );
    });
  if (renderedSize || !explicit) {
    if (
      !renderedSize ||
      ![renderedSize.width, renderedSize.height].every(
        (n) => Number.isFinite(n) && n > 0 && n <= 10000,
      ) ||
      !appendableStyle(style)
    )
      throw new Error("图片尺寸尚未就绪，请等待预览后重试。");
    const clean = style.replace(
      /(?:^|;)--docs-image-size-start:1;width:[\d.]+px!important;height:[\d.]+px!important;--docs-image-size-end:1;/g,
      (_match, offset: number) => (offset ? ";" : ""),
    );
    const placement =
      clean.match(
        /(?:translate:-?[\d.]+px -?[\d.]+px!important;scale:[\d.]+!important;)+$/,
      )?.[0] ?? "";
    const base = placement ? clean.slice(0, -placement.length) : clean;
    const size = `--docs-image-size-start:1;width:${Math.round(renderedSize.width * 100) / 100}px!important;height:${Math.round(renderedSize.height * 100) / 100}px!important;--docs-image-size-end:1;`;
    edits.push(
      attribute(
        source,
        c.node,
        "style",
        `${base}${base.trim() && !base.trim().endsWith(";") ? ";" : ""}${size}${placement}`,
      ),
    );
  }
  // Keep the existing alt, intrinsic dimensions and CSS placement. A responsive
  // old source must not win over the newly selected local bitmap.
  for (const name of ["srcset", "sizes"])
    if (c.node.attrs.some((a) => a.name === name))
      edits.push(attribute(source, c.node, name, null));
  return apply(source, edits);
}
