import { defineConfig } from "vitest/config";
import { thinkingCanvasPlugin } from "./services/thinking-canvas/plugin";
import react from "@vitejs/plugin-react";
import { studioAgentJobsPlugin } from "./services/studio-agent/jobs-plugin";
import { studioAgentProxyTarget } from "./services/studio-agent/proxy";

export default defineConfig(() => {
  const target = studioAgentProxyTarget(process.env.STUDIO_AGENT_URL);
  return {
    base: "/docs/",
    plugins: [react(), thinkingCanvasPlugin(), ...(target ? [] : [studioAgentJobsPlugin()])],
    ...(target ? {server:{proxy:{'/api/studio-agent':{target,changeOrigin:false}}}} : {}),
    build: { manifest: true, modulePreload: { resolveDependencies: (url, deps) => url.includes("ThinkingCanvas") ? [] : deps } },
    test: { environment: "node" },
  };
});
