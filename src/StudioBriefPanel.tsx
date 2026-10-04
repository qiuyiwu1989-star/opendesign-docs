import type { Brief } from "./studio-model";

/** Controlled brief fields. Scene selection never resets user-authored material. */
export function StudioBriefPanel({ brief, onChange }: { brief: Brief; onChange: (brief: Brief) => void }) {
  const course = brief.scenario === "course";
  const enterprise = brief.scenario === "enterprise";
  return <div className="studio-brief">
    <h3>这份方案，为谁解决什么问题？</h3>
    <p>先明确方向，再组织页面内容。</p>
    <div role="group" aria-label="创作场景" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      <button type="button" aria-pressed={enterprise} onClick={() => onChange({ ...brief, scenario: "enterprise" })}>企业提案</button>
      <button type="button" aria-pressed={course} onClick={() => onChange({ ...brief, scenario: "course" })}>课程设计</button>
    </div>
    <p role="status">{course ? "明确学习者、学习目标与教学材料，组织可实施的课程方案。" : enterprise ? "明确决策对象、预期行动与业务材料，组织有依据的企业提案。" : "尚未选择场景。原有内容保留，可选择企业提案或课程设计。"}</p>
    <label>主题<input placeholder={course ? "例如：七年级信息判断课" : enterprise ? "例如：服务交接试点提案" : "填写方案主题"} maxLength={40} value={brief.title} onChange={e => onChange({ ...brief, title: e.target.value })} /></label>
    <label>受众<input placeholder={course ? "例如：七年级学生" : enterprise ? "例如：业务负责人" : "这份方案面向谁"} maxLength={80} value={brief.audience} onChange={e => onChange({ ...brief, audience: e.target.value })} /></label>
    <label>目标<textarea placeholder={course ? "学习者完成后，能够做什么？" : enterprise ? "希望受众作出什么决策或行动？" : "希望这份方案达成什么"} maxLength={150} value={brief.goal} onChange={e => onChange({ ...brief, goal: e.target.value })} /></label>
    <label>材料摘要（240 字以内）<textarea placeholder={course ? "已有案例、学习材料与课堂约束" : enterprise ? "已有事实、证据与执行约束" : "已有材料与约束"} maxLength={240} value={brief.materials} onChange={e => onChange({ ...brief, materials: e.target.value })} /></label>
  </div>;
}
