/** Export original source, not the sandboxed preview or the editor's live DOM. */
export function htmlExportBlob(source: string) {
  return new Blob([source], { type: "text/html;charset=utf-8" });
}

export function htmlExportName(name: string) {
  const stem = name.replace(/\.html?$/i, "")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "-")
    .replace(/[\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/^[.\s]+|[.\s]+$/g, "");
  let bounded = "";
  for (const character of Array.from(stem).slice(0, 64)) {
    if (new TextEncoder().encode(bounded + character).byteLength > 180) break;
    bounded += character;
  }
  return `${bounded || "document"}-edited.html`;
}
