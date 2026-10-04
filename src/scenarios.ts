import teacher from "../examples/scenarios/teacher-information-literacy.html?raw";
import worksheet from "../examples/scenarios/teacher-activity-sheet.html?raw";
import enterprise from "../examples/scenarios/enterprise-handoff-pilot.html?raw";
import type { HandoffItem } from "./handoff";

// Authored synthetic examples, never presented as live AI output.
export function scenarioDocuments(kind: "teacher" | "enterprise"): HandoffItem[] {
  return kind === "teacher"
    ? [{ name: "信息判断课.html", source: teacher, label: "课程样板副本" },
      { name: "信息判断活动单.html", source: worksheet, label: "活动单样板副本" }]
    : [{ name: "服务交接试点提案.html", source: enterprise, label: "提案样板副本" }];
}
