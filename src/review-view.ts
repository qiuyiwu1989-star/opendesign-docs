import type { ReviewThread } from "./review";

export type ReviewFilter = "pending" | "resolved";

/** Keep an unfinished reply visible even if its thread's status changes. */
export function reviewView(
  threads: ReviewThread[],
  versionId: string,
  filter: ReviewFilter,
  pendingReplyId = "",
) {
  const current = threads.filter((thread) => thread.versionId === versionId);
  return {
    pending: current.filter((thread) => !thread.resolved).length,
    resolved: current.filter((thread) => thread.resolved).length,
    visible: current.filter(
      (thread) =>
        thread.resolved === (filter === "resolved") ||
        thread.id === pendingReplyId,
    ),
  };
}
