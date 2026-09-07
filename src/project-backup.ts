import { inspectHtml } from "./html";
import { validateAnchor, type ReviewAnchor, type ReviewRecord } from "./review";
import type { DocumentRecord } from "./store";

export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
export type ProjectBackup = {
  format: "opendesign-docs-project";
  schemaVersion: 1;
  createdAt: string;
  document: DocumentRecord;
  review: ReviewRecord;
};
const invalid = (detail: string): never => {
  throw new Error(`备份无效：${detail}。原文档未改动。`);
};
const bytes = (value: string) => new TextEncoder().encode(value).byteLength;
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return invalid("缺少必要信息");
  if (
    Object.keys(value).some((key) => !keys.includes(key)) ||
    keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  )
    return invalid("字段不完整或包含不支持的内容");
  return value as Record<string, unknown>;
}
function text(
  value: unknown,
  max: number,
  field: string,
  allowEmpty = false,
): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!allowEmpty && !value.trim())
  )
    return invalid(`${field}超出限制或为空`);
  return value;
}
function date(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    return invalid("日期格式不正确");
  if (
    new Date(value).toISOString().replace(".000Z", "Z") !==
    value.replace(".000Z", "Z")
  )
    return invalid("日期不存在");
  return value;
}
function id(value: unknown, seen: Set<string>): string {
  const result = text(value, 200, "标识");
  if (seen.has(result)) return invalid("标识重复");
  seen.add(result);
  return result;
}
function array(
  value: unknown,
  min: number,
  max: number,
  field: string,
): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    return invalid(`${field}数量超出限制`);
  return Array.from(value);
}

// Validation constructs a plain allowlisted snapshot. Nothing from an imported
// HTML source is executed, and text anchors parse each referenced version once.
export function validateProjectBackup(value: unknown): ProjectBackup {
  const root = object(value, [
    "format",
    "schemaVersion",
    "createdAt",
    "document",
    "review",
  ]);
  if (root.format !== "opendesign-docs-project")
    return invalid("不是 OpenDesign Docs 项目备份");
  if (root.schemaVersion !== 1)
    return invalid("不支持此备份版本，请使用新版 Docs 或原应用重新导出");
  const document = object(root.document, ["id", "name", "versions"]);
  const versionIds = new Set<string>();
  let sourceBytes = 0;
  const versions = array(document.versions, 1, 100, "版本（最多 100 个）").map(
    (value) => {
      const version = object(value, ["id", "createdAt", "source", "label"]);
      const source = text(version.source, MAX_SOURCE_BYTES, "HTML", true);
      const size = bytes(source);
      if (size > MAX_SOURCE_BYTES) return invalid("单个 HTML 超过 5 MiB");
      sourceBytes += size;
      if (sourceBytes > MAX_BACKUP_BYTES)
        return invalid("此项目超出备份上限（20 MiB），请先导出所需 HTML");
      return {
        id: id(version.id, versionIds),
        createdAt: date(version.createdAt),
        source,
        label: text(version.label, 500, "版本名称", true),
      };
    },
  );
  const normalizedDocument = {
    id: text(document.id, 200, "文档标识"),
    name: text(document.name, 500, "文档名"),
    versions,
  };
  const review = object(root.review, ["id", "revision", "threads"]);
  if (review.id !== normalizedDocument.id) return invalid("批注所属文档不匹配");
  if (
    typeof review.revision !== "number" ||
    !Number.isSafeInteger(review.revision) ||
    review.revision < 0
  )
    return invalid("批注版本号不正确");
  const sourceByVersion = new Map(
    versions.map((version) => [version.id, version.source]),
  );
  const anchorsByVersion = new Map<string, Map<string, string>>();
  const threadIds = new Set<string>(),
    messageIds = new Set<string>();
  const threads = array(review.threads, 0, 500, "批注（最多 500 条）").map(
    (value) => {
      const thread = object(value, [
        "id",
        "versionId",
        "anchor",
        "messages",
        "resolved",
        "updatedAt",
      ]);
      const versionId = text(thread.versionId, 200, "批注版本标识");
      if (!sourceByVersion.has(versionId))
        return invalid("批注引用的版本不存在");
      let anchor: ReviewAnchor;
      if (
        thread.anchor &&
        typeof thread.anchor === "object" &&
        "kind" in thread.anchor &&
        thread.anchor.kind === "text"
      ) {
        const raw = object(thread.anchor, ["kind", "id", "quote"]);
        const anchorId = text(raw.id, 200, "文字位置"),
          quote = text(raw.quote, 100000, "引用文字");
        let targets = anchorsByVersion.get(versionId);
        if (!targets) {
          targets = new Map(
            inspectHtml(sourceByVersion.get(versionId)!).targets.map(
              (target) => [target.id, target.text],
            ),
          );
          anchorsByVersion.set(versionId, targets);
        }
        if (targets.get(anchorId) !== quote)
          return invalid("批注文字与对应版本不匹配");
        anchor = { kind: "text", id: anchorId, quote };
      } else {
        const raw = object(thread.anchor, [
          "kind",
          "x",
          "y",
          "width",
          "height",
          "viewportWidth",
        ]);
        try {
          anchor = validateAnchor(raw, "");
        } catch {
          return invalid("批注区域不正确");
        }
      }
      if (typeof thread.resolved !== "boolean")
        return invalid("批注状态不正确");
      const messages = array(
        thread.messages,
        1,
        100,
        "单条批注留言（最多 100 条）",
      ).map((value) => {
        const message = object(value, ["id", "author", "body", "createdAt"]);
        return {
          id: id(message.id, messageIds),
          author: text(message.author, 60, "显示名"),
          body: text(message.body, 5000, "留言"),
          createdAt: date(message.createdAt),
        };
      });
      return {
        id: id(thread.id, threadIds),
        versionId,
        anchor,
        messages,
        resolved: thread.resolved,
        updatedAt: date(thread.updatedAt),
      };
    },
  );
  const result: ProjectBackup = {
    format: "opendesign-docs-project",
    schemaVersion: 1,
    createdAt: date(root.createdAt),
    document: normalizedDocument,
    review: { id: normalizedDocument.id, revision: review.revision, threads },
  };
  if (bytes(JSON.stringify(result)) > MAX_BACKUP_BYTES)
    return invalid("此项目超出备份上限（20 MiB），请先导出所需 HTML");
  return result;
}

