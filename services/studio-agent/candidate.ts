import { inspectHtml } from "../../src/html";
import { proposeText, type StudioVersion, type TextProposal } from "../../src/studio-model";

export function selectionContext(version: StudioVersion, targetId: string): { id: string; tag: string; text: string } {
  if (!version || typeof version.source !== "string" || version.source.length > 200000 ||
      typeof version.id !== "string" || !version.id || version.id.length > 100) {
    throw new Error("Studio 草稿无效，源文件最多 200000 字符。");
  }
  if (typeof targetId !== "string" || !targetId) throw new Error("请选择有效的文字对象。");
  const target = inspectHtml(version.source).targets.find(item => item.id === targetId);
  if (!target) throw new Error("所选文字对象不存在，请重新选择。");
  // Send only the selected text to the model; source offsets and surrounding HTML stay local.
  return { id: target.id, tag: target.tag, text: target.text };
}

export function buildCandidate(version: StudioVersion, targetId: string, after: string): TextProposal {
  selectionContext(version, targetId);
  if (typeof after !== "string") throw new Error("修改候选必须是文字。");
  return proposeText(version, targetId, after);
}
