export type AgeGroup = "child" | "teen" | "adult";
export type ExperimentGroup = "fixed" | "rule" | "adaptive";
export type StrategyId = "animation" | "hint" | "analogy";
export type TurtleAnim = "idle" | "wave" | "talk" | "point" | "think";
export type QuestionRole = "pre" | "practice" | "post";
export type AnswerKind = QuestionRole | "show";

export interface Script {
  text: string;
  textChild: string;
}

export interface Question {
  id: string;
  role: QuestionRole;
  prompt: string;
  choices: string[];
  answer: number;
  expectedSec: number;
}

export interface Concept {
  id: string;
  title: string;
  summary: string;
  boxExplain: string;
  remediation: Record<StrategyId, Script>;
  questions: Question[];
}

export interface Zone {
  id: string;
  name: string;
  hall: string;
  intro: string;
  concepts: Concept[];
}

export interface Chunk {
  id: string;
  zoneId: string;
  tags: string[];
  title: string;
  body: string;
}

export interface Seed {
  sample: boolean;
  disclaimer: string;
  zones: Zone[];
  chunks: Chunk[];
}

export interface Session {
  id: string;
  nickname: string;
  ageGroup: AgeGroup;
  experimentGroup: ExperimentGroup;
  visitEndsAt: number;
  currentZoneId: string | null;
  createdAt: number;
  visitedZones: string[];
  askedQuestions: string[];
  wrongConceptIds: string[];
  answeredQuestionIds: string[];
  mentionedMemoryIds: string[];
}

export interface Mastery {
  sessionId: string;
  conceptId: string;
  pKnow: number;
  attempts: number;
  correct: number;
  remediations: number;
  lastStrategy: StrategyId | null;
}

export interface LearningEvent {
  id: string;
  ts: number;
  sessionId: string | null;
  type: string;
  payload: Record<string, unknown>;
}

export interface ChatRow {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  sources: { id: string; title: string; zoneId: string; snippet?: string; section?: string; url?: string }[];
  intent: string | null;
  ts: number;
}

export interface ConceptOverride {
  conceptId: string;
  title: string | null;
  summary: string | null;
}

export interface StoredChunk extends Chunk {
  embedding: number[];
}

export interface ScoredChunk {
  id: string;
  zoneId: string;
  tags: string[];
  title: string;
  body: string;
  raw: number;
}
