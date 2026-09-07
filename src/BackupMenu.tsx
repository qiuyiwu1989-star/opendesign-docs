import { useEffect, useRef, useState } from "react";
import {
  exportProjectBackup,
  restoreProjectBackup,
  type DocumentRecord,
} from "./store";
import {
  MAX_BACKUP_BYTES,
  parseProjectBackup,
  serializeProjectBackup,
} from "./project-backup";
import "./backup.css";

export function BackupMenu({
  record,
  disabled,
  beforeExport,
  beforeRestore,
  onRestored,
}: {
  record: DocumentRecord | undefined;
  disabled: boolean;
  beforeExport: () => boolean;
  beforeRestore: () => boolean;
  onRestored: (record: DocumentRecord) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [download, setDownload] = useState<{
    url: string;
    name: string;
  } | null>(null);
  const input = useRef<HTMLInputElement>(null),
    busyRef = useRef(false),
    alive = useRef(true),
    generation = useRef(0);
  const latest = useRef({
    record,
    disabled,
    beforeExport,
    beforeRestore,
    onRestored,
  });
  latest.current = {
    record,
    disabled,
    beforeExport,
    beforeRestore,
    onRestored,
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current += 1;
    };
  }, []);
  useEffect(() => {
    generation.current += 1;
    setDownload(null);
    setError("");
  }, [record?.id, record?.versions.at(-1)?.id]);
  useEffect(
    () => () => {
      if (download) URL.revokeObjectURL(download.url);
    },
    [download],
  );
  const makeBackup = async () => {
    if (
      busyRef.current ||
      latest.current.disabled ||
      !latest.current.record ||
      !latest.current.beforeExport()
    )
      return;
    const current = latest.current.record,
      epoch = generation.current;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setDownload(null);
    try {
      const saved = await exportProjectBackup(current.id);
      if (
        !alive.current ||
        epoch !== generation.current ||
        latest.current.disabled ||
        !latest.current.beforeExport()
      )
        return;
      const json = serializeProjectBackup(saved);
      const url = URL.createObjectURL(
        new Blob([json], { type: "application/json;charset=utf-8" }),
      );
      setDownload({
        url,
        name: `${current.name.replace(/\.html?$/i, "")}.opendesign.json`,
      });
    } catch (e) {
      if (alive.current && epoch === generation.current)
        setError(e instanceof Error ? e.message : "备份失败，请重试。");
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const restore = async (file?: File) => {
    if (
      !file ||
      busyRef.current ||
      latest.current.disabled ||
      !latest.current.beforeRestore()
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (file.size > MAX_BACKUP_BYTES)
        throw new Error("备份文件超过 20 MiB，请选择较小的项目备份。");
      const json = await file.text();
      if (
        !alive.current ||
        latest.current.disabled ||
        !latest.current.beforeRestore()
      )
        return;
      const backup = parseProjectBackup(json);
      const restored = await restoreProjectBackup(backup);
      if (alive.current) latest.current.onRestored(restored);
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "恢复失败，请重试。原文档未改动。",
        );
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <details className="backup-menu">
      <summary>备份与恢复</summary>
      <p>包含已保存版本和批注，不含草稿或未提交内容。</p>
      <div className="backup-actions">
        <button
          disabled={disabled || busy || !record}
          onClick={() => void makeBackup()}
        >
          备份当前文档
        </button>
        <button
          disabled={disabled || busy}
          onClick={() => {
            if (!latest.current.beforeRestore()) return;
            input.current?.click();
          }}
        >
          恢复备份
        </button>
        <input
          ref={input}
          hidden
          type="file"
          accept=".json,application/json"
          aria-label="选择项目备份"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void restore(file);
          }}
        />
      </div>
      {busy && <p role="status">处理中…</p>}
      {download && (
        <a
          className="backup-download"
          href={download.url}
          download={download.name}
        >
          下载项目备份
        </a>
      )}
      {error && (
        <p className="backup-error" role="alert">
          {error}
        </p>
      )}
      <small>恢复为新副本，不覆盖原件。仅限项目 JSON，不是离线资源包。</small>
    </details>
  );
}
