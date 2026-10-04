import { documentObjectNodes, inspectDocumentObjects } from "./document-objects";
import type { SlideObject } from "./slides";

export type DocumentLayer = { object: SlideObject; parent: string | null; children: string[]; level: number };
/** Use actual DOM ancestry: filtered wrapper siblings may share depth without sharing a parent. */
export function documentLayers(source: string): DocumentLayer[] {
  const objects = inspectDocumentObjects(source)[0]!.objects;
  const byStart = new Map(objects.map(object => [object.start, object.id]));
  const result: DocumentLayer[] = documentObjectNodes(source).map(({ node }, index) => {
    let ancestor = node.parentNode;
    let parent: string | null = null;
    while (ancestor) {
      const offset = ancestor.sourceCodeLocation?.startOffset;
      if (offset !== undefined && byStart.has(offset)) { parent = byStart.get(offset)!; break; }
      ancestor = "parentNode" in ancestor ? ancestor.parentNode : null;
    }
    return { object: objects[index]!, parent, children: [], level: 0 };
  });
  const byId = new Map(result.map(layer => [layer.object.id, layer]));
  for (const layer of result) {
    const parent = layer.parent ? byId.get(layer.parent) : undefined;
    if (parent) { parent.children.push(layer.object.id); layer.level = parent.level + 1; }
  }
  return result;
}
export function layerAncestors(layers: DocumentLayer[], selected: string): string[] {
  const byId = new Map(layers.map(layer => [layer.object.id, layer]));
  const ancestors: string[] = [];
  let parent = byId.get(selected)?.parent;
  while (parent) { ancestors.push(parent); parent = byId.get(parent)?.parent; }
  return ancestors;
}
