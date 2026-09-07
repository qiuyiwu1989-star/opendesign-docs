import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPreview, inspectHtml, patchText } from "../src/html";
import {
  inspectSlides,
  createSlidePreview,
  patchPlacement,
} from "../src/slides";

// Explicit path only. Reads HTML as data, never executes scripts or follows links.
const directory = process.argv[2];
if (!directory)
  throw new Error("Usage: npm run audit -- /absolute/path/to/html-directory");
const entries = (await readdir(directory, { withFileTypes: true })).filter(
  (entry) => entry.isFile() && /\.html?$/i.test(entry.name),
);
const total = {
  files: 0,
  bytes: 0,
  withScripts: 0,
  withSvg: 0,
  withExternalResources: 0,
  withRelativeResources: 0,
  editableTextSegments: 0,
  zeroEditableFiles: 0,
  roundtripPassed: 0,
  slideDocuments: 0,
  slidePages: 0,
  slideObjects: 0,
  placementRoundtrips: 0,
};
for (const entry of entries) {
  const bytes = await readFile(join(directory, entry.name));
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const report = inspectHtml(source);
  createPreview(source, "corpus-audit-channel", true);
  total.files++;
  total.bytes += bytes.length;
  total.withScripts += Number(report.scripts > 0);
  total.withSvg += Number(report.svg > 0);
  total.withExternalResources += Number(report.externalResources > 0);
  total.withRelativeResources += Number(report.relativeResources > 0);
  total.editableTextSegments += report.targets.length;
  if (!report.targets.length) total.zeroEditableFiles++;
  for (const target of report.targets) {
    const result = patchText(source, target, "验证 <文字> & 保真");
    if (
      result !==
      source.slice(0, target.start) +
        "验证 &lt;文字&gt; &amp; 保真" +
        source.slice(target.end)
    )
      throw new Error("Source span roundtrip mismatch");
  }
  total.roundtripPassed++;
  const pages = inspectSlides(source);
  total.slideDocuments += Number(pages.length > 0);
  total.slidePages += pages.length;
  for (const page of pages) {
    createSlidePreview(source, "corpus-slide-channel", page.id);
    total.slideObjects += page.objects.length;
    for (const object of page.objects) {
      const patched = patchPlacement(source, object, {
        x: 10,
        y: 20,
        scale: 1.1,
      });
      // No bytes outside the selected opening tag may change.
      if (
        !patched.startsWith(source.slice(0, object.start)) ||
        !patched.endsWith(source.slice(object.end))
      )
        throw new Error("Placement span roundtrip mismatch");
      total.placementRoundtrips++;
    }
  }
}
// Aggregate statistics only; private titles/content are never written into the repo.
console.log(JSON.stringify(total, null, 2));
