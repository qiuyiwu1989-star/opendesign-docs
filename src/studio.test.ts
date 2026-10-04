import { describe, expect, it } from "vitest";
import { applyProposal, createStructure, outlineFor, proposeText, readStudioDraft } from "./studio-model";
import { inspectHtml } from "./html";
const brief = {title:"课程 <草稿>",audience:"学生",goal:"学会查证",materials:"A & B 是示例"};
describe("Studio version-safe text proposals",()=>{
  it("escapes user material and rejects oversized outlines",()=>{
    const source=createStructure(brief,outlineFor(brief));
    expect(source).toContain('课程 &lt;草稿&gt;');expect(source).toContain('A &amp; B');
    expect(()=>createStructure(brief,['单页'])).toThrow();
  });
  it("changes only the chosen source span, preserving manual text elsewhere",()=>{
    const source=createStructure(brief,outlineFor(brief));
    const v={id:'v1',source,label:'草稿'},t=inspectHtml(source).targets.find(t=>t.text==='A & B 是示例')!;
    const result=applyProposal(v,proposeText(v,t.id,'人工补充 <证据>'));
    expect(result).toBe(source.replace('A &amp; B 是示例','人工补充 &lt;证据&gt;'));
  });
  it("rejects stale version identities and same-id source changes",()=>{
    const v={id:'v1',source:'<p>手工预算</p><p>时间线</p>',label:'原稿'};
    const proposal=proposeText(v,inspectHtml(v.source).targets[1]!.id,'四周');
    expect(()=>applyProposal({...v,id:'v2'},proposal)).toThrow('版本');
    expect(()=>applyProposal({...v,source:v.source.replace('手工预算','新预算')},proposal)).toThrow('版本');
  });
  it("validates restored draft records without silently erasing corrupt storage",()=>{
    expect(readStudioDraft(null)).toBeNull();
    expect(()=>readStudioDraft('{')).toThrow();
    expect(()=>readStudioDraft(JSON.stringify({brief,outline:[],versions:[{}]}))).toThrow();
    const draft={brief,outline:outlineFor(brief),versions:[{id:'v1',label:'初稿',source:'<p>保留</p>'}]};
    expect(readStudioDraft(JSON.stringify(draft))).toEqual(draft);
  });
});

describe("Studio outline content and layout bounds",()=>{
 it("keeps source material with its heading after reordering",()=>{
  const source=createStructure(brief,['已有材料',brief.title,'目标与受众']);
  expect(source).toContain('<h1>已有材料</h1><p>A &amp; B 是示例</p>');
  expect(source).toContain('<h2>课程 &lt;草稿&gt;</h2><p>学会查证</p>');
 });
 it("rejects long replacement headings and excessive line breaks",()=>{
  const v={id:'1',label:'草稿',source:'<h1>标题</h1><p>正文</p>'};
  expect(()=>proposeText(v,inspectHtml(v.source).targets[0]!.id,'字'.repeat(41))).toThrow('40');
  expect(()=>proposeText(v,inspectHtml(v.source).targets[1]!.id,'行\n'.repeat(7))).toThrow('6');
 });
});

it("rejects excessive line breaks in initial material and combined audience/goal",()=>{
 expect(()=>createStructure({...brief,materials:'材料\n'.repeat(7)},outlineFor(brief))).toThrow('6 行');
 expect(()=>createStructure({...brief,audience:'学生\n'.repeat(4),goal:'目标\n'.repeat(3)},outlineFor(brief))).toThrow('6 行');
});

describe("Studio explicit scenario compatibility", () => {
  const draft = { brief, outline: outlineFor(brief), versions: [{ id: "v1", label: "保留版本", source: "<p>原始内容</p>" }] };
  it("restores legacy briefs without inferring a scenario from title or audience", () => {
    const restored = readStudioDraft(JSON.stringify(draft))!;
    expect(restored).toEqual(draft);
    expect(Object.hasOwn(restored.brief, "scenario")).toBe(false);
  });
  it.each(["enterprise", "course"] as const)("preserves %s through canonical save and restore", scenario => {
    const expected = { ...draft, brief: { ...brief, scenario } };
    const once = readStudioDraft(JSON.stringify(expected));
    expect(readStudioDraft(JSON.stringify(once))).toEqual(expected);
    expect(once!.outline).toEqual(draft.outline);
    expect(once!.versions).toEqual(draft.versions);
  });
  it.each(["", "unknown", "Enterprise", null, 1, {}, []])("rejects invalid scenario %j without stripping it silently", scenario => {
    expect(() => readStudioDraft(JSON.stringify({ ...draft, brief: { ...brief, scenario } }))).toThrow("场景无效");
  });
});