export function parseProjectBackup(json: string): ProjectBackup {
  if (bytes(json) > MAX_BACKUP_BYTES) return invalid("文件超过 20 MiB");
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return invalid("JSON 文件损坏，请重新选择备份");
  }
  return validateProjectBackup(value);
}
export function serializeProjectBackup(value: unknown): string {
  return JSON.stringify(validateProjectBackup(value));
}

export function freshProjectRecords(value: unknown): {
  document: DocumentRecord;
  review: ReviewRecord;
} {
  const backup = validateProjectBackup(value);
  const extension = backup.document.name.match(/\.html?$/i)?.[0] ?? "";
  const suffix = "-恢复副本";
  // Keep the extension and suffix even for a maximum-length imported name.
  const baseName = (
    extension
      ? backup.document.name.slice(0, -extension.length)
      : backup.document.name
  )
    .slice(0, 500 - suffix.length - extension.length)
    .replace(/[\uD800-\uDBFF]$/, "");
  const seen = new Set([
    backup.document.id,
    ...backup.document.versions.map((v) => v.id),
    ...backup.review.threads.flatMap((t) => [
      t.id,
      ...t.messages.map((m) => m.id),
    ]),
  ]);
  const fresh = () => {
    const result = crypto.randomUUID();
    if (seen.has(result))
      throw new Error("无法生成新的文档标识，请重试。原文档未改动。");
    seen.add(result);
    return result;
  };
  const documentId = fresh(),
    versionIds = new Map(
      backup.document.versions.map((version) => [version.id, fresh()]),
    );
  return {
    document: {
      id: documentId,
      name: `${baseName}${suffix}${extension}`,
      versions: backup.document.versions.map((version) => ({
        ...version,
        id: versionIds.get(version.id)!,
      })),
    },
    review: {
      id: documentId,
      revision: 1,
      threads: backup.review.threads.map((thread) => ({
        ...thread,
        id: fresh(),
        versionId: versionIds.get(thread.versionId)!,
        messages: thread.messages.map((message) => ({
          ...message,
          id: fresh(),
        })),
      })),
    },
  };
}
