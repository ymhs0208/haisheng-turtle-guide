import { randomUUID } from "node:crypto";
import { chunkDocument } from "./embed.js";
import { embedText, fixedReply, generateReply, type LlmChunk } from "./llm.js";
import { cosine, localEmbed } from "./embed.js";
import type { ContentRepo } from "./content.js";
import type { Store } from "./store.js";
import type { Session } from "./types.js";

export type Intent = "injection" | "offtopic" | "chitchat" | "knowledge";

const INJECTION = [
  /ignore\s+(all\s+)?(previous|above|prior)\s+instructions/i,
  /system\s+prompt/i,
  /developer\s+mode/i,
  /jailbreak/i,
  /忽略(之前|以上|前面|先前)(所有)?(的)?(指令|規則|提示)/,
  /無視(之前|以上|系統)/,
  /系統提示/,
  /開發者模式/,
  /越獄/,
  /<\s*\/?\s*script/i,
  /\[(?:system|INST)\]/i,
];

const MARINE =
  /珊瑚|蟲黃|白化|礁|海龜|綠蠵龜|蠵龜|海草|產卵|稚龜|深海|熱泉|生物發光|水壓|化學合成|管蟲|鯨|鯊|水母|塑膠|保育|迴游|洄游|藻|貝|魚|海洋|海水|海底|展區|海生館|小綠/;

const CHITCHAT =
  /你好|哈囉|嗨|您好|早安|午安|晚安|謝謝|感謝|掰|再見|拜拜|你是誰|你好嗎|在嗎|笑話|你叫什麼/;

const OFFTOPIC = /總統|選舉|股票|比特幣|作業代寫|寫程式|python|天氣|食譜|電影|政治|新聞|股價/i;

export const RETRIEVAL_THRESHOLD = 0.18;
const ZONE_BOOST = 0.08;

export function routeIntent(text: string): Intent {
  const message = text.trim();
  if (INJECTION.some((pattern) => pattern.test(message))) return "injection";
  if (MARINE.test(message)) return "knowledge";
  if (OFFTOPIC.test(message)) return "offtopic";
  if (CHITCHAT.test(message) && message.length <= 40) return "chitchat";
  if (/[？?]/.test(message) || /為什麼|如何|什麼/.test(message)) return "offtopic";
  if (message.length <= 16) return "chitchat";
  return "offtopic";
}

export interface RankedChunk extends LlmChunk {
  tags: string[];
  raw: number;
  score: number;
}

export async function retrieve(
  store: Store,
  content: ContentRepo,
  query: string,
  zoneId: string | null,
): Promise<RankedChunk[]> {
  const embedding = await embedText(query);
  const stored = await store.searchChunks(embedding, 24);
  const overrides = await store.listOverrides();
  const extras: RankedChunk[] = [];
  for (const override of overrides) {
    const located = content.locateConcept(override.conceptId);
    if (!located || !override.summary?.trim()) continue;
    const title = `${override.title?.trim() || located.concept.title}（館方更新）`;
    const body = override.summary.trim();
    const tags = [located.zone.name, located.concept.title];
    const vector = await embedText(chunkDocument(title, body, tags));
    extras.push({
      id: `override-${override.conceptId}`,
      zoneId: located.zone.id,
      title,
      body,
      tags,
      raw: cosine(embedding, vector),
      score: 0,
    });
  }
  const merged = [...stored.map((item) => ({ ...item, score: item.raw })), ...extras];
  return merged
    .filter((item) => item.raw >= RETRIEVAL_THRESHOLD)
    .map((item) => ({ ...item, score: item.raw + (item.zoneId === zoneId ? ZONE_BOOST : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export function buildMemoryNote(session: Session, content: ContentRepo): { note: string; conceptId: string } | null {
  const conceptId = [...session.wrongConceptIds].reverse().find((id) => !session.mentionedMemoryIds.includes(id));
  if (!conceptId) return null;
  const located = content.locateConcept(conceptId);
  if (!located) return null;
  if (session.currentZoneId && located.zone.id === session.currentZoneId) return null;
  return {
    conceptId,
    note: `我記得你在「${located.zone.name}」的「${located.concept.title}」還有點不確定。`,
  };
}

export async function answerChat(input: {
  store: Store;
  content: ContentRepo;
  session: Session;
  message: string;
  style?: "chat" | "box";
  includeMemory?: boolean;
  persist?: boolean;
}): Promise<{
  reply: string;
  intent: Intent;
  sources: { id: string; title: string; zoneId: string }[];
  provider: string;
}> {
  const style = input.style ?? "chat";
  const persist = input.persist ?? style === "chat";
  const includeMemory = (input.includeMemory ?? style === "chat") && persist;
  const message = input.message.trim().slice(0, 500);
  const intent = routeIntent(message);
  const ageGroup = style === "box" ? "adult" : input.session.ageGroup;
  let sources: RankedChunk[] = [];
  let reply = "";
  let provider = "guard";

  if (intent === "injection" || intent === "offtopic") {
    reply = fixedReply(intent);
  } else if (intent === "chitchat") {
    const generated = await generateReply({
      kind: "chitchat",
      message,
      nickname: input.session.nickname,
      ageGroup,
      chunks: [],
      history: persist ? await historyOf(input.store, input.session.id) : [],
      style,
    });
    reply = generated.text;
    provider = generated.provider;
  } else {
    sources = await retrieve(input.store, input.content, message, input.session.currentZoneId);
    if (sources.length === 0) {
      reply = fixedReply("unknown");
      provider = "guard";
    } else {
      const generated = await generateReply({
        kind: "knowledge",
        message,
        nickname: input.session.nickname,
        ageGroup,
        chunks: sources,
        history: persist ? await historyOf(input.store, input.session.id) : [],
        style,
      });
      reply = generated.text;
      provider = generated.provider;
    }
  }

  const memory = includeMemory && (intent === "knowledge" || intent === "chitchat")
    ? buildMemoryNote(input.session, input.content)
    : null;
  if (memory) {
    reply = `${memory.note}${reply}`;
  }

  const publicSources = (intent === "knowledge" ? sources : []).map((item) => ({
    id: item.id,
    title: item.title,
    zoneId: item.zoneId,
  }));

  if (persist) {
    const next: Session = {
      ...input.session,
      askedQuestions: [...input.session.askedQuestions, message].slice(-20),
      mentionedMemoryIds: memory
        ? [...input.session.mentionedMemoryIds, memory.conceptId]
        : input.session.mentionedMemoryIds,
    };
    await input.store.saveSession(next);
    const now = Date.now();
    await input.store.addChat({
      id: randomUUID(),
      sessionId: input.session.id,
      role: "user",
      content: message,
      sources: [],
      intent,
      ts: now,
    });
    await input.store.addChat({
      id: randomUUID(),
      sessionId: input.session.id,
      role: "assistant",
      content: reply,
      sources: publicSources,
      intent,
      ts: now + 1,
    });
    await input.store.addEvent({
      id: randomUUID(),
      ts: now,
      sessionId: input.session.id,
      type: "chat",
      payload: {
        zoneId: input.session.currentZoneId,
        intent,
        provider,
        user: message,
        sourceIds: publicSources.map((item) => item.id),
        memoryConceptId: memory?.conceptId ?? null,
      },
    });
  }

  return { reply, intent, sources: publicSources, provider };
}

async function historyOf(store: Store, sessionId: string) {
  const rows = await store.recentChat(sessionId, 6);
  return rows.map((row) => ({ role: row.role, content: row.content }));
}

export { localEmbed };
