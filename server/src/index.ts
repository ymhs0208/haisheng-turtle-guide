import { createApp } from "./app.js";
import { getConfig, loadEnvFile } from "./config.js";

loadEnvFile();
const config = getConfig();
const ctx = await createApp();

const server = ctx.httpServer.listen(config.port, "0.0.0.0", () => {
  console.log(`小綠導覽 API  http://127.0.0.1:${config.port}`);
  console.log(`資料 ${ctx.store.kind}／向量 ${ctx.store.vectorMode}／模型 ${config.llmProvider}`);
});

server.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

async function shutdown(): Promise<void> {
  await ctx.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
