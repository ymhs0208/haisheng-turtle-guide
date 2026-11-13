import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const api = process.env.API_PROXY || "http://127.0.0.1:43125";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@scene": path.resolve(__dirname, "../packages/scene"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 43123,
    fs: { allow: [path.resolve(__dirname, "..")] },
    proxy: {
      "/api": { target: api, changeOrigin: true },
      "/ws": { target: api, ws: true, changeOrigin: true, rewriteWsOrigin: true },
    },
  },
  preview: { host: "0.0.0.0", port: 43123 },
});
