import { parse, type DefaultTreeAdapterMap } from "parse5";
import { validateLocalImage, type LocalImage } from "./image-import";
import { MAX_DOCUMENT_BYTES } from "./slide-insert";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
export type ResourceIssue = {
  id: string;
  kind: "图片" | "字体" | "样式" | "CSS 资源";
  label: string;
  reason: string;
  hint: string;
  imageOffset?: number;
};
const inert = new Set(["script", "template", "noscript", "svg", "iframe", "object"]);
const attr = (node: Element, name: string) => node.attrs.find(a => a.name === name)?.value;
const bitmap = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/i;
const cssUnescape = (value: string) => value.replace(/\\([\da-f]{1,6})\s?|\\([^\r\n])/gi, (_, hex: string, literal: string) =>
  hex ? String.fromCodePoint(Math.min(parseInt(hex, 16) || 0xfffd, 0x10ffff)) : literal);

// Small lexical scanner, not a CSS validator. Skip comments/ordinary strings;
// inspect common url(...) and quoted @import without fetching any resource.
export function cssReferences(css: string): { url: string; font: boolean; stylesheet: boolean }[] {
  const refs: { url: string; font: boolean; stylesheet: boolean }[] = [];
  let i = 0, header = "";
  const fonts: boolean[] = [];
  const quoted = () => {
    const quote = css[i++]!;
    let value = "";
    while (i < css.length) {
      const char = css[i++]!;
      if (char === quote) break;
      value += char;
      if (char === "\\" && i < css.length) value += css[i++];
    }
    return cssUnescape(value);
  };
  while (i < css.length) {
    if (css.startsWith("/*", i)) {
      const end = css.indexOf("*/", i + 2);
      i = end < 0 ? css.length : end + 2;
      continue;
    }
    const char = css[i]!;
    if (char === "'" || char === '"') {
      const url = quoted();
      if (/^\s*@import\s*$/i.test(header)) refs.push({ url, font: false, stylesheet: true });
      header += " string ";
      continue;
    }
    if (/^url\s*\(/i.test(css.slice(i, i + 12)) && (i === 0 || !/[\w-]/.test(css[i - 1]!))) {
      i += /^url\s*\(/i.exec(css.slice(i))![0].length;
      while (/\s/.test(css[i] ?? "") && i < css.length) i++;
      let url = "";
      if (css[i] === "'" || css[i] === '"') url = quoted();
      else {
        while (i < css.length && css[i] !== ")") {
          const c = css[i++]!;
          url += c;
          if (c === "\\" && i < css.length) url += css[i++];
        }
        url = cssUnescape(url.trim());
      }
      while (i < css.length && css[i] !== ")") i++;
      if (css[i] === ")") i++;
      refs.push({ url, font: fonts.at(-1) ?? false, stylesheet: /^\s*@import\b/i.test(header) });
      header += " url ";
      continue;
    }
    if (char === "{") { fonts.push(/@font-face\s*$/i.test(header) || (fonts.at(-1) ?? false)); header = ""; }
    else if (char === "}") { fonts.pop(); header = ""; }
    else if (char === ";") header = "";
    else header += char;
    i++;
  }
  return refs;
}

function limitation(url: string, kind: ResourceIssue["kind"]): string | null {
  if (!url.trim()) return "未提供资源地址";
  if (kind === "图片" && bitmap.test(url)) return null;
  if (kind === "CSS 资源" && (bitmap.test(url) || url.startsWith("#"))) return null;
  if (kind === "字体" && /^data:/i.test(url)) return null;
  if (kind === "CSS 资源" && /^data:/i.test(url)) return "内嵌 CSS 资源未验证";
  if (/^(?:https?:)?\/\//i.test(url)) return "预览不加载外部资源";
  if (/^(?:data:|blob:|[a-z][\w+.-]*:|#)/i.test(url)) return "预览不支持此引用方式";
  return "本地路径未随 HTML 导入";
}

export function inspectResources(source: string): ResourceIssue[] {
  const issues: ResourceIssue[] = [];
  const add = (url: string, kind: ResourceIssue["kind"], label: string, extra: Partial<ResourceIssue> = {}) => {
    const reason = limitation(url, kind);
    if (!reason) return;
    const safeLabel = /^data:/i.test(label) ? "内嵌资源" : label;
    issues.push({ id: `resource-${issues.length}`, kind, label: safeLabel.slice(0, 180), reason,
      hint: kind === "字体" ? "暂用回退字体；可识别的字体声明可在下方替换。" : kind === "样式" ? "请从原文件将样式内联后重新导入。" : "保留原引用；导出时仍需原资源。", ...extra });
  };
  const css = (value: string) => {
    for (const ref of cssReferences(value)) {
      const kind = ref.stylesheet ? "样式" : ref.font ? "字体" : "CSS 资源";
      add(ref.url, kind, ref.url || "空 CSS 引用");
    }
  };
  const walk = (node: Node, inPicture = false) => {
    if ("tagName" in node) {
      if (inert.has(node.tagName)) return;
      inPicture ||= node.tagName === "picture";
      if (node.tagName === "img") {
        const offset = node.sourceCodeLocation?.startOffset;
        const url = attr(node, "src") ?? "";
        const label = attr(node, "alt") || url || "未命名图片";
        const srcset = attr(node, "srcset");
        const extra = { ...(!inPicture && offset !== undefined ? { imageOffset: offset } : {}),
          hint: inPicture ? "picture 响应式图片暂不替换。" : srcset ? "替换会移除本图片的响应式候选，保留尺寸和样式。" : "选择本机图片替换，保留尺寸和样式。" };
        if (srcset && limitation(url, "图片") === null) {
          issues.push({ id: `resource-${issues.length}`, kind: "图片", label: /^data:/i.test(label) ? "内嵌图片" : label.slice(0, 180), reason: "响应式候选未验证", ...extra });
        } else add(url, "图片", label, extra);
      }
      if (node.tagName === "source" && inPicture && attr(node, "srcset"))
        issues.push({ id: `resource-${issues.length}`, kind: "图片", label: "picture 响应式候选", reason: "响应式候选未验证", hint: "请在原文件中处理；暂不替换 picture。" });
      if (node.tagName === "link" && /(?:^|\s)stylesheet(?:\s|$)/i.test(attr(node, "rel") ?? ""))
        add(attr(node, "href") ?? "", "样式", attr(node, "href") || "未命名样式表");
      const style = attr(node, "style");
      if (style) css(style);
      if (node.tagName === "style" && "childNodes" in node)
        css(node.childNodes.map(n => "value" in n ? n.value : "").join(""));
    }
    if ("childNodes" in node) node.childNodes.forEach(n => walk(n, inPicture));
  };
  walk(parse(source, { sourceCodeLocationInfo: true }));
  return issues;
}

/** Replace only a currently diagnosed standalone IMG source, never rewrite the tree. */
export function replaceResourceImage(source: string, offset: number, image: LocalImage): string {
  validateLocalImage(image);
  if (!inspectResources(source).some(i => i.imageOffset === offset)) throw new Error("图片已变化，请重新选择。");
  let target: Element | undefined;
  const walk = (node: Node) => {
    if ("tagName" in node && node.tagName === "img" && node.sourceCodeLocation?.startOffset === offset) target = node;
    if ("childNodes" in node) node.childNodes.forEach(walk);
  };
  walk(parse(source, { sourceCodeLocationInfo: true }));
  const loc = target?.sourceCodeLocation;
  if (!target || !loc?.startTag) throw new Error("无法定位图片。");
  const tag = source.slice(loc.startTag.startOffset, loc.startTag.endOffset);
  // parse5 drops duplicate attributes. Reject instead of leaving a second src behind.
  const errors: { code: string }[] = [];
  parse(tag, { onParseError: error => errors.push(error) });
  if (errors.some(e => e.code === "duplicate-attribute")) throw new Error("图片属性重复，请先在原文件中修正。");
  const patches = ["src", "srcset"].flatMap(name => {
    const span = loc.attrs?.[name];
    return span ? [{ start: span.startOffset, end: span.endOffset, value: "" }] : [];
  });
  // Insert immediately after IMG, preserving attributes, quotes and self-closing syntax.
  const insert = loc.startTag.startOffset + /^<img\b/i.exec(tag)![0].length;
  patches.push({ start: insert, end: insert, value: ` src="${image.dataUrl}"` });
  let next = source;
  for (const patch of patches.sort((a, b) => b.start - a.start)) next = next.slice(0, patch.start) + patch.value + next.slice(patch.end);
  if (new TextEncoder().encode(next).byteLength > MAX_DOCUMENT_BYTES) throw new Error("替换后 HTML 超过 5 MiB，请选择更小的图片。");
  return next;
}
