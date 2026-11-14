import { randomUUID } from "node:crypto";
import type { Express, Request } from "express";
import { getConfig } from "./config.js";
import type { ContentRepo } from "./content.js";
import { isAnswerKind, toPublicQuestion } from "./content.js";
import { eventsCsv, masteryCsv } from "./csv.js";
import { gradeAnswer } from "./grade.js";
import { HttpError, clamp, wrap } from "./http.js";
import { metaPayload } from "./labels.js";
import type { Hub } from "./hub.js";
import { allowRequest, MAX_INPUT_CHARS } from "./guard.js";
import { answerChat } from "./rag.js";
import { cleanName, createSessionRecord, remainingSec, touchZone } from "./session-logic.js";
import type { Store } from "./store.js";
import { adminOverview, sessionSummary } from "./summary.js";
import type { AgeGroup, ExperimentGroup, Session } from "./types.js";

const AGES: AgeGroup[] = ["child", "teen", "adult"];
const GROUPS: ExperimentGroup[] = ["fixed", "rule", "adaptive"];

function isAge(value: unknown): value is AgeGroup {
  return typeof value === "string" && AGES.includes(value as AgeGroup);
}

function isGroup(value: unknown): value is ExperimentGroup {
  return typeof value === "string" && GROUPS.includes(value as ExperimentGroup);
}

function bodyOf(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
}

function readChatMessage(value: unknown, rateKey: string): string {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, "請輸入想問的話");
  const text = value.trim();
  if (text.length > 800) throw new HttpError(400, "請把問題縮短一點，一次問一件事。");
  if (!allowRequest(rateKey)) throw new HttpError(429, "問得太快了，先喘一口氣，等一下再問小綠。");
  return text.slice(0, MAX_INPUT_CHARS);
}

function present(session: Session) {
  return { session, remainingSec: remainingSec(session) };
}

async function requireSession(store: Store, id: string): Promise<Session> {
  const session = await store.getSession(id);
  if (!session) throw new HttpError(404, "找不到這個行程");
  return session;
}

function assertAdmin(req: Request): void {
  const token = getConfig().adminToken;
  if (!token) return;
  if (req.header("x-admin-token") !== token) throw new HttpError(401, "需要管理權杖");
}

