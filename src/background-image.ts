import { parse, type DefaultTreeAdapterMap } from "parse5";
import { inspectSlides, type SlideObject } from "./slides";
import { validateLocalImage, type LocalImage } from "./image-import";
import { MAX_DOCUMENT_BYTES } from "./slide-insert";

// Computed CSS serializes URLs with quotes. No layers, image-set, gradients or
// quoted-string escapes are accepted here; the replacement is a validated bitmap.
export function isSingleBackground(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 8_000_000 &&
    /^url\(\s*(?:"[^"\\\r\n]+"|'[^'\\\r\n]+'|[^'"(),\s]+)\s*\)$/i.test(value)
  );
}
function appendable(style: string) {
  let quote = "",
    depth = 0;
  for (let i = 0; i < style.length; i++) {
    const c = style[i]!;
    if (c === "\\") {
      if (++i === style.length) return false;
      continue;
    }
    if (quote) {
      if (c === quote) quote = "";
      continue;
    }
    if (c === "/" && style[i + 1] === "*") {
      const end = style.indexOf("*/", i + 2);
      if (end < 0) return false;
      i = end + 1;
      continue;
    }
    if (c === "'" || c === '"') quote = c;
    else if (c === "(") depth++;
    else if (c === ")" && --depth < 0) return false;
    else if (c === "{" || c === "}") return false;
  }
  return !quote && depth === 0;
}
export function patchBackgroundImage(
  source: string,
  target: SlideObject,
  image: LocalImage,
  expectedBackground: string,
): string {
  if (!isSingleBackground(expectedBackground))
    throw new Error("仅支持单张背景图。");
  validateLocalImage(image);
  const current = inspectSlides(source)
    .flatMap((p) => p.objects)
    .find((o) => o.id === target.id);
  if (
    !current ||
    current.start !== target.start ||
    current.raw !== target.raw ||
    current.title !== target.title
  )
    throw new Error("对象已变化，请重新选择背景。");
  type Node = DefaultTreeAdapterMap["node"];
  type Element = DefaultTreeAdapterMap["element"];
  let found: Element | undefined;
  let duplicate = false;
  const tree = parse(source, {
    sourceCodeLocationInfo: true,
    onParseError: (e) => {
      if (
        e.code === "duplicate-attribute" &&
        e.startOffset >= current.start &&
        e.startOffset < current.end
      )
        duplicate = true;
    },
  });
  const visit = (n: Node) => {
    if (
      "tagName" in n &&
      n.sourceCodeLocation?.startTag?.startOffset === current.start
    )
      found = n;
    if ("childNodes" in n) n.childNodes.forEach(visit);
  };
  visit(tree);
  if (
    !found ||
    duplicate ||
    found.namespaceURI !== "http://www.w3.org/1999/xhtml" ||
    found.attrs.some((a) => /^on/i.test(a.name))
  )
    throw new Error("此背景结构暂不支持修改。");
  if (!appendable(current.style))
    throw new Error("背景样式不完整，请先修复原样式。");
  const clean = current.style.replace(
    /(?:^|;)--docs-background-start:1;background-image:url\("data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+"\)!important;--docs-background-end:1;/g,
    (_m, offset: number) => (offset ? ";" : ""),
  );
  const placement =
    clean.match(
      /(?:translate:-?[\d.]+px -?[\d.]+px!important;scale:[\d.]+!important;)+$/,
    )?.[0] ?? "";
  const base = placement ? clean.slice(0, -placement.length) : clean;
  const style = `${base}${base.trim() && !base.trim().endsWith(";") ? ";" : ""}--docs-background-start:1;background-image:url("${image.dataUrl}")!important;--docs-background-end:1;${placement}`;
  const escaped = style
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const attr = found.sourceCodeLocation!.attrs?.style;
  const end =
    current.end - (source.slice(current.end - 2, current.end) === "/>" ? 2 : 1);
  const start = attr?.startOffset ?? end,
    finish = attr?.endOffset ?? end;
  const next =
    source.slice(0, start) +
    (attr ? "" : " ") +
    `style="${escaped}"` +
    source.slice(finish);
  if (new TextEncoder().encode(next).byteLength > MAX_DOCUMENT_BYTES)
    throw new Error("修改后文件超过5 MB，请减少图片大小。");
  return next;
}
