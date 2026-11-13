import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** 只補上尚未存在的環境變數，不覆蓋程序已設定的值。 */
export function loadEnvFile(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../.env"),
    path.resolve(here, "../../.env"),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!/^[A-Z0-9_]+$/.test(key)) continue;
      if (process.env[key] != null) continue;
      process.env[key] = stripQuotes(trimmed.slice(eq + 1));
    }
    return;
  }
}

export interface AppConfig {
  port: number;
  databaseUrl: string;
  llmProvider: "mock" | "openai";
  embeddingProvider: "local" | "openai";
  openaiKey: string;
  openaiBase: string;
  openaiModel: string;
  embeddingModel: string;
  embedDim: number;
  allowGroupOverride: boolean;
  adminToken: string;
}

export function getConfig(): AppConfig {
  const key = (process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  const forcedMock = process.env.LLM_PROVIDER === "mock";
  const llmProvider = key && !forcedMock ? "openai" : "mock";
  const embedRemote = llmProvider === "openai" && process.env.EMBEDDING_PROVIDER !== "local";
  const embeddingProvider = embedRemote ? "openai" : "local";
  const embedDim = Number(process.env.EMBED_DIM || (embeddingProvider === "local" ? 64 : 1536));
  return {
    port: Number(process.env.PORT || 43125),
    databaseUrl: process.env.DATABASE_URL?.trim() || "",
    llmProvider,
    embeddingProvider,
    openaiKey: key,
    openaiBase: (process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    openaiModel: process.env.LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
    embeddingModel: process.env.EMBED_MODEL || process.env.EMBEDDING_MODEL || "text-embedding-3-small",
    embedDim: Number.isFinite(embedDim) && embedDim > 0 ? embedDim : 64,
    allowGroupOverride: process.env.ALLOW_GROUP_OVERRIDE !== "0",
    adminToken: process.env.ADMIN_TOKEN?.trim() || "",
  };
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** 每次讀取，測試可在開賽前改環境變數。 */
export function getTimings() {
  return {
    announce: num("SHOW_ANNOUNCE_MS", 8000),
    answer: num("SHOW_ANSWER_MS", 20000),
    results: num("SHOW_RESULTS_MS", 8000),
    explain: num("SHOW_EXPLAIN_MS", 18000),
  };
}

export function resolveJsonPath(): string {
  if (process.env.JSON_STORE_PATH?.trim()) {
    return path.resolve(process.env.JSON_STORE_PATH);
  }
  if (existsSync(path.resolve(process.cwd(), "server"))) {
    return path.resolve(process.cwd(), "server/data/runtime.json");
  }
  return path.resolve(process.cwd(), "data/runtime.json");
}
