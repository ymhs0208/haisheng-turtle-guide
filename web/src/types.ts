export type AgeGroup = "child" | "teen" | "adult";
export type ExperimentGroup = "fixed" | "rule" | "adaptive";
export type TurtleAnim = "idle" | "wave" | "talk" | "point" | "think";

export interface Session {
  id: string;
  nickname: string;
  ageGroup: AgeGroup;
  experimentGroup: ExperimentGroup;
  visitEndsAt: number;
  currentZoneId: string | null;
}

export interface Meta {
  sample: boolean;
  ageGroups: { id: AgeGroup; label: string; blurb: string }[];
  policies: { id: ExperimentGroup; label: string; blurb: string }[];
  strategies: { id: string; label: string; timeSec: number }[];
  llm: string;
  store: string;
}

export interface Zone {
  id: string;
  name: string;
  hall: string;
  intro: string;
  concepts: { id: string; title: string; summary: string }[];
}

export interface Summary {
  remainingSec: number;
  byZone: {
    zoneId: string;
    name: string;
    pre: { correct: number; total: number; done: boolean };
    post: { correct: number; total: number; done: boolean };
    practice: { attempts: number; correct: number };
  }[];
  mastery: {
    conceptId: string;
    title: string;
    zoneId: string;
    pKnow: number;
    attempts: number;
    correct: number;
    remediations: number;
  }[];
}

export interface PublicQuestion {
  id: string;
  prompt: string;
  choices: string[];
  expectedSec: number;
  conceptId: string;
  conceptTitle: string;
}

export interface Remediation {
  conceptId: string;
  conceptTitle: string;
  strategyId: string;
  strategyLabel: string;
  reason: string;
  text: string;
  anim: TurtleAnim;
  emphasis: "replay" | "none";
  timeSec: number;
}

export interface Grade {
  correct: boolean;
  correctIndex: number;
  masteryBefore: number;
  masteryAfter: number;
  timingNote: string;
  strategy: Remediation | null;
  conceptTitle: string;
  hasNextPractice: boolean;
}

export interface ShowView {
  id: string;
  zoneId: string;
  mode: "solo" | "group";
  phase: "announce" | "answer" | "results" | "explain";
  endsAt: number;
  serverNow: number;
  question: PublicQuestion;
  results?: { counts: number[]; submitted: number; correct: number };
  explain?: {
    headline: string;
    text: string;
    correctIndex: number;
    topWrongIndex: number | null;
    allCorrect: boolean;
  };
}
