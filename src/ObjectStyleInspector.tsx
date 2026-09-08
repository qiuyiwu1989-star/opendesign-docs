import { useState } from "react";
import { composingKey } from "./editing-keys";

export type ObjectStylePatch = {
  fontSize?: number;
  color?: string;
  bold?: boolean;
  align?: "left" | "center" | "right";
};

export function ObjectStyleInspector({
  disabled,
  onDraft,
  onApply,
}: {
  disabled: boolean;
  onDraft: (dirty: boolean) => void;
  onApply: (patch: ObjectStylePatch) => void;
}) {
  const [values, setValues] = useState({
    size: "",
    color: "",
    bold: "",
    align: "",
  });
  const dirty = Object.values(values).some(Boolean);
  const cancel = () => {
    setValues({ size: "", color: "", bold: "", align: "" });
    onDraft(false);
  };
  const change = (key: keyof typeof values, value: string) => {
    const next = { ...values, [key]: value };
    setValues(next);
    onDraft(Object.values(next).some(Boolean));
  };
  return (
    <section
      className="object-style-inspector"
      aria-label="对象文字样式"
      onKeyDown={(e) => {
        if (
          e.key !== "Escape" ||
          composingKey(e.nativeEvent) ||
          !dirty ||
          disabled
        )
          return;
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }}
    >
      <h2 title="统一此对象的文字样式；未填写的项目保留原样">文字样式</h2>
      <div className="object-style-fields">
        <label>
          字号
          <input
            aria-label="对象字号"
            type="number"
            min="8"
            max="200"
            placeholder="原样"
            value={values.size}
            disabled={disabled}
            onChange={(e) => change("size", e.target.value)}
          />
        </label>
        <div className="object-color-field">
          <span>颜色</span>
          <div className="object-color-controls">
            <input
              aria-label="对象文字颜色"
              placeholder="原样"
              value={values.color}
              disabled={disabled}
              onChange={(e) => change("color", e.target.value)}
            />
            <label className="object-color-picker" title="选择颜色">
              <span aria-hidden="true">A</span>
              <input
                type="color"
                aria-label="选择文字颜色"
                value={
                  /^#[0-9a-f]{6}$/i.test(values.color)
                    ? values.color
                    : "#000000"
                }
                disabled={disabled}
                onChange={(e) => change("color", e.target.value)}
              />
            </label>
          </div>
        </div>
        <label>
          字重
          <select
            aria-label="对象字重"
            value={values.bold}
            disabled={disabled}
            onChange={(e) => change("bold", e.target.value)}
          >
            <option value="">原样</option>
            <option value="true">粗体</option>
            <option value="false">常规</option>
          </select>
        </label>
        <label>
          对齐
          <select
            aria-label="对象文字对齐"
            value={values.align}
            disabled={disabled}
            onChange={(e) => change("align", e.target.value)}
          >
            <option value="">原样</option>
            <option value="left">左对齐</option>
            <option value="center">居中</option>
            <option value="right">右对齐</option>
          </select>
        </label>
      </div>
      {dirty && (
        <div className="text-run-actions">
          <button
            className="primary"
            disabled={disabled}
            onClick={() =>
              onApply({
                ...(values.size ? { fontSize: Number(values.size) } : {}),
                ...(values.color ? { color: values.color.trim() } : {}),
                ...(values.bold ? { bold: values.bold === "true" } : {}),
                ...(values.align
                  ? { align: values.align as "left" | "center" | "right" }
                  : {}),
              })
            }
          >
            应用样式
          </button>
          <button disabled={disabled} onClick={cancel} title="取消样式（Esc）">
            取消
          </button>
        </div>
      )}
    </section>
  );
}
