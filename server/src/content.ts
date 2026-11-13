import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chunkDocument, localEmbed } from "./embed.js";
import { embedText } from "./llm.js";
import type { Store } from "./store.js";
import type {
  AnswerKind,
  Concept,
  Question,
  QuestionRole,
  Seed,
  StoredChunk,
  Zone,
} from "./types.js";

const STRATEGIES = ["animation", "hint", "analogy"] as const;

export function findContentFile(name: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "content", name),
    path.resolve(process.cwd(), "../content", name),
    path.resolve(here, "../../content", name),
    path.resolve(here, "../../../content", name),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`找不到 ${name}`);
}

export function validateSeed(seed: Seed): void {
  if (seed.sample !== true) throw new Error("種子檔必須標成樣本資料");
  if (!seed.disclaimer?.trim()) throw new Error("種子檔缺少樣本聲明");
  if (!Array.isArray(seed.zones) || seed.zones.length < 2) throw new Error("至少需要兩個展區");
  const zoneIds = new Set<string>();
  const conceptIds = new Set<string>();
  const questionIds = new Set<string>();
  for (const zone of seed.zones) {
    if (!zone.id || zoneIds.has(zone.id)) throw new Error(`展區代號重複或空白：${zone.id}`);
    zoneIds.add(zone.id);
    if (!zone.concepts || zone.concepts.length < 3) throw new Error(`展區 ${zone.id} 至少需要 3 個概念`);
    for (const concept of zone.concepts) {
      if (!concept.id || conceptIds.has(concept.id)) throw new Error(`概念代號重複或空白：${concept.id}`);
      conceptIds.add(concept.id);
      if (!concept.questions || concept.questions.length < 3) {
        throw new Error(`概念 ${concept.id} 至少需要 3 題`);
      }
      const roles = new Set(concept.questions.map((item) => item.role));
      for (const role of ["pre", "practice", "post"] as const) {
        if (!roles.has(role)) throw new Error(`概念 ${concept.id} 缺少 ${role} 題`);
      }
      for (const key of STRATEGIES) {
        const script = concept.remediation?.[key];
        if (!script?.text?.trim() || !script.textChild?.trim()) {
          throw new Error(`概念 ${concept.id} 缺少補救腳本 ${key}`);
        }
      }
      for (const question of concept.questions) {
        if (!question.id || questionIds.has(question.id)) throw new Error(`題號重複或空白：${question.id}`);
        questionIds.add(question.id);
        if (!Array.isArray(question.choices) || question.choices.length !== 4) {
          throw new Error(`題目 ${question.id} 必須有 4 個選項`);
        }
        if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer > 3) {
          throw new Error(`題目 ${question.id} 的正解索引無效`);
        }
      }
    }
  }
  const chunkIds = new Set<string>();
  for (const chunk of seed.chunks ?? []) {
    if (!chunk.id || chunkIds.has(chunk.id)) throw new Error(`資料塊代號重複：${chunk.id}`);
    chunkIds.add(chunk.id);
    if (!zoneIds.has(chunk.zoneId)) throw new Error(`資料塊 ${chunk.id} 的展區不存在`);
    if (!chunk.title?.trim() || !chunk.body?.trim()) throw new Error(`資料塊 ${chunk.id} 內容空白`);
  }
}

export function loadSeed(): Seed {
  const file = findContentFile("seed.json");
  const seed = JSON.parse(readFileSync(file, "utf8")) as Seed;
  validateSeed(seed);
  return seed;
}

export function toPublicQuestion(question: Question, concept: { id: string; title: string }) {
  return {
    id: question.id,
    prompt: question.prompt,
    choices: question.choices,
    expectedSec: question.expectedSec,
    conceptId: concept.id,
    conceptTitle: concept.title,
  };
}

export async function indexKnowledge(store: Store, seed: Seed): Promise<void> {
  const chunks: StoredChunk[] = [];
  for (const chunk of seed.chunks) {
    const embedding = await embedText(chunkDocument(chunk.title, chunk.body, chunk.tags));
    chunks.push({ ...chunk, embedding });
  }
  await store.replaceChunks(chunks);
}

export class ContentRepo {
  constructor(
    readonly seed: Seed,
    private readonly store: Store,
  ) {}

