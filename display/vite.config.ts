import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const api = process.env.API_PROXY || "http://127.0.0.1:43125";

export default defineConfig({
  base: process.env.NODE_ENV === "production" ? "/display/" : "/",
  plugins: [react()],
  resolve: { alias: { "@scene": path.resolve(__dirname, "../packages/scene") } },
  server: {
    host: "0.0.0.0",
    port: 43124,
    fs: { allow: [path.resolve(__dirname, "..")] },
    proxy: {
      "/api": { target: api, changeOrigin: true },
      "/ws": { target: api, ws: true, changeOrigin: true },
    },
  },
  preview: { host: "0.0.0.0", port: 43124 },
});
