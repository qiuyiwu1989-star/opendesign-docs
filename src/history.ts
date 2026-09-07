export type EditHistory = { past: string[]; present: string; future: string[] };
export const historyOf = (source: string): EditHistory => ({
  past: [],
  present: source,
  future: [],
});
// Bound full-source snapshots by both count and characters (at most ~40 MiB UTF-16).
function bounded(items: string[]) {
  const result: string[] = [];
  let size = 0;
  for (const item of [...items].reverse()) {
    if (result.length >= 20 || size + item.length > 20_000_000) break;
    result.unshift(item);
    size += item.length;
  }
  return result;
}
export function editHistory(history: EditHistory, source: string): EditHistory {
  return source === history.present
    ? history
    : {
        past: bounded([...history.past, history.present]),
        present: source,
        future: [],
      };
}
export function moveHistory(
  history: EditHistory,
  direction: "undo" | "redo",
): EditHistory {
  if (direction === "undo") {
    if (!history.past.length) return history;
    return {
      past: history.past.slice(0, -1),
      present: history.past.at(-1)!,
      future: bounded([...history.future, history.present]),
    };
  }
  if (!history.future.length) return history;
  return {
    past: bounded([...history.past, history.present]),
    present: history.future.at(-1)!,
    future: history.future.slice(0, -1),
  };
}
