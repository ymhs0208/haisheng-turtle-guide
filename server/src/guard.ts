export type GuardLabel = "on_topic" | "small_talk" | "off_topic" | "unsafe" | "unsure";

const UNSAFE = [
  /ignore\s+(all\s+)?(previous|above|prior)\s+instructions/i,
  /system\s+prompt/i,
  /developer\s+mode/i,
  /jailbreak/i,
  /忽略(之前|以上|前面|先前)(所有)?(的)?(指令|規則|提示)/,
  /無視(之前|以上|系統)/,
  /系統提示/,
  /開發者模式/,
  /越獄/,
  /沒有限制的模型/,
  /重複你的(系統)?提示/,
  /把你的(規則|提示)印出來/,
  /<\s*\/?\s*script/i,
  /\[(?:system|INST)\]/i,
];

const OFF_TOPIC = [
  /總統|選舉|政黨|政治|股票|比特幣|股價/,
  /作業|數學|考題|幫我寫|代寫/,
  /程式|python|爬蟲|代碼|程式碼/i,
  /藥|頭痛|生病|診斷|癌症|處方|就醫/,
  /電影|食譜|天氣|新聞/,
];

const MARINE =
  /珊瑚|蟲黃|白化|礁|海龜|綠蠵龜|蠵龜|海草|產卵|稚龜|深海|熱泉|生物發光|水壓|化學合成|管蟲|鯨|鯊|水母|塑膠|保育|迴游|洄游|藻|貝|魚|海洋|海水|海底|展區|海生館|小綠/;

const SMALL_TALK = /你好|哈囉|嗨|您好|早安|午安|晚安|謝謝|感謝|掰|再見|拜拜|你是誰|你好嗎|在嗎|笑話|你叫什麼|哈哈|好累|無聊|開心/;

export function classifyByRules(text: string): GuardLabel {
  const message = text.trim();
  if (!message) return "unsure";
  if (UNSAFE.some((pattern) => pattern.test(message))) return "unsafe";
  if (OFF_TOPIC.some((pattern) => pattern.test(message))) return "off_topic";
  if (MARINE.test(message)) return "on_topic";
  if (SMALL_TALK.test(message) && message.length <= 40) return "small_talk";
  if (/[？?]/.test(message) || /為什麼|如何|什麼|怎麼/.test(message)) return "off_topic";
  if (message.length <= 16) return "small_talk";
  return "unsure";
}

export function parseGuardLabel(text: string): Exclude<GuardLabel, "unsure"> | null {
  const found = text.match(/on_topic|small_talk|off_topic|unsafe/);
  return (found?.[0] as Exclude<GuardLabel, "unsure"> | undefined) ?? null;
}

export async function classifyQuestion(
  text: string,
  ask?: (prompt: string) => Promise<string>,
): Promise<Exclude<GuardLabel, "unsure">> {
  const ruled = classifyByRules(text);
  if (ruled !== "unsure") return ruled;
  if (!ask) return "off_topic";
  try {
    const raw = await ask(
      `把下面這句話分成一類，只回答 on_topic、small_talk、off_topic、unsafe 其中一個詞。\n${text.slice(0, 400)}`,
    );
    return parseGuardLabel(raw) ?? "off_topic";
  } catch {
    return "off_topic";
  }
}

const LEAK = /系統提示|system prompt|你只做海洋生態|不要透露、複誦|developer message|【1】以下是檢索/i;

export function filterOutput(text: string, refusal: string): string {
  const clean = text.replace(/\u0000/g, "").trim();
  if (!clean) return refusal;
  if (LEAK.test(clean)) return refusal;
  return clean.slice(0, 1200);
}

const hits = new Map<string, number[]>();

export function allowRequest(key: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

export const MAX_INPUT_CHARS = 400;
