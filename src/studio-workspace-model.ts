import { inspectSlides } from './slides';
import { inspectDocumentObjects } from './document-objects';
import { editHistory, type EditHistory } from './history';

// Shared tools use offsets from their source snapshot. Never apply one to a newer source.
export function applyWorkspaceChange(history: EditHistory, expected: string, next: string): EditHistory {
  if (history.present !== expected) throw new Error('作品已变化，旧的对象修改没有应用。请重新选择对象。');
  if (next.length > 200000) throw new Error('Studio 作品不能超过 200000 字符，请使用较小的图片。');
  return editHistory(history, next);
}

/** The two inspectors have different IDs; match exact source offsets, never IDs. */
export function objectPreviewPage(source: string, selected: string): string | undefined {
  if (!selected) return undefined;
  const object = inspectDocumentObjects(source)[0]!.objects.find(item => item.id === selected);
  if (!object) return undefined;
  return inspectSlides(source).find(page => page.start === object.start || page.objects.some(item => item.start === object.start))?.id;
}

/** Bridge and document inspector IDs are separate namespaces. */
export function previewObjectId(source: string, pageId: string, documentId: string): string {
  const object = inspectDocumentObjects(source)[0]?.objects.find(o => o.id === documentId);
  return inspectSlides(source).find(p => p.id === pageId)?.objects.find(o => o.start === object?.start)?.id ?? '';
}
export function workspaceObjectId(source: string, pageId: string, bridgeId: unknown): string | undefined {
  if (typeof bridgeId !== 'string') return undefined;
  const object = inspectSlides(source).find(p => p.id === pageId)?.objects.find(o => o.id === bridgeId);
  if (!object) return undefined;
  return inspectDocumentObjects(source)[0]?.objects.find(o => o.start === object.start)?.id;
}
