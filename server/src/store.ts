import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { resolveJsonPath } from "./config.js";
import { EMBED_DIM, cosine } from "./embed.js";
import { SCHEMA_SQL, VECTOR_INDEX_SQL } from "./schema.js";
import { DEFAULT_BKT } from "./bkt.js";
import type {
  ChatRow,
  ConceptOverride,
  LearningEvent,
  Mastery,
  ScoredChunk,
  Session,
  StoredChunk,
  StrategyId,
} from "./types.js";

const { Pool } = pg;

export interface Store {
  kind: "memory" | "postgres";
  vectorMode: "memory" | "pgvector";
  ready(): Promise<void>;
  close(): Promise<void>;
  createSession(session: Session): Promise<void>;
  getSession(id: string): Promise<Session | null>;
  saveSession(session: Session): Promise<void>;
  listSessions(): Promise<Session[]>;
  getMastery(sessionId: string): Promise<Mastery[]>;
  getMasteryOne(sessionId: string, conceptId: string): Promise<Mastery>;
  saveMastery(mastery: Mastery): Promise<void>;
  listMastery(): Promise<Mastery[]>;
  addEvent(event: LearningEvent): Promise<void>;
  listEvents(): Promise<LearningEvent[]>;
  addChat(row: ChatRow): Promise<void>;
  recentChat(sessionId: string, limit: number): Promise<ChatRow[]>;
  upsertOverride(override: ConceptOverride): Promise<void>;
  listOverrides(): Promise<ConceptOverride[]>;
  replaceChunks(chunks: StoredChunk[]): Promise<void>;
  searchChunks(embedding: number[], limit: number): Promise<ScoredChunk[]>;
}

interface Snapshot {
  sessions: Session[];
  mastery: Mastery[];
  events: LearningEvent[];
  chats: ChatRow[];
  overrides: ConceptOverride[];
}

function defaultMastery(sessionId: string, conceptId: string): Mastery {
  return {
    sessionId,
    conceptId,
    pKnow: DEFAULT_BKT.pL0,
    attempts: 0,
    correct: 0,
    remediations: 0,
    lastStrategy: null,
  };
}

