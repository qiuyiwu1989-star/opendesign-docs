import { MAX_DOCUMENT_BYTES } from "./slide-insert";
import { inspectDocumentObjects } from "./document-objects";
import { readSourceTree } from "./source-tree";
import type { SlideObject } from "./slides";
export type DocumentGeometry = { x: number; y: number; width: number; height: number };
const keys = { x: "left", y: "top", width: "width", height: "height" } as const;
const unsupported = "仅支持内联 absolute 定位、left/top/width/height 均为 px，且无复杂布局约束的对象。";
function inspect(source: string, target: SlideObject) {
  const current = inspectDocumentObjects(source)[0]!.objects.find(o => o.id === target.id);
  if (!current || current.raw !== target.raw || current.start !== target.start || current.end !== target.end || current.title !== target.title || current.style !== target.style || current.styleStart !== target.styleStart || current.styleEnd !== target.styleEnd) throw new Error("对象已变化，请重新选择。");
  const tree = readSourceTree(source), node = tree.elementsByStart.get(target.start);
  const loc = node?.sourceCodeLocation?.attrs?.style;
  if (!loc || tree.duplicateAttributeOffsets.some(n => n >= target.start && n < target.end)) throw new Error(unsupported);
  const raw = source.slice(loc.startOffset, loc.endOffset);
  const attr = /^style\s*=\s*(["'])([\s\S]*)\1$/i.exec(raw);
  if (!attr || /[&\\{}()]/.test(attr[2]!) || attr[2]!.includes("/*")) throw new Error(unsupported);
  const style = attr[2]!;
  const declarations = new Map<string, { value: string; start: number; end: number }>();
  for (const match of style.matchAll(/(?:^|;)(\s*([\w-]+)\s*:\s*)([^;]*)(?=;|$)/g)) {
    const name = match[2]!.toLowerCase();
    if (declarations.has(name)) throw new Error("存在重复内联样式，请先整理后再调整位置。");
    const start = match.index! + (match[0]!.startsWith(";") ? 1 : 0) + match[1]!.length;
    declarations.set(name, { value: match[3]!.trim(), start, end: start + match[3]!.length });
  }
  if (declarations.get("position")?.value !== "absolute") throw new Error(unsupported);
  for (const [name, entry] of declarations) {
    if (/^(?:transform|translate|rotate|scale|zoom|animation|transition|inset|right|bottom|margin|min-|max-|aspect-ratio|writing-mode|direction|all)/.test(name) && entry.value !== "none") throw new Error(unsupported);
  }
  // Outside layout rules can override inline values with !important or transform
  // the coordinate system. Conservatively leave these sources unsupported.
  if (/<link\b[^>]*\brel\s*=\s*["']?stylesheet/i.test(source) || /<style\b[^>]*>[\s\S]*?(?:!important|transform\s*:|translate\s*:|rotate\s*:|scale\s*:|zoom\s*:|animation\s*:)[\s\S]*?<\/style>/i.test(source)) throw new Error("文档含外部样式或变换规则，无法安全确认位置，暂不开放数值调整。");
  let parent = node?.parentNode;
  while (parent) {
    if ("attrs" in parent && /(?:transform|translate|rotate|scale|zoom|animation)\s*:/i.test(parent.attrs.find(a => a.name === "style")?.value ?? "")) throw new Error("父容器含变换，暂不支持位置调整。");
    parent = "parentNode" in parent ? parent.parentNode : null;
  }
  const geometry = {} as DocumentGeometry;
  for (const key of Object.keys(keys) as (keyof DocumentGeometry)[]) {
    const value = declarations.get(keys[key])?.value;
    if (!value || !/^-?(?:\d+(?:\.\d+)?|\.\d+)px$/.test(value)) throw new Error(unsupported);
    geometry[key] = Number(value.slice(0, -2));
  }
  validateDocumentGeometry(geometry);
  return { geometry, declarations, styleStart: loc.startOffset + raw.indexOf(attr[1]!) + 1 };
}
export function validateDocumentGeometry(geometry: DocumentGeometry) {
  for (const key of Object.keys(keys) as (keyof DocumentGeometry)[]) {
    const value = geometry[key];
    if (!Number.isFinite(value) || Math.abs(value) > 20000 || ((key === "width" || key === "height") && value < 1)) throw new Error("X/Y 范围为 -20000～20000 px，宽高为 1～20000 px。");
  }
}
export function readDocumentGeometry(source: string, target: SlideObject): { geometry?: DocumentGeometry; reason?: string } {
  try { return { geometry: inspect(source, target).geometry }; }
  catch (error) { return { reason: error instanceof Error ? error.message : unsupported }; }
}
export function patchDocumentGeometry(source: string, target: SlideObject, geometry: DocumentGeometry): string {
  validateDocumentGeometry(geometry);
  const found = inspect(source, target);
  const edits = (Object.keys(keys) as (keyof DocumentGeometry)[]).filter(key => geometry[key] !== found.geometry[key]).map(key => {
    const declaration = found.declarations.get(keys[key])!;
    return { start: found.styleStart + declaration.start, end: found.styleStart + declaration.end, value: `${geometry[key]}px` };
  });
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.value + source.slice(edit.end);
  if (new TextEncoder().encode(source).byteLength > MAX_DOCUMENT_BYTES) throw new Error("修改后文档超过大小限制，请先精简内容。");
  return source;
}
