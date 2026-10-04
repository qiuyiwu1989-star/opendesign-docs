import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { studioAgentJobsPlugin } from "./services/studio-agent/jobs-plugin";
import { studioAgentProxyTarget } from "./services/studio-agent/proxy";

export default defineConfig(() => {
  const target = studioAgentProxyTarget(process.env.STUDIO_AGENT_URL);
  return {
    base: "/docs/",
    plugins: [react(), ...(target ? [] : [studioAgentJobsPlugin()])],
    ...(target ? {server:{proxy:{'/api/studio-agent':{target,changeOrigin:false}}}} : {}),
    build: { manifest: true },
    test: { environment: "node" },
  };
});