export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  readonly vectorMode = "memory" as const;
  private sessions = new Map<string, Session>();
  private mastery: Mastery[] = [];
  private events: LearningEvent[] = [];
  private chats: ChatRow[] = [];
  private overrides: ConceptOverride[] = [];
  private chunks: StoredChunk[] = [];
  private readyOnce = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly persist: boolean;
  private readonly file: string;

  constructor(options: { persist?: boolean; file?: string } = {}) {
    this.persist = options.persist ?? false;
    this.file = options.file ?? "";
  }

  async ready(): Promise<void> {
    if (this.readyOnce) return;
    this.readyOnce = true;
    if (!this.persist || !this.file || !existsSync(this.file)) return;
    try {
      const snapshot = JSON.parse(readFileSync(this.file, "utf8")) as Snapshot;
      for (const session of snapshot.sessions ?? []) this.sessions.set(session.id, session);
      this.mastery = snapshot.mastery ?? [];
      this.events = snapshot.events ?? [];
      this.chats = snapshot.chats ?? [];
      this.overrides = snapshot.overrides ?? [];
    } catch (error) {
      const broken = `${this.file}.bad`;
      try {
        renameSync(this.file, broken);
      } catch {
        /* 讀不到就從空資料開始 */
      }
      console.error("JSON 紀錄無法讀取，已改從空白開始", error);
    }
  }

  async close(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    await this.flush();
  }

  private schedule(): void {
    if (!this.persist || !this.file) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, 150);
  }

  private async flush(): Promise<void> {
    if (!this.persist || !this.file) return;
    const snapshot: Snapshot = {
      sessions: [...this.sessions.values()],
      mastery: this.mastery,
      events: this.events,
      chats: this.chats,
      overrides: this.overrides,
    };
    mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(snapshot));
    renameSync(tmp, this.file);
  }

  async createSession(session: Session): Promise<void> {
    this.sessions.set(session.id, session);
    this.schedule();
  }

  async getSession(id: string): Promise<Session | null> {
    return this.sessions.get(id) ?? null;
  }

  async saveSession(session: Session): Promise<void> {
    this.sessions.set(session.id, session);
    this.schedule();
  }

  async listSessions(): Promise<Session[]> {
    return [...this.sessions.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  async getMastery(sessionId: string): Promise<Mastery[]> {
    return this.mastery.filter((item) => item.sessionId === sessionId);
  }

  async getMasteryOne(sessionId: string, conceptId: string): Promise<Mastery> {
    return (
      this.mastery.find((item) => item.sessionId === sessionId && item.conceptId === conceptId) ??
      defaultMastery(sessionId, conceptId)
    );
  }

  async saveMastery(mastery: Mastery): Promise<void> {
    const index = this.mastery.findIndex(
      (item) => item.sessionId === mastery.sessionId && item.conceptId === mastery.conceptId,
    );
    if (index >= 0) this.mastery[index] = mastery;
    else this.mastery.push(mastery);
    this.schedule();
  }

  async listMastery(): Promise<Mastery[]> {
    return [...this.mastery];
  }

  async addEvent(event: LearningEvent): Promise<void> {
    this.events.push(event);
    this.schedule();
  }

  async listEvents(): Promise<LearningEvent[]> {
    return [...this.events].sort((a, b) => a.ts - b.ts);
  }

  async addChat(row: ChatRow): Promise<void> {
    this.chats.push(row);
    this.schedule();
  }

  async recentChat(sessionId: string, limit: number): Promise<ChatRow[]> {
    return this.chats.filter((item) => item.sessionId === sessionId).slice(-limit);
  }

  async upsertOverride(override: ConceptOverride): Promise<void> {
    const index = this.overrides.findIndex((item) => item.conceptId === override.conceptId);
    if (index >= 0) this.overrides[index] = override;
    else this.overrides.push(override);
    this.schedule();
  }

  async listOverrides(): Promise<ConceptOverride[]> {
    return [...this.overrides];
  }

  async replaceChunks(chunks: StoredChunk[]): Promise<void> {
    this.chunks = chunks;
  }

  async searchChunks(embedding: number[], limit: number): Promise<ScoredChunk[]> {
    return this.chunks
      .map((chunk) => ({
        id: chunk.id,
        zoneId: chunk.zoneId,
        tags: chunk.tags,
        title: chunk.title,
        body: chunk.body,
        raw: cosine(embedding, chunk.embedding),
      }))
      .sort((a, b) => b.raw - a.raw)
      .slice(0, limit);
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function sessionFromRow(row: Record<string, unknown>): Session {
  return {
    id: String(row.id),
    nickname: String(row.nickname ?? ""),
    ageGroup: row.age_group as Session["ageGroup"],
    experimentGroup: row.experiment_group as Session["experimentGroup"],
    visitEndsAt: Number(row.visit_ends_at),
    currentZoneId: row.current_zone_id ? String(row.current_zone_id) : null,
    createdAt: Number(row.created_at),
    visitedZones: asStringArray(row.visited_zones),
    askedQuestions: asStringArray(row.asked_questions),
    wrongConceptIds: asStringArray(row.wrong_concept_ids),
    answeredQuestionIds: asStringArray(row.answered_question_ids),
    mentionedMemoryIds: asStringArray(row.mentioned_memory_ids),
  };
}

function masteryFromRow(row: Record<string, unknown>): Mastery {
  return {
    sessionId: String(row.session_id),
    conceptId: String(row.concept_id),
    pKnow: Number(row.p_know),
    attempts: Number(row.attempts),
    correct: Number(row.correct),
    remediations: Number(row.remediations),
    lastStrategy: row.last_strategy ? (String(row.last_strategy) as StrategyId) : null,
  };
}

function toVector(values: number[]): string {
  return `[${values.map((value) => (Number.isFinite(value) ? value.toFixed(6) : 0)).join(",")}]`;
}

export class PgStore implements Store {
  readonly kind = "postgres" as const;
  vectorMode: "memory" | "pgvector" = "pgvector";
  private pool: pg.Pool | null = null;

  constructor(private readonly url: string) {}

  private db(): pg.Pool {
    if (!this.pool) throw new Error("資料庫尚未就緒");
    return this.pool;
  }

  async ready(): Promise<void> {
    let last: unknown;
    for (let attempt = 1; attempt <= 30; attempt++) {
      const pool = new Pool({ connectionString: this.url, max: 5 });
      try {
        await pool.query("SELECT 1");
        this.pool = pool;
        break;
      } catch (error) {
        last = error;
        await pool.end();
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    if (!this.pool) {
      console.error(last);
      throw new Error("無法連上 PostgreSQL。請確認資料庫已啟動，或拿掉 DATABASE_URL 改用 JSON 備援。");
    }
    try {
      await this.pool.query("CREATE EXTENSION IF NOT EXISTS vector");
    } catch (error) {
      await this.pool.end();
      this.pool = null;
      console.error(error);
      throw new Error(
        "PostgreSQL 沒有 pgvector。請用 docker compose 的資料庫，或不要設定 DATABASE_URL，改走 JSON 備援。",
      );
    }
    const statements = SCHEMA_SQL.split(/;\s*\n/)
      .map((part) => part.trim())
      .filter((part) => part && !part.startsWith("--"));
    for (const statement of statements) {
      await this.pool.query(statement);
    }
    try {
      await this.pool.query(VECTOR_INDEX_SQL);
    } catch (error) {
      this.vectorMode = "memory";
      console.error("pgvector 索引沒有建成，檢索改走應用層餘弦", error);
    }
  }

  async close(): Promise<void> {
    await this.pool?.end();
    this.pool = null;
  }

  async createSession(session: Session): Promise<void> {
    await this.db().query(
      `INSERT INTO sessions (
        id, nickname, age_group, experiment_group, visit_ends_at, current_zone_id, created_at,
        visited_zones, asked_questions, wrong_concept_ids, answered_question_ids, mentioned_memory_ids
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb)`,
      [
        session.id,
        session.nickname,
        session.ageGroup,
        session.experimentGroup,
        session.visitEndsAt,
        session.currentZoneId,
        session.createdAt,
        JSON.stringify(session.visitedZones),
        JSON.stringify(session.askedQuestions),
        JSON.stringify(session.wrongConceptIds),
        JSON.stringify(session.answeredQuestionIds),
        JSON.stringify(session.mentionedMemoryIds),
      ],
    );
  }

  async getSession(id: string): Promise<Session | null> {
    const result = await this.db().query("SELECT * FROM sessions WHERE id = $1", [id]);
    return result.rows[0] ? sessionFromRow(result.rows[0]) : null;
  }

  async saveSession(session: Session): Promise<void> {
    await this.db().query(
      `UPDATE sessions SET
        nickname=$2, age_group=$3, experiment_group=$4, visit_ends_at=$5, current_zone_id=$6,
        visited_zones=$7::jsonb, asked_questions=$8::jsonb, wrong_concept_ids=$9::jsonb,
        answered_question_ids=$10::jsonb, mentioned_memory_ids=$11::jsonb
       WHERE id=$1`,
      [
        session.id,
        session.nickname,
        session.ageGroup,
        session.experimentGroup,
        session.visitEndsAt,
        session.currentZoneId,
        JSON.stringify(session.visitedZones),
        JSON.stringify(session.askedQuestions),
        JSON.stringify(session.wrongConceptIds),
        JSON.stringify(session.answeredQuestionIds),
        JSON.stringify(session.mentionedMemoryIds),
      ],
    );
  }

  async listSessions(): Promise<Session[]> {
    const result = await this.db().query("SELECT * FROM sessions ORDER BY created_at ASC");
    return result.rows.map((row) => sessionFromRow(row));
  }

  async getMastery(sessionId: string): Promise<Mastery[]> {
    const result = await this.db().query("SELECT * FROM mastery WHERE session_id = $1", [sessionId]);
    return result.rows.map((row) => masteryFromRow(row));
  }

  async getMasteryOne(sessionId: string, conceptId: string): Promise<Mastery> {
    const result = await this.db().query(
      "SELECT * FROM mastery WHERE session_id = $1 AND concept_id = $2",
      [sessionId, conceptId],
    );
    return result.rows[0] ? masteryFromRow(result.rows[0]) : defaultMastery(sessionId, conceptId);
  }

  async saveMastery(mastery: Mastery): Promise<void> {
    await this.db().query(
      `INSERT INTO mastery (session_id, concept_id, p_know, attempts, correct, remediations, last_strategy)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (session_id, concept_id) DO UPDATE SET
         p_know=EXCLUDED.p_know, attempts=EXCLUDED.attempts, correct=EXCLUDED.correct,
         remediations=EXCLUDED.remediations, last_strategy=EXCLUDED.last_strategy`,
      [
        mastery.sessionId,
        mastery.conceptId,
        mastery.pKnow,
        mastery.attempts,
        mastery.correct,
        mastery.remediations,
        mastery.lastStrategy,
      ],
    );
  }

  async listMastery(): Promise<Mastery[]> {
    const result = await this.db().query("SELECT * FROM mastery");
    return result.rows.map((row) => masteryFromRow(row));
  }

  async addEvent(event: LearningEvent): Promise<void> {
    await this.db().query(
      "INSERT INTO events (id, ts, session_id, type, payload) VALUES ($1,$2,$3,$4,$5::jsonb)",
      [event.id, event.ts, event.sessionId, event.type, JSON.stringify(event.payload)],
    );
  }

  async listEvents(): Promise<LearningEvent[]> {
    const result = await this.db().query("SELECT * FROM events ORDER BY ts ASC");
    return result.rows.map((row) => ({
      id: String(row.id),
      ts: Number(row.ts),
      sessionId: row.session_id ? String(row.session_id) : null,
      type: String(row.type),
      payload: (row.payload ?? {}) as Record<string, unknown>,
    }));
  }

  async addChat(row: ChatRow): Promise<void> {
    await this.db().query(
      "INSERT INTO chats (id, session_id, role, content, sources, intent, ts) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)",
      [row.id, row.sessionId, row.role, row.content, JSON.stringify(row.sources), row.intent, row.ts],
    );
  }

  async recentChat(sessionId: string, limit: number): Promise<ChatRow[]> {
    const result = await this.db().query(
      "SELECT * FROM chats WHERE session_id = $1 ORDER BY ts DESC LIMIT $2",
      [sessionId, limit],
    );
    return result.rows.reverse().map((row) => ({
      id: String(row.id),
      sessionId: String(row.session_id),
      role: row.role as ChatRow["role"],
      content: String(row.content),
      sources: (row.sources ?? []) as ChatRow["sources"],
      intent: row.intent ? String(row.intent) : null,
      ts: Number(row.ts),
    }));
  }

  async upsertOverride(override: ConceptOverride): Promise<void> {
    await this.db().query(
      `INSERT INTO concept_overrides (concept_id, title, summary) VALUES ($1,$2,$3)
       ON CONFLICT (concept_id) DO UPDATE SET title=EXCLUDED.title, summary=EXCLUDED.summary`,
      [override.conceptId, override.title, override.summary],
    );
  }

  async listOverrides(): Promise<ConceptOverride[]> {
    const result = await this.db().query("SELECT * FROM concept_overrides");
    return result.rows.map((row) => ({
      conceptId: String(row.concept_id),
      title: row.title ? String(row.title) : null,
      summary: row.summary ? String(row.summary) : null,
    }));
  }

  async replaceChunks(chunks: StoredChunk[]): Promise<void> {
    const client = await this.db().connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM chunks");
      for (const chunk of chunks) {
        const vector = chunk.embedding.length === EMBED_DIM ? toVector(chunk.embedding) : null;
        await client.query(
          `INSERT INTO chunks (id, zone_id, tags, title, body, embedding_json, embedding)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::vector)`,
          [
            chunk.id,
            chunk.zoneId,
            chunk.tags,
            chunk.title,
            chunk.body,
            JSON.stringify(chunk.embedding),
            vector,
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async searchChunks(embedding: number[], limit: number): Promise<ScoredChunk[]> {
    if (embedding.length === EMBED_DIM && this.vectorMode === "pgvector") {
      try {
        const result = await this.db().query(
          `SELECT id, zone_id, tags, title, body, 1 - (embedding <=> $1::vector) AS raw
           FROM chunks
           WHERE embedding IS NOT NULL
           ORDER BY embedding <=> $1::vector
           LIMIT $2`,
          [toVector(embedding), limit],
        );
        return result.rows.map((row) => ({
          id: String(row.id),
          zoneId: String(row.zone_id),
          tags: row.tags as string[],
          title: String(row.title),
          body: String(row.body),
          raw: Number(row.raw),
        }));
      } catch (error) {
        console.error("pgvector 查詢失敗，改走應用層", error);
      }
    }
    const result = await this.db().query("SELECT id, zone_id, tags, title, body, embedding_json FROM chunks");
    return result.rows
      .map((row) => ({
        id: String(row.id),
        zoneId: String(row.zone_id),
        tags: row.tags as string[],
        title: String(row.title),
        body: String(row.body),
        raw: cosine(embedding, (row.embedding_json as number[]) ?? []),
      }))
      .sort((a, b) => b.raw - a.raw)
      .slice(0, limit);
  }
}

export async function createStoreFromEnv(): Promise<Store> {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const store = new PgStore(url);
    await store.ready();
    return store;
  }
  const store = new MemoryStore({ persist: true, file: resolveJsonPath() });
  await store.ready();
  return store;
}
