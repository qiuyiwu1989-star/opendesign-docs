import { inspectDocumentObjects } from "../src/document-objects";
import { documentFlowCapabilities } from "../src/document-edit";
import { getObjectCapabilities } from "../src/object-edit";
import { readObjectTextStyle } from "../src/object-style-read";
import { MAX_DOCUMENT_BYTES } from "../src/slide-insert";

const encoder = new TextEncoder();
function documentWith(count: number, suffix = "") {
  const blocks = Array.from({ length: count }, (_, index) =>
    '<p style="font-size:' + (20 + index % 4) + 'px;color:#123456">Block ' + index + '</p>',
  ).join("");
  return "<!doctype html><html><body><main>" + blocks + suffix + "</main></body></html>";
}
function nearLimitDocument(count: number) {
  const base = documentWith(count);
  const targetBytes = MAX_DOCUMENT_BYTES - 1024;
  const fill = targetBytes - encoder.encode(base).byteLength - 7;
  if (fill <= 0) throw new Error("Synthetic document exceeds target before padding.");
  return documentWith(count, "<!--" + "x".repeat(fill) + "-->");
}
function measure(label: string, source: string, expectedObjects: number) {
  const bytes = encoder.encode(source).byteLength;
  const coldStart = performance.now();
  const objects = inspectDocumentObjects(source)[0]!.objects;
  const warmStart = performance.now();
  const target = objects[Math.floor(objects.length / 2)]!;
  const capabilities = getObjectCapabilities(source, target, inspectDocumentObjects);
  const flow = documentFlowCapabilities(source, target);
  const style = readObjectTextStyle(source, target, inspectDocumentObjects);
  const end = performance.now();
  const coldMs = warmStart - coldStart, warmMs = end - warmStart;
  if (objects.length !== expectedObjects) throw new Error(label + ": unexpected object count");
  if (!capabilities.textStyle || !flow.up || !flow.down || !flow.insert || style.color !== "#123456")
    throw new Error(label + ": selected-object operations failed");
  // Wide ceilings catch accidental whole-document reparsing while tolerating slow CI hosts.
  if (coldMs > 3000) throw new Error(label + ": cold catalog exceeded 3000 ms");
  if (warmMs > 500) throw new Error(label + ": warm selected-object operations exceeded 500 ms");
  return { label, bytes, objects: objects.length, coldCatalogMs: Number(coldMs.toFixed(1)), warmSelectionMs: Number(warmMs.toFixed(1)) };
}

const nearLimit = nearLimitDocument(400);
if (encoder.encode(nearLimit).byteLength !== MAX_DOCUMENT_BYTES - 1024)
  throw new Error("Near-limit fixture size is not deterministic.");
console.log(JSON.stringify({
  thresholds: { coldCatalogMs: 3000, warmSelectionMs: 500 },
  results: [
    measure("100 objects", documentWith(100), 100),
    measure("400 objects", documentWith(400), 400),
    measure("near 5 MiB / 400 objects", nearLimit, 400),
  ],
}, null, 2));
