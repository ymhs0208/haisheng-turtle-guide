export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  nickname text NOT NULL,
  age_group text NOT NULL,
  experiment_group text NOT NULL,
  visit_ends_at bigint NOT NULL,
  current_zone_id text,
  created_at bigint NOT NULL,
  visited_zones jsonb NOT NULL DEFAULT '[]',
  asked_questions jsonb NOT NULL DEFAULT '[]',
  wrong_concept_ids jsonb NOT NULL DEFAULT '[]',
  answered_question_ids jsonb NOT NULL DEFAULT '[]',
  mentioned_memory_ids jsonb NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS mastery (
  session_id text NOT NULL,
  concept_id text NOT NULL,
  p_know double precision NOT NULL,
  attempts integer NOT NULL,
  correct integer NOT NULL,
  remediations integer NOT NULL,
  last_strategy text,
  PRIMARY KEY (session_id, concept_id)
);

CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY,
  ts bigint NOT NULL,
  session_id text,
  type text NOT NULL,
  payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS events_ts ON events (ts);

CREATE TABLE IF NOT EXISTS chats (
  id text PRIMARY KEY,
  session_id text NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]',
  intent text,
  ts bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS chats_session_ts ON chats (session_id, ts);

CREATE TABLE IF NOT EXISTS concept_overrides (
  concept_id text PRIMARY KEY,
  title text,
  summary text
);

CREATE TABLE IF NOT EXISTS chunks (
  id text PRIMARY KEY,
  zone_id text NOT NULL,
  tags text[] NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  embedding_json jsonb NOT NULL,
  embedding vector(64)
);
`;

export const VECTOR_INDEX_SQL =
  "CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops)";
