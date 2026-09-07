export type Manifest = Record<string, { file: string; imports?: string[]; dynamicImports?: string[]; css?: string[] }>;

/** Include transitive static imports once; dynamic imports are not first-load bytes. */
export function staticFiles(manifest: Manifest, entry: string): { js: string[]; css: string[] } {
  const visited = new Set<string>(), js = new Set<string>(), css = new Set<string>();
  const visit = (key: string) => {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Missing manifest chunk: ${key}`);
    js.add(chunk.file);
    chunk.css?.forEach(file => css.add(file));
    chunk.imports?.forEach(visit);
  };
  visit(entry);
  return { js: [...js], css: [...css] };
}
