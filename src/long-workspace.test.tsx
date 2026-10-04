import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { LongEditor } from "./LongEditor";

describe("long workspace review activation", () => {
  it("opens a reading workspace without starting the hidden review tools", () => {
    const source = "<!doctype html><h1>Original</h1><p>Keep source</p>";
    const html = renderToStaticMarkup(<LongEditor
      record={{ id: "test", name: "Sample", versions: [{ id: "v1", source, label: "First", createdAt: "2026-09-24T00:00:00Z" }] }}
      initialSource={source} onDirty={() => {}} onSaved={async () => {}}
      draft={{ status: null, getSource: () => source, onSource: () => {}, beforeSave: async () => {}, saveFailed: () => {}, saved: async () => {} }} />);
    expect(html).toContain('aria-label="文档工具"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toContain("正在打开批注工具");
    expect(html).not.toContain("Suspense");
  });

  it("keeps review implementation outside the static reading dependency closure", async () => {
    const result = await build({ entryPoints: ["src/LongEditor.tsx"], outdir: "/tmp/opendesign-long-bundle-check",
      external: ["*?raw"], bundle: true, splitting: true, format: "esm", platform: "browser", write: false, metafile: true });
    const outputs = result.metafile!.outputs;
    const entry = Object.entries(outputs).find(([, output]) => output.entryPoint === "src/LongEditor.tsx")!;
    const visited = new Set<string>();
    const visit = (path: string) => {
      if (visited.has(path)) return;
      visited.add(path);
      const output = outputs[path];
      expect(output).toBeDefined();
      expect(Object.keys(output!.inputs)).not.toContain("src/ReviewPanel.tsx");
      for (const item of output!.imports) if (!item.external && item.kind !== "dynamic-import") visit(item.path);
    };
    visit(entry[0]);
    expect(Object.values(outputs).some(output => "src/ReviewPanel.tsx" in output.inputs)).toBe(true);
  });
});