export function mountRoutes(app: Express, deps: { store: Store; content: ContentRepo; hub: Hub }): void {
  const { store, content } = deps;

  app.get("/api/health", (_req, res) => {
    const config = getConfig();
    res.json({
      ok: true,
      service: "xiaolu",
      sample: true,
      store: store.kind,
      vector: store.vectorMode,
      llm: config.llmProvider,
      llmReady: config.llmProvider === "mock" || Boolean(config.openaiKey),
    });
  });

  app.get("/api/meta", (_req, res) => {
    const config = getConfig();
    res.json(
      metaPayload({
        llm: config.llmProvider,
        llmReady: config.llmProvider === "mock" || Boolean(config.openaiKey),
        store: store.kind,
        vector: store.vectorMode,
      }),
    );
  });

  app.get("/api/zones", wrap(async (_req, res) => {
    res.json(await content.publicZones());
  }));

  app.post("/api/sessions", wrap(async (req, res) => {
    const body = bodyOf(req);
    if (!isAge(body.ageGroup)) throw new HttpError(400, "請選擇年齡層");
    const visitMinutes = clamp(typeof body.visitMinutes === "number" ? body.visitMinutes : 40, 10, 180);
    let experimentGroup = GROUPS[Math.floor(Math.random() * GROUPS.length)] ?? "adaptive";
    let assignedBy: "random" | "override" = "random";
    if (isGroup(body.experimentGroup) && getConfig().allowGroupOverride) {
      experimentGroup = body.experimentGroup;
      assignedBy = "override";
    }
    const session = createSessionRecord({
      nickname: cleanName(body.nickname),
      ageGroup: body.ageGroup,
      experimentGroup,
      visitMinutes,
    });
    await store.createSession(session);
    await store.addEvent({
      id: randomUUID(),
      ts: Date.now(),
      sessionId: session.id,
      type: "session_start",
      payload: { experimentGroup, ageGroup: session.ageGroup, assignedBy, visitMinutes },
    });
    res.status(201).json(present(session));
  }));

  app.get("/api/sessions/:id", wrap(async (req, res) => {
    res.json(present(await requireSession(store, String(req.params.id))));
  }));

  app.patch("/api/sessions/:id", wrap(async (req, res) => {
    let session = await requireSession(store, String(req.params.id));
    const body = bodyOf(req);
    if ("nickname" in body) session = { ...session, nickname: cleanName(body.nickname) };
    if (typeof body.currentZoneId === "string") {
      if (!content.zoneById(body.currentZoneId)) throw new HttpError(400, "沒有這個展區");
      session = await touchZone(store, session, body.currentZoneId);
    } else if ("nickname" in body) {
      await store.saveSession(session);
    }
    res.json(present(session));
  }));

  app.post("/api/sessions/:id/demo", wrap(async (req, res) => {
    if (!getConfig().allowGroupOverride) throw new HttpError(403, "示範調整已關閉");
    let session = await requireSession(store, String(req.params.id));
    const body = bodyOf(req);
    if (typeof body.remainingSec === "number" && Number.isFinite(body.remainingSec)) {
      session = { ...session, visitEndsAt: Date.now() + clamp(body.remainingSec, 0, 7200) * 1000 };
    }
    if (isGroup(body.experimentGroup) && body.experimentGroup !== session.experimentGroup) {
      const from = session.experimentGroup;
      session = { ...session, experimentGroup: body.experimentGroup };
      await store.addEvent({
        id: randomUUID(),
        ts: Date.now(),
        sessionId: session.id,
        type: "group_change",
        payload: { from, to: body.experimentGroup },
      });
    }
    await store.saveSession(session);
    res.json(present(session));
  }));

  app.get("/api/sessions/:id/quiz", wrap(async (req, res) => {
    const session = await requireSession(store, String(req.params.id));
    const zoneId = String(req.query.zoneId ?? session.currentZoneId ?? "");
    const kind = String(req.query.kind ?? "practice");
    if (!content.zoneById(zoneId)) throw new HttpError(400, "請先選擇展區");
    if (kind !== "pre" && kind !== "post" && kind !== "practice") throw new HttpError(400, "題目類型無效");
    if (kind === "practice") {
      const mastery = await store.getMastery(session.id);
      const pKnow: Record<string, number> = {};
      for (const row of mastery) pKnow[row.conceptId] = row.pKnow;
      const next = content.practiceState(zoneId, session.answeredQuestionIds, pKnow);
      if (!next) throw new HttpError(400, "沒有這個展區");
      if (next.done || !next.question || !next.concept) {
        res.json({ kind, done: true, total: next.total, answered: next.answered, question: null });
        return;
      }
      const view = await content.conceptView(next.concept);
      res.json({
        kind,
        done: false,
        total: next.total,
        answered: next.answered,
        mastery: next.mastery,
        question: toPublicQuestion(next.question, view),
      });
      return;
    }
    const bundle = content.bundle(zoneId, kind, session.answeredQuestionIds);
    if (!bundle) throw new HttpError(400, "沒有這個展區");
    res.json({ kind, ...bundle });
  }));

  app.post("/api/sessions/:id/answer", wrap(async (req, res) => {
    const session = await requireSession(store, String(req.params.id));
    const body = bodyOf(req);
    const kind = typeof body.kind === "string" ? body.kind : "";
    if (!isAnswerKind(kind) || kind === "show") throw new HttpError(400, "題目類型無效");
    const result = await gradeAnswer({
      store,
      content,
      session,
      questionId: String(body.questionId ?? ""),
      choiceIndex: Number(body.choiceIndex),
      latencyMs: typeof body.latencyMs === "number" ? body.latencyMs : null,
      kind,
    });
    res.json(result);
  }));

  app.post("/api/sessions/:id/reset-practice", wrap(async (req, res) => {
    const session = await requireSession(store, String(req.params.id));
    const zoneId = String(bodyOf(req).zoneId ?? session.currentZoneId ?? "");
    const zone = content.zoneById(zoneId);
    if (!zone) throw new HttpError(400, "沒有這個展區");
    const practiceIds = new Set(
      zone.concepts.flatMap((concept) =>
        concept.questions.filter((question) => question.role === "practice").map((question) => question.id),
      ),
    );
    const next = {
      ...session,
      answeredQuestionIds: session.answeredQuestionIds.filter((id) => !practiceIds.has(id)),
    };
    await store.saveSession(next);
    await store.addEvent({
      id: randomUUID(),
      ts: Date.now(),
      sessionId: session.id,
      type: "reset_practice",
      payload: { zoneId },
    });
    res.json(present(next));
  }));

  app.get("/api/sessions/:id/chat", wrap(async (req, res) => {
    const session = await requireSession(store, String(req.params.id));
    const rows = await store.recentChat(session.id, 40);
    res.json({
      messages: rows.map((row) => ({
        role: row.role,
        content: row.content,
        sources: row.sources,
        intent: row.intent,
      })),
    });
  }));

  app.post("/api/sessions/:id/chat", wrap(async (req, res) => {
    const session = await requireSession(store, String(req.params.id));
    const message = readChatMessage(bodyOf(req).message, session.id);
    const result = await answerChat({ store, content, session, message });
    res.json(result);
  }));

  app.post("/api/sessions/:id/chat/stream", wrap(async (req, res) => {
    const session = await requireSession(store, String(req.params.id));
    const message = readChatMessage(bodyOf(req).message, `${session.id}:stream`);
    const result = await answerChat({ store, content, session, message });
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    for (let index = 0; index < result.reply.length; index += 18) {
      res.write(`data: ${JSON.stringify({ type: "delta", text: result.reply.slice(index, index + 18) })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ type: "done", ...result })}\n\n`);
    res.end();
  }));

  app.get("/api/sessions/:id/summary", wrap(async (req, res) => {
    const session = await requireSession(store, String(req.params.id));
    res.json(await sessionSummary(store, content, session));
  }));

  app.get("/api/sessions/:id/mastery", wrap(async (req, res) => {
    const session = await requireSession(store, String(req.params.id));
    const summary = await sessionSummary(store, content, session);
    res.json({ mastery: summary.mastery });
  }));

  app.get("/api/admin/overview", wrap(async (req, res) => {
    assertAdmin(req);
    const config = getConfig();
    const overview = await adminOverview(store, content);
    res.json({
      ...overview,
      store: store.kind,
      vector: store.vectorMode,
      llm: config.llmProvider,
      adminOpen: !config.adminToken,
      sample: true,
    });
  }));

  app.patch("/api/admin/concepts/:id", wrap(async (req, res) => {
    assertAdmin(req);
    const conceptId = String(req.params.id);
    const located = content.locateConcept(conceptId);
    if (!located) throw new HttpError(404, "找不到這個概念");
    const body = bodyOf(req);
    const current = (await store.listOverrides()).find((item) => item.conceptId === conceptId);
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 40) : current?.title ?? null;
    const summary = typeof body.summary === "string" ? body.summary.trim().slice(0, 600) : current?.summary ?? null;
    if (!title && !summary) throw new HttpError(400, "請填標題或簡介");
    await store.upsertOverride({ conceptId, title, summary });
    const view = await content.conceptView(located.concept);
    res.json({ id: conceptId, title: view.title, summary: view.summary });
  }));

  app.get("/api/export/events.csv", wrap(async (req, res) => {
    assertAdmin(req);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"events.csv\"");
    res.send(eventsCsv(await store.listEvents()));
  }));

  app.get("/api/export/mastery.csv", wrap(async (req, res) => {
    assertAdmin(req);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"mastery.csv\"");
    res.send(masteryCsv(await store.listMastery(), await store.listSessions()));
  }));

  app.post("/api/recognize", (_req, res) => {
    res.json({ stub: true, message: "拍照辨識還在下一階段，這次原型先不判斷物種。" });
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "找不到" });
  });
}