  get disclaimer(): string {
    return this.seed.disclaimer;
  }

  zoneById(zoneId: string): Zone | undefined {
    return this.seed.zones.find((zone) => zone.id === zoneId);
  }

  locateQuestion(questionId: string): { zone: Zone; concept: Concept; question: Question } | null {
    for (const zone of this.seed.zones) {
      for (const concept of zone.concepts) {
        const question = concept.questions.find((item) => item.id === questionId);
        if (question) return { zone, concept, question };
      }
    }
    return null;
  }

  locateConcept(conceptId: string): { zone: Zone; concept: Concept } | null {
    for (const zone of this.seed.zones) {
      const concept = zone.concepts.find((item) => item.id === conceptId);
      if (concept) return { zone, concept };
    }
    return null;
  }

  async conceptView(concept: Concept): Promise<Concept> {
    const overrides = await this.store.listOverrides();
    const found = overrides.find((item) => item.conceptId === concept.id);
    if (!found) return concept;
    return {
      ...concept,
      title: found.title?.trim() || concept.title,
      summary: found.summary?.trim() || concept.summary,
    };
  }

  async publicZones() {
    const overrides = await this.store.listOverrides();
    return {
      sample: true as const,
      disclaimer: this.seed.disclaimer,
      zones: this.seed.zones.map((zone) => ({
        id: zone.id,
        name: zone.name,
        hall: zone.hall,
        intro: zone.intro,
        concepts: zone.concepts.map((concept) => {
          const found = overrides.find((item) => item.conceptId === concept.id);
          return {
            id: concept.id,
            title: found?.title?.trim() || concept.title,
            summary: found?.summary?.trim() || concept.summary,
          };
        }),
      })),
    };
  }

  practiceState(zoneId: string, answered: string[], pKnow: Record<string, number>) {
    const zone = this.zoneById(zoneId);
    if (!zone) return null;
    const practice = zone.concepts.flatMap((concept) =>
      concept.questions.filter((question) => question.role === "practice").map((question) => ({ concept, question })),
    );
    const answeredCount = practice.filter((item) => answered.includes(item.question.id)).length;
    const concepts = zone.concepts.slice().sort((a, b) => (pKnow[a.id] ?? 0.3) - (pKnow[b.id] ?? 0.3));
    for (const concept of concepts) {
      const question = concept.questions.find(
        (item) => item.role === "practice" && !answered.includes(item.id),
      );
      if (question) {
        return {
          done: false as const,
          total: practice.length,
          answered: answeredCount,
          concept,
          question,
          mastery: pKnow[concept.id] ?? 0.3,
        };
      }
    }
    return { done: true as const, total: practice.length, answered: answeredCount, question: null, concept: null, mastery: null };
  }

  bundle(zoneId: string, role: QuestionRole, answered: string[]) {
    const zone = this.zoneById(zoneId);
    if (!zone) return null;
    const all = zone.concepts.flatMap((concept) =>
      concept.questions.filter((question) => question.role === role).map((question) => ({ concept, question })),
    );
    const remaining = all.filter((item) => !answered.includes(item.question.id));
    return {
      total: all.length,
      done: remaining.length === 0,
      questions: remaining.map((item) => toPublicQuestion(item.question, item.concept)),
    };
  }

  pickShowQuestion(zoneId: string, used: string[]): { zone: Zone; concept: Concept; question: Question } | null {
    const zone = this.zoneById(zoneId);
    if (!zone) return null;
    const pool = zone.concepts.flatMap((concept) =>
      concept.questions
        .filter((question) => question.role === "practice")
        .map((question) => ({ zone, concept, question })),
    );
    return pool.find((item) => !used.includes(item.question.id)) ?? pool[0] ?? null;
  }
}

export function isAnswerKind(value: string): value is AnswerKind {
  return value === "pre" || value === "practice" || value === "post" || value === "show";
}

/** 離線展示頁只帶公開講稿，測試用來確認沒有和種子檔脫節。 */
export function loadPublicSlides(): { title: string; text: string }[] {
  const file = findContentFile("public-slides.json");
  return JSON.parse(readFileSync(file, "utf8")) as { title: string; text: string }[];
}

export { localEmbed };
