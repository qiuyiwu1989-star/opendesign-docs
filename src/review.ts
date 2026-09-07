import { inspectHtml } from "./html";

export type ReviewAnchor =
  | { kind: "text"; id: string; quote: string }
  | {
      kind: "region";
      x: number;
      y: number;
      width: number;
      height: number;
      viewportWidth: number;
    };
export type ReviewMessage = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};
export type ReviewThread = {
  id: string;
  versionId: string;
  anchor: ReviewAnchor;
  messages: ReviewMessage[];
  resolved: boolean;
  updatedAt: string;
};
export type ReviewRecord = {
  id: string;
  revision: number;
  threads: ReviewThread[];
};

export function validateAnchor(value: unknown, source: string): ReviewAnchor {
  if (!value || typeof value !== "object") throw new Error("请选择批注位置。");
  const anchor = value as ReviewAnchor;
  if (anchor.kind === "text") {
    const target = inspectHtml(source).targets.find(
      (item) => item.id === anchor.id,
    );
    if (
      !target ||
      typeof anchor.quote !== "string" ||
      target.text !== anchor.quote ||
      !anchor.quote.trim()
    )
      throw new Error("文字已变化，请重新选择批注位置。");
    return { kind: "text", id: anchor.id, quote: anchor.quote };
  }
  if (
    anchor.kind === "region" &&
    [
      anchor.x,
      anchor.y,
      anchor.width,
      anchor.height,
      anchor.viewportWidth,
    ].every((n) => typeof n === "number" && Number.isFinite(n)) &&
    anchor.x >= 0 &&
    anchor.y >= 0 &&
    anchor.y <= 1_000_000 &&
    anchor.width >= 4 &&
    anchor.height >= 4 &&
    anchor.height <= 100_000 &&
    anchor.viewportWidth >= 100 &&
    anchor.viewportWidth <= 20_000 &&
    anchor.x + anchor.width <= anchor.viewportWidth + 1
  ) {
    return {
      kind: "region",
      x: anchor.x,
      y: anchor.y,
      width: anchor.width,
      height: anchor.height,
      viewportWidth: anchor.viewportWidth,
    };
  }
  throw new Error("批注区域无效，请重新框选。");
}
export function reviewMessage(author: string, body: string): ReviewMessage {
  if (!author.trim() || author.trim().length > 60)
    throw new Error("请填写 1–60 字的显示名。");
  if (!body.trim() || body.trim().length > 5000)
    throw new Error("请填写 1–5000 字的批注意见。");
  return {
    id: crypto.randomUUID(),
    author: author.trim(),
    body: body.trim(),
    createdAt: new Date().toISOString(),
  };
}
export function addThread(
  record: ReviewRecord,
  versionId: string,
  anchor: ReviewAnchor,
  message: ReviewMessage,
): ReviewRecord {
  if (record.threads.length >= 500)
    throw new Error("本机首版每份文档最多 500 条批注。");
  return {
    ...record,
    revision: record.revision + 1,
    threads: [
      ...record.threads,
      {
        id: crypto.randomUUID(),
        versionId,
        anchor,
        messages: [message],
        resolved: false,
        updatedAt: message.createdAt,
      },
    ],
  };
}
export function updateThread(
  record: ReviewRecord,
  id: string,
  change: ReviewMessage | boolean,
): ReviewRecord {
  if (!record.threads.some((t) => t.id === id))
    throw new Error("批注不存在，请刷新后重试。");
  return {
    ...record,
    revision: record.revision + 1,
    threads: record.threads.map((thread) => {
      if (thread.id !== id) return thread;
      if (typeof change !== "boolean" && thread.messages.length >= 100)
        throw new Error("单条批注最多 100 条留言。");
      return {
        ...thread,
        ...(typeof change === "boolean"
          ? { resolved: change }
          : { messages: [...thread.messages, change] }),
        updatedAt: new Date().toISOString(),
      };
    }),
  };
}
