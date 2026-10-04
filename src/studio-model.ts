import { inspectHtml, patchText } from "./html";

export type Brief = { title: string; audience: string; goal: string; materials: string; scenario?: "enterprise" | "course" };
export type StudioVersion = { id: string; source: string; label: string };
export type StudioDraft = { brief: Brief; outline: string[]; versions: StudioVersion[] };
export type TextProposal = { baseId: string; baseSource: string; targetId: string; before: string; after: string };
export const STUDIO_KEY = "opendesign-studio-draft-v1";
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function outlineFor(brief: Brief): string[] {
  if (!brief.title.trim() || !brief.audience.trim() || !brief.goal.trim()) throw new Error("请填写主题、受众和目标。");
  return [brief.title.trim(), "目标与受众", "已有材料", "核心观点（待完善）", "下一步与待确认事项"];
}
export function createStructure(brief: Brief, outline: string[]): string {
  outlineFor(brief);
  if (outline.length < 2 || outline.length > 12 || outline.some(t => !t.trim() || t.length > 40 || /[\r\n]/.test(t))) throw new Error("请提供 2–12 页大纲，每页标题不超过 40 字。");
  if (brief.title.length > 40 || brief.audience.length > 80 || brief.goal.length > 150 || brief.materials.length > 240) throw new Error("请精简输入：主题 40 字、受众 80 字、目标 150 字、材料摘要 240 字以内。");
  const paragraphFor = (title: string) => title === brief.title.trim() ? brief.goal : title === "目标与受众" ? `面向：${brief.audience}\n希望达成：${brief.goal}` : title === "已有材料" ? (brief.materials || "尚未提供材料，请在此补充。") : "请补充这一页的观点、依据和行动。";
  if (outline.some(title => paragraphFor(title).split(/\r\n|\r|\n/).length > 6)) throw new Error("每页正文最多 6 行，请精简换行或拆分页面。");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escape(brief.title)}</title><style>*{box-sizing:border-box}body{margin:0;background:#e9ece7;color:#233b35;font-family:-apple-system,"PingFang SC",sans-serif}.slide{position:relative;width:1280px;min-height:720px;margin:24px auto;padding:50px 85px;background:#faf8f1}h1,h2{font-size:40px;line-height:1.25;margin:20px 0;overflow-wrap:anywhere}p{font-size:22px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}small{font-size:18px;color:#65796d}</style></head><body>${outline.map((title,i)=>`<section class="slide"><small>结构草稿 · 内容待完善 · ${i+1}/${outline.length}</small><${i?'h2':'h1'}>${escape(title)}</${i?'h2':'h1'}><p>${escape(paragraphFor(title))}</p></section>`).join("")}</body></html>`;
}
export function proposeText(version: StudioVersion, targetId: string, after: string): TextProposal {
  const target = inspectHtml(version.source).targets.find(t => t.id === targetId);
  if (!target || !after.trim() || after.length > 3000) throw new Error("请选择文字并填写 1–3000 字替换内容。");
  const heading = /^h[1-6]$/.test(target.tag);
  const limit = heading ? 40 : target.tag === "small" ? 80 : 300;
  const lines = heading || target.tag === "small" ? 2 : 6;
  if (after.length > limit || after.split(/\r\n|\r|\n/).length > lines) throw new Error(`结构草稿此处最多 ${limit} 字、${lines} 行，请拆分到其他页面。`);
  if (after === target.text) throw new Error("文字没有变化。");
  return { baseId: version.id, baseSource: version.source, targetId, before: target.text, after };
}
export function applyProposal(current: StudioVersion, proposal: TextProposal): string {
  if (current.id !== proposal.baseId || current.source !== proposal.baseSource) throw new Error("草稿版本已变化，请重新预览修改。");
  const target = inspectHtml(current.source).targets.find(t => t.id === proposal.targetId);
  if (!target || target.text !== proposal.before) throw new Error("原文已变化，请重新选择。");
  return patchText(current.source, target, proposal.after);
}
export function readStudioDraft(raw: string | null): StudioDraft | null {
  if (!raw) return null;
  const value = JSON.parse(raw) as StudioDraft;
  if (!value || !value.brief || ![value.brief.title,value.brief.audience,value.brief.goal,value.brief.materials].every(v=>typeof v==='string' && v.length<=3000) || !Array.isArray(value.outline) || value.outline.length>12 || !value.outline.every(v=>typeof v==='string' && v.length<=80) || !Array.isArray(value.versions) || value.versions.length>20 || !value.versions.every(v=>v && typeof v.id==='string' && typeof v.label==='string' && typeof v.source==='string' && v.source.length<=200000)) throw new Error("本机 Studio 草稿格式无效，未覆盖原始记录。");
  if (Object.hasOwn(value.brief, "scenario") && value.brief.scenario !== "enterprise" && value.brief.scenario !== "course") throw new Error("Studio 场景无效，请选择企业提案或课程设计。");
  if (new Set(value.versions.map(v=>v.id)).size !== value.versions.length || value.versions.some(v=>!v.id || v.id.length>100 || v.label.length>200)) throw new Error("草稿版本标识无效。");
  return { brief: { title:value.brief.title,audience:value.brief.audience,goal:value.brief.goal,materials:value.brief.materials, ...(value.brief.scenario ? { scenario: value.brief.scenario } : {}) }, outline:[...value.outline], versions:value.versions.map(v=>({id:v.id,label:v.label,source:v.source})) };
}
