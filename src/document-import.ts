import { MAX_DOCUMENT_BYTES } from "./document-limits";

export class ImportError extends Error {
  constructor(public reason: "invalid" | "too_large", message: string) { super(message); }
}
export function validateDocument(name: unknown, source: unknown) {
  if (typeof name !== "string" || typeof source !== "string" || !source.trim())
    throw new ImportError("invalid", "请选择非空 HTML 文档。");
  if (source.length > MAX_DOCUMENT_BYTES)
    throw new ImportError("too_large", "文档超过 5 MiB 限制。");
  // UTF-16 strings arriving through structured clone must not silently replace broken surrogates.
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(source))
    throw new ImportError("invalid", "文档包含无效字符，请重新导出 UTF-8 HTML。");
  const bytes = new TextEncoder().encode(source).byteLength;
  if (bytes > MAX_DOCUMENT_BYTES) throw new ImportError("too_large", "文档超过 5 MiB 限制。");
  let cleaned = name.replace(/[/\\\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "").trim();
  cleaned = Array.from(cleaned.replace(/\.html?$/i, "")).slice(0, 150).join("").trim() || "未命名文档";
  return { name: `${cleaned}.html`, source, bytes };
}
export async function readDocumentFile(file: File) {
  if (!/\.html?$/i.test(file.name)) throw new ImportError("invalid", "请选择 HTML 文件。");
  if (file.size > MAX_DOCUMENT_BYTES) throw new ImportError("too_large", "文档超过 5 MiB 限制。");
  const bytes = await file.arrayBuffer();
  let source: string;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new ImportError("invalid", "文件不是 UTF-8 编码，请先转换编码，避免中文损坏。"); }
  return validateDocument(file.name, source);
}
