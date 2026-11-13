import { randomUUID } from "node:crypto";
import type { Store } from "./store.js";
import type { AgeGroup, ExperimentGroup, Session } from "./types.js";

export function cleanName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 12);
}

export function remainingSec(session: Session, now = Date.now()): number {
  return Math.max(0, Math.round((session.visitEndsAt - now) / 1000));
}

export function createSessionRecord(input: {
  nickname: string;
  ageGroup: AgeGroup;
  experimentGroup: ExperimentGroup;
  visitMinutes: number;
}): Session {
  return {
    id: randomUUID(),
    nickname: input.nickname,
    ageGroup: input.ageGroup,
    experimentGroup: input.experimentGroup,
    visitEndsAt: Date.now() + input.visitMinutes * 60_000,
    currentZoneId: null,
    createdAt: Date.now(),
    visitedZones: [],
    askedQuestions: [],
    wrongConceptIds: [],
    answeredQuestionIds: [],
    mentionedMemoryIds: [],
  };
}

export async function touchZone(store: Store, session: Session, zoneId: string): Promise<Session> {
  const visited = session.visitedZones.includes(zoneId)
    ? session.visitedZones
    : [...session.visitedZones, zoneId];
  if (session.currentZoneId === zoneId && visited.length === session.visitedZones.length) {
    return session;
  }
  const next: Session = { ...session, currentZoneId: zoneId, visitedZones: visited };
  await store.saveSession(next);
  if (session.currentZoneId !== zoneId) {
    await store.addEvent({
      id: randomUUID(),
      ts: Date.now(),
      sessionId: session.id,
      type: "zone_visit",
      payload: { zoneId },
    });
  }
  return next;
}
