import type { ContentRepo } from "./content.js";
import { remainingSec } from "./session-logic.js";
import type { Store } from "./store.js";
import type { LearningEvent, Session } from "./types.js";

function firstAnswers(events: LearningEvent[], sessionId: string, kind: string) {
  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  for (const event of events) {
    if (event.sessionId !== sessionId || event.type !== "answer") continue;
    if (event.payload.kind !== kind) continue;
    const questionId = String(event.payload.questionId ?? "");
    if (!questionId || seen.has(questionId)) continue;
    seen.add(questionId);
    rows.push(event.payload);
  }
  return rows;
}

export async function sessionSummary(store: Store, content: ContentRepo, session: Session) {
  const events = await store.listEvents();
  const mastery = await store.getMastery(session.id);
  const byZone = content.seed.zones.map((zone) => {
    const preTotal = zone.concepts.reduce(
      (sum, concept) => sum + concept.questions.filter((question) => question.role === "pre").length,
      0,
    );
    const postTotal = zone.concepts.reduce(
      (sum, concept) => sum + concept.questions.filter((question) => question.role === "post").length,
      0,
    );
    const pre = firstAnswers(events, session.id, "pre").filter((row) => row.zoneId === zone.id);
    const post = firstAnswers(events, session.id, "post").filter((row) => row.zoneId === zone.id);
    const practice = events.filter(
      (event) =>
        event.sessionId === session.id &&
        event.type === "answer" &&
        event.payload.kind === "practice" &&
        event.payload.zoneId === zone.id,
    );
    const correctOf = (rows: Record<string, unknown>[]) => rows.filter((row) => row.correct === true).length;
    return {
      zoneId: zone.id,
      name: zone.name,
      pre: { correct: correctOf(pre), total: preTotal, done: pre.length >= preTotal && preTotal > 0 },
      post: { correct: correctOf(post), total: postTotal, done: post.length >= postTotal && postTotal > 0 },
      practice: {
        attempts: practice.length,
        correct: practice.filter((event) => event.payload.correct === true).length,
      },
    };
  });
  const remediationCounts = { animation: 0, hint: 0, analogy: 0 };
  for (const event of events) {
    if (event.sessionId !== session.id || event.type !== "answer") continue;
    const strategy = event.payload.strategyId;
    if (strategy === "animation" || strategy === "hint" || strategy === "analogy") {
      remediationCounts[strategy] += 1;
    }
  }
  return {
    experimentGroup: session.experimentGroup,
    ageGroup: session.ageGroup,
    remainingSec: remainingSec(session),
    byZone,
    mastery: await Promise.all(
      content.seed.zones.flatMap((zone) =>
        zone.concepts.map(async (concept) => {
          const view = await content.conceptView(concept);
          const row = mastery.find((item) => item.conceptId === concept.id);
          return {
            conceptId: concept.id,
            title: view.title,
            zoneId: zone.id,
            pKnow: row?.pKnow ?? 0.3,
            attempts: row?.attempts ?? 0,
            correct: row?.correct ?? 0,
            remediations: row?.remediations ?? 0,
          };
        }),
      ),
    ),
    remediationCounts,
  };
}

export async function adminOverview(store: Store, content: ContentRepo) {
  const sessions = await store.listSessions();
  const events = await store.listEvents();
  const mastery = await store.listMastery();
  const groups = ["fixed", "rule", "adaptive"] as const;
  const byGroup = groups.map((group) => {
    const members = sessions.filter((session) => session.experimentGroup === group);
    const ids = new Set(members.map((session) => session.id));
    const answers = events.filter((event) => event.type === "answer" && event.sessionId && ids.has(event.sessionId));
    const correct = answers.filter((event) => event.payload.correct === true).length;
    const mine = mastery.filter((row) => ids.has(row.sessionId));
    const meanMastery = mine.length ? mine.reduce((sum, row) => sum + row.pKnow, 0) / mine.length : null;
    return {
      group,
      sessions: members.length,
      answers: answers.length,
      correctRate: answers.length ? correct / answers.length : null,
      meanMastery,
    };
  });
  const strategies = groups.flatMap((group) =>
    (["animation", "hint", "analogy"] as const).map((strategy) => ({
      group,
      strategy,
      count: events.filter((event) => {
        const session = sessions.find((item) => item.id === event.sessionId);
        return event.type === "answer" && session?.experimentGroup === group && event.payload.strategyId === strategy;
      }).length,
    })),
  );
  const recentEvents = events.slice(-30).reverse().map((event) => ({
    id: event.id,
    ts: event.ts,
    sessionId: event.sessionId,
    type: event.type,
    kind: event.payload.kind ?? null,
    zoneId: event.payload.zoneId ?? null,
    conceptId: event.payload.conceptId ?? null,
    correct: event.payload.correct ?? null,
    strategyId: event.payload.strategyId ?? null,
    masteryBefore: event.payload.masteryBefore ?? null,
    masteryAfter: event.payload.masteryAfter ?? null,
  }));
  const concepts = [];
  for (const zone of content.seed.zones) {
    for (const concept of zone.concepts) {
      const view = await content.conceptView(concept);
      concepts.push({
        id: concept.id,
        zoneId: zone.id,
        zoneName: zone.name,
        title: view.title,
        summary: view.summary,
      });
    }
  }
  return { byGroup, strategies, recentEvents, concepts, sessions: sessions.length, events: events.length };
}
