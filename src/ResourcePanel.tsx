import { useState } from "react";
import { deferredFeature } from "./deferred-feature";
import "./resources.css";

export type ResourcePanelProps = {
  source: string;
  disabled: boolean;
  contextKey: string;
  onApply: (expected: string, next: string) => void;
};
const Tools = deferredFeature<ResourcePanelProps>(() => import("./ResourcePanelBody").then(m => ({ default: m.ResourcePanelBody })), "资源工具");

export function ResourcePanel(props: ResourcePanelProps) {
  const [activated, setActivated] = useState(false);
  return <details className="resource-panel" onToggle={event => {
    if (event.currentTarget.open) setActivated(true);
  }}>
    <summary>资源</summary>
    {activated && <Tools {...props} />}
  </details>;
}
