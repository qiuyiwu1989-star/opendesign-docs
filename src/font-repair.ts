import { parse, type DefaultTreeAdapterMap } from "parse5";
import { requireDecodedFont, type LocalFont } from "./font-import";
import { MAX_DOCUMENT_BYTES } from "./slide-insert";

export type FontTarget = { id: string; family: string; weight: string; style: string; start: number; end: number; raw: string; embedded: boolean };
type Node = DefaultTreeAdapterMap["node"];

// Mask strings/comments without changing offsets. Braces and semicolons inside
// strings cannot create editable blocks. Escaped identifiers are not supported.
function maskCss(css: string): string | null {
  const out = css.split("");
  for (let i = 0; i < css.length; i++) {
    if (css.startsWith("/*", i)) {
      const end = css.indexOf("*/", i + 2);
      if (end < 0) return null;
      for (; i < end + 2; i++) out[i] = " ";
      i--;
    } else if (css[i] === "'" || css[i] === '"') {
      const quote = css[i]; out[i] = " ";
      let closed = false;
      for (i++; i < css.length; i++) {
        out[i] = " ";
        if (css[i] === "\\") { out[++i] = " "; continue; }
        if (css[i] === quote) { closed = true; break; }
      }
      if (!closed) return null;
    } else if (css[i] === "\\") return null;
  }
  return out.join("");
}

function inlineFaces(css: string, base: number): FontTarget[] {
  const masked = maskCss(css);
  if (!masked) return [];
  const targets: FontTarget[] = [];
  let depth = 0, ruleStart = 0, open = -1;
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === "{") {
      if (depth === 0) open = /^\s*@font-face\s*$/i.test(masked.slice(ruleStart, i)) ? i : -1;
      depth++;
    } else if (masked[i] === "}") {
      depth--;
      if (depth < 0) return [];
      if (depth === 0) {
        if (open >= 0) {
          const bodyMask = masked.slice(open + 1, i);
          // Nested declarations and unquoted function syntax are conservative exits.
          if (!/[{}]/.test(bodyMask)) {
            const descriptors = new Map<string, { value: string; start: number; end: number }>();
            let start = open + 1, parens = 0, valid = true;
            for (let j = start; j <= i; j++) {
              if (masked[j] === "(") parens++;
              if (masked[j] === ")") parens--;
              if (parens < 0) valid = false;
              if (j === i || (masked[j] === ";" && parens === 0)) {
                if (masked.slice(start, j).trim()) {
                  const match = /^\s*([a-z-]+)\s*:/i.exec(masked.slice(start, j));
                  if (!match) { valid = false; break; }
                  const key = match[1]!.toLowerCase(), valueStart = start + match[0].length;
                  if (descriptors.has(key)) { valid = false; break; }
                  descriptors.set(key, { value: css.slice(valueStart, j).trim(), start: base + valueStart, end: base + j });
                }
                start = j + 1;
              }
            }
            const family = descriptors.get("font-family")?.value;
            const src = descriptors.get("src");
            if (valid && parens === 0 && family && src && /^(?:"[^"\\\n<>]+"|'[^'\\\n<>]+'|[a-zA-Z][\w -]*)$/.test(family) && src.value && !/!important/i.test(src.value)) {
              const label = family.replace(/^(['"])(.*)\1$/, "$2");
              targets.push({ id: `font-${src.start}`, family: label, weight: descriptors.get("font-weight")?.value ?? "normal", style: descriptors.get("font-style")?.value ?? "normal", start: src.start, end: src.end, raw: css.slice(src.start - base, src.end - base), embedded: /^url\(\s*['"]?data:font\/woff2?;base64,[a-z\d+/]+=*['"]?\s*\)\s*format\(['"]woff2?['"]\)\s*$/i.test(src.value) });
            }
          }
        }
        ruleStart = i + 1;
      }
    } else if (masked[i] === ";" && depth === 0) ruleStart = i + 1;
  }
  return depth === 0 ? targets : [];
}

export function inspectFontTargets(source: string): FontTarget[] {
  const targets: FontTarget[] = [];
  const walk = (node: Node) => {
    if ("tagName" in node) {
      if (["script", "template", "noscript", "svg", "iframe", "object"].includes(node.tagName)) return;
      const loc = node.sourceCodeLocation;
      if (node.tagName === "style" && loc?.startTag && loc.endTag) {
        const type = node.attrs.find(a => a.name === "type")?.value;
        if (!type || type.toLowerCase() === "text/css") targets.push(...inlineFaces(source.slice(loc.startTag.endOffset, loc.endTag.startOffset), loc.startTag.endOffset));
      }
    }
    if ("childNodes" in node) node.childNodes.forEach(walk);
  };
  walk(parse(source, { sourceCodeLocationInfo: true }));
  return targets;
}

export function replaceFontSource(source: string, target: FontTarget, font: LocalFont): string {
  requireDecodedFont(font);
  const current = inspectFontTargets(source).find(t => t.id === target.id);
  if (!current || current.raw !== target.raw || current.end !== target.end || current.family !== target.family)
    throw new Error("字体声明已变化，请重新选择。");
  const value = ` url("${font.dataUrl}") format("${font.format}")`;
  const next = source.slice(0, current.start) + value + source.slice(current.end);
  if (new TextEncoder().encode(next).byteLength > MAX_DOCUMENT_BYTES) throw new Error("嵌入后 HTML 超过 5 MiB，请使用更小的字体文件。");
  return next;
}
