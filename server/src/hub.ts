import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { getTimings } from "./config.js";
import type { ContentRepo } from "./content.js";
import { mergeIntoQueue, type QueueItem } from "./dedupe.js";
import { gradeAnswer, type RemediationView } from "./grade.js";
import { answerChat } from "./rag.js";
import { touchZone } from "./session-logic.js";
import type { Store } from "./store.js";

/** Keep this aligned with packages/scene/timing.ts. */
const SWIM_MS = 2400;

type Role = "phone" | "display";
type Phase = "announce" | "answer" | "results" | "explain" | "done";

interface Client {
  id: string;
  ws: WebSocket;
  role: Role | null;
  sessionId?: string;
  zoneId: string | null;
}

interface ShowAnswer {
  pending: boolean;
  choiceIndex: number;
  correct: boolean;
  latencyMs: number;
  remediation: RemediationView | null;
}

interface LiveShow {
  id: string;
  zoneId: string;
  mode: "solo" | "group";
  phase: Phase;
  endsAt: number;
  questionId: string;
  prompt: string;
  choices: string[];
  expectedSec: number;
  conceptId: string;
  conceptTitle: string;
  boxExplain: string;
  correctIndex: number;
  answers: Map<string, ShowAnswer>;
}

interface TurtleSpot {
  holder: "box";
  sessionId: string | null;
  nickname: string;
  zoneId: string;
}

export class Hub {
  private clients = new Set<Client>();
  private show: LiveShow | null = null;
  private starting = false;
  private usedQuestions: string[] = [];
  private queue: QueueItem[] = [];
  private answering = false;
  private showTimers: NodeJS.Timeout[] = [];
  private turtleTimers: NodeJS.Timeout[] = [];
  private turtleGen = 0;
  private spot: TurtleSpot = { holder: "box", sessionId: null, nickname: "小綠", zoneId: "coral" };

  constructor(
    private readonly store: Store,
    private readonly content: ContentRepo,
  ) {}

