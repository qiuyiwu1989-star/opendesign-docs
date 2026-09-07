import { useState } from "react";
import type { TextRuns } from "./text-runs";

export function TextRunInspector({
  target,
  disabled,
  onDraft,
  onApply,
}: {
  target: TextRuns;
  disabled: boolean;
  onDraft: (dirty: boolean) => void;
  onApply: (values: string[]) => void;
}) {
  const [values, setValues] = useState(() => target.runs.map((r) => r.text));
  const dirty = values.some((v, i) => v !== target.runs[i]!.text);
  return (
    <section className="text-run-inspector" aria-label="保留格式改字">
      <h2>文字</h2>
      {target.reason ? (
        <p>{target.reason}</p>
      ) : (
        <>
          {target.runs.map((run, i) => (
            <label key={i}>
              <span>
                第 {run.line} 行
                {target.runs.length > 1 ? ` · 文字 ${i + 1}` : ""}
              </span>
              <textarea
                aria-label={`文字 ${i + 1}`}
                rows={2}
                maxLength={100000}
                disabled={disabled}
                value={values[i]}
                onChange={(e) => {
                  const next = values.map((v, j) =>
                    i === j ? e.target.value : v,
                  );
                  setValues(next);
                  onDraft(next.some((v, j) => v !== target.runs[j]!.text));
                }}
              />
            </label>
          ))}
          <div className="text-run-actions">
            <button
              className="primary"
              disabled={disabled || !dirty}
              onClick={() => onApply(values)}
            >
              应用文字
            </button>
            {dirty && (
              <button
                disabled={disabled}
                onClick={() => {
                  setValues(target.runs.map((r) => r.text));
                  onDraft(false);
                }}
              >
                取消改字
              </button>
            )}
          </div>
          {dirty && <p role="status">文字未应用</p>}
        </>
      )}
    </section>
  );
}
