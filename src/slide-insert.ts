import { parse, type DefaultTreeAdapterMap } from "parse5";
import { inspectSlides } from "./slides";
import { validateLocalImage, type LocalImage } from "./image-import";
type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
import { MAX_DOCUMENT_BYTES } from "./document-limits";
export { MAX_DOCUMENT_BYTES } from "./document-limits";
const isElement = (node: Node): node is Element => "tagName" in node;
const attr = (node: Element, name: string) =>
  node.attrs.find((a) => a.name === name)?.value ?? "";
const escape = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const unsupported = () => new Error("此页布局较复杂，暂不支持插入。");

// Deliberately a small supported CSS subset, not a guessed full cascade.
function simpleMatch(selector: string, node: Element): boolean | null {
  if (/::(?:before|after|first-letter|first-line)\b/.test(selector))
    return false;
  const parts = selector
    .trim()
    .split(/\s*(>)\s*|\s+/)
    .filter(Boolean);
  const compound = (part: string, el: Element): boolean | null => {
    const prefix =
      part.match(/^(?:\*|[a-z][\w-]*)?(?:[.#][\w-]+)*/i)?.[0] ?? "";
    const tag = prefix.match(/^(\*|[a-z][\w-]*)/i)?.[0];
    if (tag && tag !== "*" && tag.toLowerCase() !== el.tagName) return false;
    const tokens = [...prefix.matchAll(/([.#])([\w-]+)/g)];
    if (
      tokens.some(([, prefix, name]) =>
        prefix === "#"
          ? attr(el, "id") !== name
          : !attr(el, "class").split(/\s+/).includes(name!),
      )
    )
      return false;
    if (!prefix || prefix !== part) return null;
    return true;
  };
  let index = parts.length - 1,
    current: Element | undefined = node;
  const first = compound(parts[index--] ?? "", node);
  if (first !== true) return first;
  while (index >= 0) {
    const direct = parts[index] === ">";
    if (direct) index--;
    const part = parts[index--];
    if (!part) return null;
    current =
      current?.parentNode && isElement(current.parentNode)
        ? current.parentNode
        : undefined;
    let found = false;
    while (current) {
      const match = compound(part, current);
      if (match === null) return null;
      if (match) {
        found = true;
        break;
      }
      if (direct) break;
      current =
        current.parentNode && isElement(current.parentNode)
          ? current.parentNode
          : undefined;
    }
    if (!found) return false;
  }
  return true;
}

function rules(css: string): { selector: string; body: string }[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const result: { selector: string; body: string }[] = [];
  let start = 0,
    open = -1,
    depth = 0,
    quote = "";
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i]!;
    if (quote) {
      if (char === "\\") i++;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === ";" && !depth) start = i + 1;
    if (char === "{") {
      if (!depth) open = i;
      depth++;
    } else if (char === "}" && depth && !--depth) {
      result.push({
        selector: clean.slice(start, open).trim(),
        body: clean.slice(open + 1, i),
      });
      start = i + 1;
    }
  }
  if (depth || quote) throw unsupported();
  return result;
}

function locate(source: string, pageId: string) {
  const pages = inspectSlides(source),
    page = pages.find((p) => p.id === pageId);
  if (!page) throw new Error("请先选择演示页。");
  if (page.objects.length >= 400)
    throw new Error("本页对象过多，请换一页插入。");
  const tree = parse(source, { sourceCodeLocationInfo: true });
  let target: Element | undefined;
  const styles: string[] = [];
  function visit(node: Node) {
    if (isElement(node)) {
      if (node.sourceCodeLocation?.startOffset === page!.start) target = node;
      if (node.tagName === "style")
        styles.push(
          node.childNodes.map((n) => ("value" in n ? n.value : "")).join(""),
        );
    }
    if ("childNodes" in node) node.childNodes.forEach(visit);
  }
  visit(tree);
  if (
    !target ||
    !["div", "section", "article", "main"].includes(target.tagName) ||
    target.namespaceURI !== "http://www.w3.org/1999/xhtml" ||
    !target.sourceCodeLocation?.endTag
  )
    throw unsupported();
  const values: string[] = [];
  const readDeclarations = (body: string) => {
    if (/(?:^|[;{])\s*[\w-]*\\[^:;{}]*:/.test(body)) throw unsupported();
    if (/(?:^|[;{])\s*all\s*:/i.test(body)) throw unsupported();
    for (const match of body.matchAll(
      /(?:^|[;{])\s*position\s*:\s*([^;}]+)/gi,
    )) {
      const value = match[1]!
        .replace(/\s*!important\s*$/i, "")
        .trim()
        .toLowerCase();
      if (
        !["relative", "absolute", "fixed", "sticky", "static"].includes(value)
      )
        throw unsupported();
      values.push(value);
    }
  };
  for (const css of styles) {
    for (const rule of rules(css)) {
      if (/(?:^|[;{])\s*[\w-]*\\[^:;{}]*:/.test(rule.body)) throw unsupported();
      if (!/(?:^|[;{])\s*(?:position|all)\s*:/i.test(rule.body)) continue;
      if (rule.selector.startsWith("@") || rule.body.includes("{"))
        throw unsupported();
      const matches = rule.selector
        .split(",")
        .map((s) => simpleMatch(s, target!));
      if (matches.includes(null)) throw unsupported();
      if (matches.includes(true)) readDeclarations(rule.body);
    }
  }
  readDeclarations(attr(target, "style"));
  // A new containing block could move existing absolute children or activate
  // dormant top/left offsets. Never add or change page positioning.
  if (!values.length || values.includes("static")) throw unsupported();
  return { target };
}

export function slideInsertionAvailability(
  source: string,
  pageId: string,
): { allowed: boolean; reason?: string } {
  try {
    locate(source, pageId);
    return { allowed: true };
  } catch (error) {
    return {
      allowed: false,
      reason: error instanceof Error ? error.message : "此页暂不支持插入。",
    };
  }
}

function insert(source: string, pageId: string, html: string) {
  // Source is an exact splice, so its UTF-8 size is the sum of both inputs.
  // Check before parsing the potentially large image payload.
  const encoder = new TextEncoder();
  if (
    encoder.encode(source).byteLength + encoder.encode(html).byteLength >
    MAX_DOCUMENT_BYTES
  )
    throw new Error("加入后文件超过 5 MB，请缩小图片或减少内容。");
  const { target } = locate(source, pageId),
    loc = target.sourceCodeLocation!;
  const next =
    source.slice(0, loc.endTag!.startOffset) +
    html +
    source.slice(loc.endTag!.startOffset);
  const page = inspectSlides(next).find((p) => p.id === pageId);
  const object = page?.objects.at(-1);
  if (
    !object ||
    object.depth !== 0 ||
    !object.raw.includes('data-docs-inserted="true"')
  )
    throw unsupported();
  return { source: next, objectId: object.id };
}

const commonStyle =
  "all:initial!important;box-sizing:border-box!important;display:block!important;position:absolute!important;left:64px!important;top:64px!important;margin:0!important;padding:0!important;z-index:10!important;transform:none!important;translate:0px 0px!important;scale:1!important;transform-origin:center center!important;";

export function insertSlideText(
  source: string,
  pageId: string,
  text = "双击编辑文字",
) {
  if (typeof text !== "string" || !text.trim() || text.length > 10000)
    throw new Error("请输入 1 至 10000 字文字。");
  return insert(
    source,
    pageId,
    `\n<p data-docs-inserted="true" style="${commonStyle}width:360px!important;min-height:48px!important;color:inherit!important;font:32px/1.4 sans-serif!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important;">${escape(text)}</p>\n`,
  );
}

export function insertSlideImage(
  source: string,
  pageId: string,
  image: LocalImage,
) {
  validateLocalImage(image);
  const ratio = Math.min(1, 480 / image.width, 360 / image.height);
  const width = Math.round(image.width * ratio * 100) / 100,
    height = Math.round(image.height * ratio * 100) / 100;
  return insert(
    source,
    pageId,
    `\n<img data-docs-inserted="true" src="${image.dataUrl}" alt="${escape(image.alt)}" width="${image.width}" height="${image.height}" style="${commonStyle}width:${width}px!important;height:${height}px!important;object-fit:contain!important;" />\n`,
  );
}
