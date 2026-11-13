import { randomUUID } from "node:crypto";
import { timingNote, updateBkt } from "./bkt.js";
import type { ContentRepo } from "./content.js";
import { HttpError, clamp } from "./http.js";
import { remainingSec } from "./session-logic.js";
import { chooseStrategy } from "./strategy.js";
import type { Store } from "./store.js";
import type { AnswerKind, Session, TurtleAnim } from "./types.js";

export interface RemediationView {
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

export interface GradeResult {
  correct: boolean;
  correctIndex: number;
  masteryBefore: number;
  masteryAfter: number;
  timingNote: string;
  strategy: RemediationView | null;
  conceptId: string;
  conceptTitle: string;
  zoneId: string;
  hasNextPractice: boolean;
}

export async function gradeAnswer(input: {
  store: Store;
  content: ContentRepo;
  session: Session;
  questionId: string;
  choiceIndex: number;
  latencyMs: number | null;
  kind: AnswerKind;
}): Promise<GradeResult> {
  if (!Number.isInteger(input.choiceIndex) || input.choiceIndex < 0 || input.choiceIndex > 3) {
    throw new HttpError(400, "選項無效");
  }
  const located = input.content.locateQuestion(input.questionId);
  if (!located) throw new HttpError(404, "找不到這題");
  if (input.kind !== "show" && input.kind !== located.question.role) {
    throw new HttpError(400, "題目類型不符");
  }
  const concept = await input.content.conceptView(located.concept);
  const expectedMs = Math.max(1, located.question.expectedSec * 1000);
  const latencyProvided = input.latencyMs != null && Number.isFinite(input.latencyMs);
  const latencyMs = latencyProvided ? clamp(Math.round(input.latencyMs ?? expectedMs), 0, 300_000) : expectedMs;
  const before = await input.store.getMasteryOne(input.session.id, concept.id);
  const correct = input.choiceIndex === located.question.answer;
  const updated = updateBkt(before.pKnow, correct, latencyMs, expectedMs);
  const choice = correct
    ? null
    : chooseStrategy(input.session.experimentGroup, {
        pKnow: updated.pNext,
        remainingSec: remainingSec(input.session),
        latencyMs,
        expectedMs,
        remediationCount: before.remediations,
        lastStrategy: before.lastStrategy,
      });
  const script = choice ? concept.remediation[choice.strategy] : null;
  const text = script ? (input.session.ageGroup === "child" ? script.textChild : script.text) : "";
  const strategy: RemediationView | null = choice
    ? {
        conceptId: concept.id,
        conceptTitle: concept.title,
        strategyId: choice.strategy,
        strategyLabel: choice.label,
        reason: choice.reason,
        text,
        anim: choice.anim,
        emphasis: choice.emphasis,
        timeSec: choice.timeSec,
      }
    : null;

  await input.store.saveMastery({
    sessionId: input.session.id,
    conceptId: concept.id,
    pKnow: updated.pNext,
    attempts: before.attempts + 1,
    correct: before.correct + (correct ? 1 : 0),
    remediations: before.remediations + (strategy ? 1 : 0),
    lastStrategy: strategy ? (strategy.strategyId as typeof before.lastStrategy) : before.lastStrategy,
  });

  const answered =
    input.kind === "show" || input.session.answeredQuestionIds.includes(input.questionId)
      ? input.session.answeredQuestionIds
      : [...input.session.answeredQuestionIds, input.questionId];
  const wrong = correct
    ? input.session.wrongConceptIds
    : input.session.wrongConceptIds.includes(concept.id)
      ? input.session.wrongConceptIds
      : [...input.session.wrongConceptIds, concept.id];
  await input.store.saveSession({
    ...input.session,
    answeredQuestionIds: answered,
    wrongConceptIds: wrong.slice(-20),
  });

  const note = timingNote(correct, updated.ratio);
  await input.store.addEvent({
    id: randomUUID(),
    ts: Date.now(),
    sessionId: input.session.id,
    type: "answer",
    payload: {
      kind: input.kind,
      zoneId: located.zone.id,
      conceptId: concept.id,
      questionId: input.questionId,
      correct,
      choiceIndex: input.choiceIndex,
      correctIndex: located.question.answer,
      latencyMs,
      latencyImputed: !latencyProvided,
      expectedMs,
      ratio: updated.ratio,
      strategyId: strategy?.strategyId ?? null,
      reason: strategy?.reason ?? null,
      masteryBefore: before.pKnow,
      masteryAfter: updated.pNext,
      policy: input.session.experimentGroup,
      remainingSec: remainingSec(input.session),
      utilities: choice?.scores ?? null,
      timingNote: note,
      pG: updated.pG,
      pS: updated.pS,
    },
  });

  const masteryRows = await input.store.getMastery(input.session.id);
  const pKnow: Record<string, number> = {};
  for (const row of masteryRows) pKnow[row.conceptId] = row.pKnow;
  const next = input.content.practiceState(located.zone.id, answered, pKnow);

  return {
    correct,
    correctIndex: located.question.answer,
    masteryBefore: before.pKnow,
    masteryAfter: updated.pNext,
    timingNote: note,
    strategy,
    conceptId: concept.id,
    conceptTitle: concept.title,
    zoneId: located.zone.id,
    hasNextPractice: Boolean(next && !next.done),
  };
}
