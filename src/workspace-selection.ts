const key = "opendesign-docs-active-document";
type SelectionStorage = Pick<Storage, "getItem" | "setItem">;
// Per-tab preference, not document storage. Failure must never block IndexedDB.
export function restoredSelection(ids: string[], storage: () => SelectionStorage = () => window.sessionStorage): string {
  try {
    const remembered = storage().getItem(key);
    if (remembered && ids.includes(remembered)) return remembered;
  } catch { /* Private/storage-disabled browsers can still edit. */ }
  return ids[0] ?? "";
}
export function rememberSelection(id: string, storage: () => SelectionStorage = () => window.sessionStorage) {
  if (!id) return;
  try { storage().setItem(key, id); } catch { /* Nonessential UI preference. */ }
}
