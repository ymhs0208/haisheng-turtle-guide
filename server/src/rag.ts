import { randomUUID } from "node:crypto";
import { toCiteSource, type CiteSource } from "./cite.js";
import { embedText, fixedReply, generateReply, type LlmChunk } from "./llm.js";
import { localEmbed } from "./embed.js";
import { classifyByRules, classifyQuestion, filterOutput, type GuardLabel } from "./guard.js";
import { remoteLlmEnabled } from "./provider.js";
import { rankChunks, RETRIEVAL_THRESHOLD } from "./rank.js";
import type { ContentRepo } from "./content.js";
import type { Store } from "./store.js";
import type { Session } from "./types.js";

export type Intent = "injection" | "offtopic" | "chitchat" | "knowledge";

export { RETRIEVAL_THRESHOLD };

function intentFromLabel(label: Exclude<GuardLabel, "unsure">): Intent {
  if (label === "unsafe") return "injection";
  if (label === "off_topic") return "offtopic";
  if (label === "small_talk") return "chitchat";
  return "knowledge";
}

export function routeIntent(text: string): Intent {
  const ruled = classifyByRules(text);
  if (ruled === "unsure") return "offtopic";
  return intentFromLabel(ruled);
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
  const stored = await store.listChunks();
  const overrides = await store.listOverrides();
  const extras = [];
  for (const override of overrides) {
    const located = content.locateConcept(override.conceptId);
    if (!located || !override.summary?.trim()) continue;
    const title = `${override.title?.trim() || located.concept.title}（館方更新）`;
    const body = override.summary.trim();
    const tags = [located.zone.name, located.concept.title];
    extras.push({
      id: `override-${override.conceptId}`,
      zoneId: located.zone.id,
      title,
      body,
      tags,
      embedding: await embedText(`${title}\n${body}\n${tags.join(" ")}`),
    });
  }
  return rankChunks(query, embedding, [...stored, ...extras], zoneId, 3);
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
  sources: CiteSource[];
  provider: string;
  confidence: "high" | "low";
}> {
  const style = input.style ?? "chat";
  const persist = input.persist ?? style === "chat";
  const includeMemory = (input.includeMemory ?? style === "chat") && persist;
  const message = input.message.trim().slice(0, 400);
  const ruled = classifyByRules(message);
  const label =
    ruled === "unsure" && remoteLlmEnabled()
      ? await classifyQuestion(message, async (prompt) => {
          const { chatComplete } = await import("./provider.js");
          return chatComplete([{ role: "user", content: prompt }], 0);
        })
      : await classifyQuestion(message);
  const intent = intentFromLabel(label);
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
      reply = filterOutput(generated.text, fixedReply("injection"));
      provider = generated.provider;
    }
  }

  const memory = includeMemory && (intent === "knowledge" || intent === "chitchat")
    ? buildMemoryNote(input.session, input.content)
    : null;
  if (memory) {
    reply = `${memory.note}${reply}`;
  }

  const publicSources = (intent === "knowledge" ? sources : []).map((item) => toCiteSource(item));

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

  const confidence = intent === "knowledge" && publicSources.length > 0 ? "high" : "low";
  return { reply, intent, sources: publicSources, provider, confidence };
}

async function historyOf(store: Store, sessionId: string) {
  const rows = await store.recentChat(sessionId, 6);
  return rows.map((row) => ({ role: row.role, content: row.content }));
}

export { localEmbed };