  attach(wss: WebSocketServer): void {
    wss.on("connection", (ws) => {
      const client: Client = { id: randomUUID(), ws, role: null, zoneId: null };
      this.clients.add(client);
      const helloTimer = setTimeout(() => {
        if (!client.role) ws.close();
      }, 8000);
      const beat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) this.send(ws, { v: 1, type: "ping" });
      }, 25000);
      ws.on("message", (data) => {
        void this.onMessage(client, data, helloTimer);
      });
      ws.on("close", () => {
        clearTimeout(helloTimer);
        clearInterval(beat);
        this.clients.delete(client);
        if (client.zoneId) this.pushPresence(client.zoneId);
      });
    });
  }

  close(): void {
    this.clearShowTimers();
    this.clearTurtleTimers();
    for (const client of this.clients) client.ws.close();
    this.clients.clear();
  }

  private async onMessage(client: Client, data: RawData, helloTimer: NodeJS.Timeout): Promise<void> {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(String(data)) as Record<string, unknown>;
    } catch {
      return;
    }
    if (message.type !== "hello" && !client.role) return;
    try {
      switch (message.type) {
        case "hello":
          clearTimeout(helloTimer);
          await this.hello(client, message);
          break;
        case "set_zone":
          await this.setZone(client, String(message.zoneId ?? ""));
          break;
        case "send_turtle":
          await this.sendTurtle(client);
          break;
        case "recall_turtle":
          this.recallTurtle(client);
          break;
        case "enqueue_question":
          await this.enqueue(client, String(message.text ?? ""));
          break;
        case "show_start":
          await this.startShow(client);
          break;
        case "show_answer":
          await this.showAnswer(client, message);
          break;
        case "pong":
          break;
        default:
          this.fail(client.ws, "不認識的訊息");
      }
    } catch (error) {
      this.fail(client.ws, error instanceof Error ? error.message : "動作失敗");
    }
  }

  private async hello(client: Client, message: Record<string, unknown>): Promise<void> {
    if (message.role === "display") {
      const zone = this.content.zoneById(String(message.zoneId ?? ""))?.id ?? this.spot.zoneId;
      client.role = "display";
      client.zoneId = zone;
    } else if (message.role === "phone") {
      const session = await this.store.getSession(String(message.sessionId ?? ""));
      if (!session) throw new Error("找不到這個行程");
      const zone = this.content.zoneById(String(message.zoneId ?? ""))?.id ?? session.currentZoneId ?? "coral";
      client.role = "phone";
      client.sessionId = session.id;
      client.zoneId = zone;
      await touchZone(this.store, session, zone);
    } else {
      throw new Error("請說明你是手機還是展示箱");
    }
    this.send(client.ws, { v: 1, type: "hello_ok", role: client.role, zoneId: client.zoneId, sessionId: client.sessionId ?? null });
    this.send(client.ws, this.snapshot());
    this.send(client.ws, this.queueMessage());
    if (this.show && (client.role === "display" || client.zoneId === this.show.zoneId)) {
      if (client.role === "display") client.zoneId = this.show.zoneId;
      this.send(client.ws, this.showMessage(client.role === "display" ? "display" : "phone"));
      this.resendPersonal(client);
    }
    if (client.zoneId) this.pushPresence(client.zoneId);
  }

  private async setZone(client: Client, zoneId: string): Promise<void> {
    if (!client.role) return;
    if (!this.content.zoneById(zoneId)) throw new Error("沒有這個展區");
    const previous = client.zoneId;
    client.zoneId = zoneId;
    if (client.role === "phone" && client.sessionId) {
      const session = await this.store.getSession(client.sessionId);
      if (session) await touchZone(this.store, session, zoneId);
    }
    this.send(client.ws, { v: 1, type: "zone", zoneId });
    if (previous) this.pushPresence(previous);
    this.pushPresence(zoneId);
    if (this.show && (client.role === "display" || zoneId === this.show.zoneId)) {
      this.send(client.ws, this.showMessage(client.role === "display" ? "display" : "phone"));
    }
  }

  private async sendTurtle(client: Client): Promise<void> {
    if (client.role !== "phone" || !client.sessionId) throw new Error("只有手機可以把小綠送過來");
    const session = await this.store.getSession(client.sessionId);
    if (!session) throw new Error("找不到這個行程");
    const zoneId = client.zoneId || session.currentZoneId;
    if (!zoneId) throw new Error("請先選擇展區");
    if (this.show && this.show.phase !== "done" && this.show.zoneId !== zoneId) {
      throw new Error("展示箱正在進行別區的團體題");
    }
    const gen = ++this.turtleGen;
    this.clearTurtleTimers();
    const nickname = session.nickname || "訪客";
    this.spot = { holder: "box", sessionId: session.id, nickname, zoneId };
    for (const other of this.clients) {
      if (other.role === "display") other.zoneId = zoneId;
    }
    this.emitTurtle({ v: 1, type: "turtle", who: "phone", action: "exit", sessionId: session.id, nickname, zoneId });
    this.turtleTimers.push(
      setTimeout(() => {
        if (gen !== this.turtleGen) return;
        this.emitTurtle({ v: 1, type: "turtle", who: "box", action: "enter", sessionId: session.id, nickname, zoneId });
        this.pushPresence(zoneId);
      }, SWIM_MS),
    );
  }

  private recallTurtle(client: Client): void {
    const owner = this.spot.sessionId;
    if (!owner) throw new Error("小綠現在就在展示箱裡");
    if (client.role === "phone" && client.sessionId !== owner) throw new Error("現在展示箱上是另一位訪客的小綠");
    const gen = ++this.turtleGen;
    this.clearTurtleTimers();
    const nickname = this.spot.nickname;
    const zoneId = this.spot.zoneId;
    this.emitTurtle({ v: 1, type: "turtle", who: "box", action: "exit", sessionId: owner, nickname, zoneId });
    this.turtleTimers.push(
      setTimeout(() => {
        if (gen !== this.turtleGen) return;
        this.spot = { holder: "box", sessionId: null, nickname: "小綠", zoneId };
        this.emitTurtle({ v: 1, type: "turtle", who: "phone", action: "enter", sessionId: owner, nickname, zoneId });
        this.emitTurtle({ v: 1, type: "turtle", who: "box", action: "enter", sessionId: null, nickname: "小綠", zoneId });
      }, SWIM_MS),
    );
  }

  private async enqueue(client: Client, text: string): Promise<void> {
    if (client.role !== "phone" || !client.sessionId) throw new Error("只有手機可以把問題送到展示箱");
    const clean = text.trim();
    if (clean.length < 2 || clean.length > 80) throw new Error("問題請寫 2 到 80 個字");
    const zoneId = client.zoneId;
    if (!zoneId) throw new Error("請先選擇展區");
    mergeIntoQueue(this.queue, { text: clean, zoneId, sessionId: client.sessionId });
    this.broadcastAll(this.queueMessage());
    if (!this.show) await this.maybeAnswerQueue();
  }

  private async startShow(client: Client): Promise<void> {
    if (this.show || this.starting) throw new Error("這一區正在進行團體題");
    const zoneId = client.zoneId;
    if (!zoneId || !this.content.zoneById(zoneId)) throw new Error("請先選擇展區");
    const phones = this.phonesIn(zoneId);
    if (phones === 0) throw new Error("這個展區還沒有手機加入");
    const picked = this.content.pickShowQuestion(zoneId, this.usedQuestions);
    if (!picked) throw new Error("這個展區還沒有題目");
    this.starting = true;
    try {
      const view = await this.content.conceptView(picked.concept);
      this.usedQuestions.push(picked.question.id);
      if (this.usedQuestions.length > 40) this.usedQuestions.shift();
      this.show = {
        id: randomUUID(),
        zoneId,
        mode: phones === 1 ? "solo" : "group",
        phase: "announce",
        endsAt: Date.now(),
        questionId: picked.question.id,
        prompt: picked.question.prompt,
        choices: picked.question.choices,
        expectedSec: picked.question.expectedSec,
        conceptId: view.id,
        conceptTitle: view.title,
        boxExplain: view.boxExplain,
        correctIndex: picked.question.answer,
        answers: new Map(),
      };
      for (const other of this.clients) {
        if (other.role === "display") other.zoneId = zoneId;
      }
      this.enter("announce");
    } finally {
      this.starting = false;
    }
  }

  private async showAnswer(client: Client, message: Record<string, unknown>): Promise<void> {
    if (client.role !== "phone" || !client.sessionId) throw new Error("請用手機作答");
    if (!this.show || message.showId !== this.show.id) throw new Error("目前沒有這一題");
    if (this.show.phase !== "answer") throw new Error("作答時間已結束");
    if (client.zoneId !== this.show.zoneId) throw new Error("你不在這一區");
    if (this.show.answers.has(client.sessionId)) throw new Error("已經答過了");
    const choiceIndex = Number(message.choiceIndex);
    const latencyRaw = Number(message.latencyMs);
    this.show.answers.set(client.sessionId, {
      pending: true,
      choiceIndex: 0,
      correct: false,
      latencyMs: 0,
      remediation: null,
    });
    try {
      const session = await this.store.getSession(client.sessionId);
      if (!session) throw new Error("找不到這個行程");
      const result = await gradeAnswer({
        store: this.store,
        content: this.content,
        session,
        questionId: this.show.questionId,
        choiceIndex,
        latencyMs: Number.isFinite(latencyRaw) ? latencyRaw : null,
        kind: "show",
      });
      this.show.answers.set(client.sessionId, {
        pending: false,
        choiceIndex,
        correct: result.correct,
        latencyMs: Number.isFinite(latencyRaw) ? latencyRaw : result.masteryAfter,
        remediation: result.strategy,
      });
      this.broadcastShow();
    } catch (error) {
      this.show?.answers.delete(client.sessionId);
      throw error;
    }
  }

  private enter(phase: Phase): void {
    if (!this.show) return;
    this.clearShowTimers();
    if (phase === "done") {
      this.broadcastAll({ v: 1, type: "show_state", show: null });
      this.show = null;
      this.showTimers.push(setTimeout(() => void this.maybeAnswerQueue(), 400));
      return;
    }
    this.show.phase = phase;
    const timings = getTimings();
    const ms = timings[phase];
    this.show.endsAt = Date.now() + ms;
    if (phase === "results") this.deliverPersonal();
    if (phase === "explain") this.deliverRemediations();
    this.broadcastShow();
    const next: Record<Exclude<Phase, "done">, Phase> = {
      announce: "answer",
      answer: "results",
      results: "explain",
      explain: "done",
    };
    this.showTimers.push(setTimeout(() => this.enter(next[phase]), ms));
  }

  private broadcastShow(): void {
    if (!this.show) return;
    for (const client of this.clients) {
      if (client.role === "display") {
        client.zoneId = this.show.zoneId;
        this.send(client.ws, this.showMessage("display"));
      } else if (client.role === "phone" && client.zoneId === this.show.zoneId) {
        this.send(client.ws, this.showMessage("phone"));
      }
    }
  }

  private deliverPersonal(): void {
    if (!this.show) return;
    for (const [sessionId, answer] of this.show.answers) {
      if (answer.pending) continue;
      this.sendToSession(sessionId, {
        v: 1,
        type: "show_personal",
        showId: this.show.id,
        correct: answer.correct,
        choiceIndex: answer.choiceIndex,
      });
    }
  }

  private deliverRemediations(): void {
    if (!this.show) return;
    for (const [sessionId, answer] of this.show.answers) {
      if (!answer.remediation || answer.pending) continue;
      this.sendToSession(sessionId, { v: 1, type: "personal_remediation", showId: this.show.id, ...answer.remediation });
    }
  }

  private resendPersonal(client: Client): void {
    if (!this.show || !client.sessionId) return;
    const answer = this.show.answers.get(client.sessionId);
    if (!answer || answer.pending) return;
    if (this.show.phase === "results" || this.show.phase === "explain") {
      this.send(client.ws, {
        v: 1,
        type: "show_personal",
        showId: this.show.id,
        correct: answer.correct,
        choiceIndex: answer.choiceIndex,
      });
    }
    if (this.show.phase === "explain" && answer.remediation) {
      this.send(client.ws, { v: 1, type: "personal_remediation", showId: this.show.id, ...answer.remediation });
    }
  }

  private showMessage(role: "phone" | "display") {
    if (!this.show) return { v: 1, type: "show_state", show: null };
    const stats = this.stats(this.show);
    const reveal =
      role === "display" ? this.show.phase !== "announce" : this.show.phase === "results" || this.show.phase === "explain";
    const show: Record<string, unknown> = {
      id: this.show.id,
      zoneId: this.show.zoneId,
      mode: this.show.mode,
      phase: this.show.phase,
      endsAt: this.show.endsAt,
      serverNow: Date.now(),
      question: {
        id: this.show.questionId,
        prompt: this.show.prompt,
        choices: this.show.choices,
        expectedSec: this.show.expectedSec,
        conceptId: this.show.conceptId,
        conceptTitle: this.show.conceptTitle,
      },
    };
    if (reveal) show.results = { counts: stats.counts, submitted: stats.submitted, correct: stats.correct };
    if (this.show.phase === "explain") {
      show.explain = {
        headline: stats.headline,
        text: this.show.boxExplain,
        correctIndex: this.show.correctIndex,
        topWrongIndex: stats.topWrongIndex,
        allCorrect: stats.allCorrect,
      };
    }
    return { v: 1, type: "show_state", show };
  }

  private stats(show: LiveShow) {
    const counts = [0, 0, 0, 0];
    let submitted = 0;
    let correct = 0;
    for (const answer of show.answers.values()) {
      if (answer.pending) continue;
      submitted += 1;
      counts[answer.choiceIndex] = (counts[answer.choiceIndex] ?? 0) + 1;
      if (answer.correct) correct += 1;
    }
    let topWrong = -1;
    let topN = 0;
    counts.forEach((count, index) => {
      if (index !== show.correctIndex && count > topN) {
        topN = count;
        topWrong = index;
      }
    });
    const allCorrect = submitted > 0 && correct === submitted;
    const headline = allCorrect
      ? show.mode === "solo"
        ? "你答對了"
        : "這題大家都答對了"
      : show.mode === "solo"
        ? `我們再看一次「${show.conceptTitle}」`
        : `最多人沒掌握的是「${show.conceptTitle}」`;
    return { counts, submitted, correct, allCorrect, headline, topWrongIndex: topWrong >= 0 ? topWrong : null };
  }

  private async maybeAnswerQueue(): Promise<void> {
    if (this.answering || this.show) return;
    const pending = this.queue.filter((item) => !item.answered).sort((a, b) => b.votes - a.votes || a.createdAt - b.createdAt);
    const top = pending[0];
    if (!top) return;
    this.answering = true;
    try {
      const session = await this.store.getSession(top.sessionIds[0] ?? "");
      if (!session) {
        top.answered = true;
        return;
      }
      const result = await answerChat({
        store: this.store,
        content: this.content,
        session: { ...session, currentZoneId: top.zoneId },
        message: top.text,
        style: "box",
        includeMemory: false,
        persist: false,
      });
      top.answered = true;
      this.broadcastAll({
        v: 1,
        type: "box_answer",
        question: top.text,
        votes: top.votes,
        reply: result.reply,
        sources: result.sources.map((item) => ({ id: item.id, title: item.title })),
      });
      await this.store.addEvent({
        id: randomUUID(),
        ts: Date.now(),
        sessionId: session.id,
        type: "box_question",
        payload: { zoneId: top.zoneId, text: top.text, votes: top.votes, intent: result.intent, sourceIds: result.sources.map((item) => item.id) },
      });
      this.broadcastAll(this.queueMessage());
    } catch (error) {
      console.error(error);
      top.answered = true;
      this.broadcastAll({
        v: 1,
        type: "box_answer",
        question: top.text,
        votes: top.votes,
        reply: "我暫時沒辦法回答這題，請改問現場教育人員。",
        sources: [],
      });
    } finally {
      this.answering = false;
    }
  }

  private queueMessage() {
    return {
      v: 1,
      type: "queue",
      items: this.queue
        .filter((item) => !item.answered)
        .sort((a, b) => b.votes - a.votes || a.createdAt - b.createdAt)
        .map((item) => ({ id: item.id, text: item.text, votes: item.votes, zoneId: item.zoneId })),
    };
  }

  private snapshot() {
    return {
      v: 1,
      type: "turtle_snapshot",
      holder: "box" as const,
      sessionId: this.spot.sessionId,
      nickname: this.spot.nickname,
      zoneId: this.spot.zoneId,
    };
  }

  private emitTurtle(message: Record<string, unknown>): void {
    if (message.who === "phone") {
      this.sendToSession(String(message.sessionId ?? ""), message);
      return;
    }
    for (const client of this.clients) {
      if (client.role === "display" || client.sessionId === message.sessionId) this.send(client.ws, message);
    }
  }

  private pushPresence(zoneId: string): void {
    const msg = {
      v: 1,
      type: "presence",
      zoneId,
      phones: this.phonesIn(zoneId),
      displays: [...this.clients].filter((client) => client.role === "display" && client.zoneId === zoneId).length,
    };
    for (const client of this.clients) {
      if (client.zoneId === zoneId || client.role === "display") this.send(client.ws, msg);
    }
  }

  private phonesIn(zoneId: string): number {
    return [...this.clients].filter((client) => client.role === "phone" && client.zoneId === zoneId).length;
  }

  private sendToSession(sessionId: string, message: Record<string, unknown>): void {
    for (const client of this.clients) {
      if (client.sessionId === sessionId) this.send(client.ws, message);
    }
  }

  private broadcastAll(message: Record<string, unknown>): void {
    for (const client of this.clients) this.send(client.ws, message);
  }

  private send(ws: WebSocket, message: Record<string, unknown>): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }

  private fail(ws: WebSocket, message: string): void {
    this.send(ws, { v: 1, type: "error", message });
  }

  private clearShowTimers(): void {
    for (const timer of this.showTimers) clearTimeout(timer);
    this.showTimers = [];
  }

  private clearTurtleTimers(): void {
    for (const timer of this.turtleTimers) clearTimeout(timer);
    this.turtleTimers = [];
  }
}
