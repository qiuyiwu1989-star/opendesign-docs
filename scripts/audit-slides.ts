import { readFile } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import {
  inspectSlides,
  createSlidePreview,
  patchPlacement,
} from "../src/slides";
import { repairEmbeddedImages } from "../src/image-repair";
import { inspectTextRuns, patchTextRuns } from "../src/text-runs";
const files = process.argv.slice(2);
if (!files.length || files.some((f) => !isAbsolute(f)))
  throw new Error("Pass explicit absolute HTML file paths.");
for (const file of files) {
  const bytes = await readFile(file),
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const pages = inspectSlides(source),
    repair = repairEmbeddedImages(source);
  let checked = 0;
  let mixedTitles = 0,
    mixedRuns = 0;
  for (const page of pages) {
    createSlidePreview(source, "slide-audit-channel", page.id);
    for (const object of [page.objects[0], page.objects.at(-1)].filter(
      Boolean,
    )) {
      const edited = patchPlacement(source, object!, {
        x: 12,
        y: 8,
        scale: 1.1,
      });
      if (
        !edited.startsWith(source.slice(0, object!.start)) ||
        !edited.endsWith(source.slice(object!.end))
      )
        throw new Error("Nonlocal geometry patch");
      checked++;
    }
    // Bounded title-area audit, in memory only. Never emit private text.
    for (const object of page.objects.slice(0, 12)) {
      const target = inspectTextRuns(source, object);
      if (target.runs.length < 2) continue;
      const next = patchTextRuns(
        source,
        target,
        target.runs.map((_, i) => `AUDIT_${i}`),
      );
      const current = inspectTextRuns(next, object);
      if (
        current.runs.length !== target.runs.length ||
        current.runs.some((r, i) => r.text !== `AUDIT_${i}`)
      )
        throw new Error("Mixed text roundtrip failed");
      if (
        patchTextRuns(
          source,
          target,
          target.runs.map((r) => r.text),
        ) !== source
      )
        throw new Error("Unchanged text was rewritten");
      mixedTitles++;
      mixedRuns += target.runs.length;
      break;
    }
  }
  console.log(
    JSON.stringify({
      file: basename(file),
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      pages: pages.length,
      objects: pages.reduce((n, p) => n + p.objects.length, 0),
      imageRepairs: repair.count,
      checkedPlacements: checked,
      checkedMixedTitles: mixedTitles,
      checkedMixedRuns: mixedRuns,
    }),
  );
}
