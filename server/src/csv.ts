import type { LearningEvent, Mastery, Session } from "./types.js";

function cell(value: unknown): string {
  if (value == null) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function table(headers: string[], rows: unknown[][]): string {
  const lines = [headers.join(","), ...rows.map((row) => row.map(cell).join(","))];
  return `\uFEFF${lines.join("\n")}\n`;
}

const ANSWER_KEYS = [
  "kind",
  "zoneId",
  "conceptId",
  "questionId",
  "correct",
  "latencyMs",
  "strategyId",
  "masteryBefore",
  "masteryAfter",
  "policy",
  "remainingSec",
  "reason",
] as const;

export function eventsCsv(events: LearningEvent[]): string {
  const headers = ["id", "ts", "iso", "sessionId", "type", ...ANSWER_KEYS, "detail"];
  const rows = events.map((event) => {
    const payload = event.payload ?? {};
    const rest: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (!ANSWER_KEYS.includes(key as (typeof ANSWER_KEYS)[number])) rest[key] = value;
    }
    return [
      event.id,
      event.ts,
      new Date(event.ts).toISOString(),
      event.sessionId,
      event.type,
      ...ANSWER_KEYS.map((key) => payload[key] ?? ""),
      Object.keys(rest).length ? rest : "",
    ];
  });
  return table(headers, rows);
}

export function masteryCsv(rows: Mastery[], sessions: Session[]): string {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  return table(
    ["sessionId", "experimentGroup", "ageGroup", "conceptId", "pKnow", "attempts", "correct", "remediations", "lastStrategy"],
    rows.map((row) => {
      const session = byId.get(row.sessionId);
      return [
        row.sessionId,
        session?.experimentGroup ?? "",
        session?.ageGroup ?? "",
        row.conceptId,
        row.pKnow,
        row.attempts,
        row.correct,
        row.remediations,
        row.lastStrategy ?? "",
      ];
    }),
  );
}
