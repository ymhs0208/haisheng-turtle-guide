import { getConfig } from "./config.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** True when a remote OpenAI-compatible key is configured and mock is not forced. */
export function remoteLlmEnabled(): boolean {
  return getConfig().llmProvider === "openai" && Boolean(getConfig().openaiKey);
}

export async function chatComplete(messages: ChatMessage[], temperature = 0.3): Promise<string> {
  const config = getConfig();
  const response = await fetch(`${config.openaiBase}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openaiModel,
      temperature,
      messages,
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`模型服務回應 ${response.status}`);
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("模型沒有回應");
  return text;
}

export async function* chatStream(messages: ChatMessage[], temperature = 0.3): AsyncGenerator<string> {
  const config = getConfig();
  const response = await fetch(`${config.openaiBase}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openaiModel,
      temperature,
      stream: true,
      messages,
    }),
    signal: AbortSignal.timeout(40000),
  });
  if (!response.ok || !response.body) throw new Error(`模型服務回應 ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // ignore a partial SSE frame
      }
    }
  }
}

export async function embedRemote(texts: string[]): Promise<number[][]> {
  const config = getConfig();
  const response = await fetch(`${config.openaiBase}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: config.embeddingModel, input: texts }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`嵌入服務回應 ${response.status}`);
  const data = (await response.json()) as { data?: { embedding?: number[]; index?: number }[] };
  const rows = data.data ?? [];
  rows.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const vectors = rows.map((row) => row.embedding).filter((item): item is number[] => Array.isArray(item));
  if (vectors.length !== texts.length) throw new Error("嵌入格式錯誤");
  return vectors;
}
