import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/docs/",
  plugins: [react()],
  build: { manifest: true },
  test: { environment: "node" },
});
