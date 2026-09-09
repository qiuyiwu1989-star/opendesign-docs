import { parse, type DefaultTreeAdapterMap } from "parse5";
import { getObjectCapabilities, type ObjectCatalog } from "./object-edit";
import type { SlideObject } from "./slides";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
type SourceStyle = {
  fontSize: number | undefined;
  color: string | undefined;
  bold: boolean | undefined;
  align: "left" | "center" | "right" | undefined;
};
export type ObjectStyleRead = {
  [Key in keyof SourceStyle]: SourceStyle[Key] | "mixed";
};
const blank = (): SourceStyle => ({ fontSize: undefined, color: undefined, bold: undefined, align: undefined });
const fields = ["fontSize", "color", "bold", "align"] as const;
type Field = typeof fields[number];
const properties: Record<string, Field> = {
  "font-size": "fontSize", color: "color", "font-weight": "bold", "text-align": "align",
};

/** Split declarations without interpreting text inside strings, functions or comments. */
function declarations(style: string): string[] | undefined {
  const result: string[] = [];
  let current = "", quote = "", depth = 0;
  for (let i = 0; i < style.length; i++) {
    const char = style[i]!;
    if (char === "\\") return undefined; // Escaped names/values need a real CSS parser.
    if (quote) {
      current += char;
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") { quote = char; current += char; continue; }
    if (char === "/" && style[i + 1] === "*") {
      const end = style.indexOf("*/", i + 2);
      if (end < 0) return undefined;
      current += " "; i = end + 1; continue;
    }
    if (char === "{" || char === "}") return undefined;
    if (char === "(") depth++;
    if (char === ")" && --depth < 0) return undefined;
    if (char === ";" && depth === 0) { result.push(current); current = ""; }
    else current += char;
  }
  if (quote || depth) return undefined;
  result.push(current);
  return result;
}

function readColor(value: string): string | undefined {
  if (/^#[\da-f]{3,4}$/.test(value))
    return "#" + [...value.slice(1)].map(char => char + char).join("");
  if (/^#(?:[\da-f]{6}|[\da-f]{8})$/.test(value)) return value;
  // Small explicit set only; unknown names/functions remain unknown, never guessed.
  const names: Record<string, string> = {
    black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000",
    blue: "#0000ff", yellow: "#ffff00", gray: "#808080", grey: "#808080",
    transparent: "#00000000",
  };
  return Object.hasOwn(names, value) ? names[value] : undefined;
}
function valueOf(field: Field, value: string): SourceStyle[Field] {
  if (field === "fontSize") {
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)px$/.test(value)) return undefined;
    const size = Number(value.slice(0, -2));
    return Number.isFinite(size) && size >= 0 ? size : undefined;
  }
  if (field === "color") return readColor(value);
  if (field === "bold") {
    if (value === "normal") return false;
    if (value === "bold") return true;
    if (/^\d+(?:\.\d+)?$/.test(value)) {
      const weight = Number(value);
      if (weight >= 1 && weight <= 1000) return weight >= 600;
    }
    return undefined;
  }
  return value === "left" || value === "center" || value === "right" ? value : undefined;
}

function inlineStyle(style: string, inherited: SourceStyle): SourceStyle {
  const parsed = declarations(style);
  if (!parsed) return blank();
  const result = { ...inherited };
  const winners = new Map<Field, { value: string; important: boolean }>();
  for (const entry of parsed) {
    const colon = entry.indexOf(":");
    if (colon < 0) continue;
    const name = entry.slice(0, colon).trim().toLowerCase();
    const raw = entry.slice(colon + 1).trim().toLowerCase();
    const important = /!\s*important\s*$/.test(raw);
    const value = raw.replace(/!\s*important\s*$/, "").trim();
    // A shorthand/reset can shadow an earlier known longhand. Do not guess its expansion.
    const affected: readonly Field[] = name === "all" ? fields : name === "font" ? ["fontSize", "bold"] :
      Object.hasOwn(properties, name) ? [properties[name]!] : [];
    for (const field of affected) {
      const previous = winners.get(field);
      if (!previous?.important || important)
        winners.set(field, { value: name === "font" ? "" : value, important });
    }
  }
  for (const [field, winner] of winners) {
    const value = winner.value === "inherit" || winner.value === "unset" ? inherited[field] : valueOf(field, winner.value);
    // This write is correlated by field at runtime, unlike a union-indexed assignment.
    Object.assign(result, { [field]: value });
  }
  return result;
}

/**
 * Source-only hints, NOT computed CSS. Read literal inline values and bounded inline
 * inheritance within this selected object. Managed --docs-text-style declarations
 * obey the same order/!important rules as other declarations; markers confer no priority.
 * Relative/variable/shorthand/unsupported values and outside styles are not resolved.
 * Different known/unknown text-run values return "mixed". Reading never patches source.
 */
export function readObjectTextStyle(source: string, target: SlideObject, catalog: ObjectCatalog): ObjectStyleRead {
  const matches = catalog(source).flatMap(page => page.objects).filter(object => object.id === target.id);
  const current = matches[0];
  if (matches.length !== 1 || !current ||
      ["start", "end", "raw", "title", "tag", "style", "styleStart", "styleEnd"].some(key =>
        current[key as keyof SlideObject] !== target[key as keyof SlideObject]) ||
      !getObjectCapabilities(source, target, catalog).textStyle)
    throw new Error("对象已变化或不支持读取文字样式，请重新选择。");
  let selected: Element | undefined;
  const find = (node: Node) => {
    if ("tagName" in node && node.sourceCodeLocation?.startOffset === target.start) selected = node;
    if ("childNodes" in node) node.childNodes.forEach(find);
  };
  find(parse(source, { sourceCodeLocationInfo: true }));
  if (!selected) throw new Error("对象不存在，请重新选择。");
  const tag = selected.sourceCodeLocation?.startTag;
  const styleLocation = selected.sourceCodeLocation?.attrs?.style;
  if (!tag || selected.tagName !== target.tag || tag.endOffset !== target.end ||
      source.slice(tag.startOffset, tag.endOffset) !== target.raw ||
      (selected.attrs.find(attr => attr.name === "style")?.value ?? "") !== target.style ||
      styleLocation?.startOffset !== target.styleStart || styleLocation?.endOffset !== target.styleEnd)
    throw new Error("对象已变化，请重新选择。");
  const runs: SourceStyle[] = [];
  const visit = (node: Node, inherited: SourceStyle) => {
    let next = inherited;
    if ("tagName" in node) {
      next = { ...inherited };
      // Semantic defaults cannot be inferred from an ancestor's inline declaration.
      if (["b", "strong"].includes(node.tagName)) next.bold = undefined;
      if (["small", "sub", "sup"].includes(node.tagName)) next.fontSize = undefined;
      if (node.tagName === "mark" || (node.tagName === "a" && node.attrs.some(attr => attr.name === "href"))) next.color = undefined;
      next = inlineStyle(node.attrs.find(attr => attr.name === "style")?.value ?? "", next);
    }
    if ("value" in node && node.value.trim()) runs.push(next);
    if ("childNodes" in node) node.childNodes.forEach(child => visit(child, next));
  };
  visit(selected, blank());
  const result: ObjectStyleRead = blank();
  for (const field of fields) {
    const values = new Set(runs.map(run => run[field]));
    Object.assign(result, { [field]: values.size > 1 ? "mixed" : runs[0]?.[field] });
  }
  return result;
}
