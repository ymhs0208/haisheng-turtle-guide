import { cosine } from "./embed.js";

export interface RankInput {
  id: string;
  zoneId: string;
  title: string;
  body: string;
  tags: string[];
  embedding: number[];
}

export interface Ranked {
  id: string;
  zoneId: string;
  title: string;
  body: string;
  tags: string[];
  raw: number;
  keyword: number;
  score: number;
}

const THRESHOLD = 0.45;
const COVERAGE_FLOOR = 0.28;

export function queryCoverage(query: string, text: string): number {
  const wanted = [...new Set(textTokens(query).filter((token) => token.length >= 2))];
  if (wanted.length === 0) return 0;
  const have = new Set(textTokens(text));
  return wanted.filter((token) => have.has(token)).length / wanted.length;
}
const ZONE_BOOST = 0.08;

export function textTokens(text: string): string[] {
  const compact = text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const tokens: string[] = [];
  for (let i = 0; i < compact.length; i += 1) {
    tokens.push(compact[i] ?? "");
    if (i + 1 < compact.length) tokens.push(compact.slice(i, i + 2));
  }
  return tokens.filter(Boolean);
}

/** Small BM25 over character unigrams and bigrams. Scores are scaled to 0–1. */
export function keywordScores(query: string, docs: { id: string; text: string }[]): Map<string, number> {
  const qTokens = textTokens(query);
  const scores = new Map<string, number>();
  if (qTokens.length === 0 || docs.length === 0) return scores;
  const docsTokens = docs.map((doc) => textTokens(doc.text));
  const avg = docsTokens.reduce((sum, tokens) => sum + tokens.length, 0) / docs.length || 1;
  const df = new Map<string, number>();
  for (const tokens of docsTokens) {
    for (const token of new Set(tokens)) df.set(token, (df.get(token) ?? 0) + 1);
  }
  const k1 = 1.2;
  const b = 0.75;
  docs.forEach((doc, index) => {
    const tokens = docsTokens[index] ?? [];
    const tf = new Map<string, number>();
    for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
    let score = 0;
    for (const token of new Set(qTokens)) {
      const freq = tf.get(token) ?? 0;
      if (!freq) continue;
      const idf = Math.log(1 + (docs.length - (df.get(token) ?? 0) + 0.5) / ((df.get(token) ?? 0) + 0.5));
      const norm = (freq * (k1 + 1)) / (freq + k1 * (1 - b + (b * tokens.length) / avg));
      score += idf * norm;
    }
    scores.set(doc.id, score);
  });
  const max = Math.max(0, ...scores.values());
  if (max > 0) {
    for (const [id, score] of scores) scores.set(id, score / max);
  }
  return scores;
}

export function rankChunks(query: string, queryVector: number[], chunks: RankInput[], zoneId: string | null, k = 3): Ranked[] {
  const keywords = keywordScores(
    query,
    chunks.map((chunk) => ({ id: chunk.id, text: `${chunk.title}\n${chunk.body}` })),
  );
  const ranked: Ranked[] = chunks.map((chunk) => {
    const raw = cosine(queryVector, chunk.embedding);
    const keyword = keywords.get(chunk.id) ?? 0;
    const coverage = queryCoverage(query, `${chunk.title}\n${chunk.body}`);
    const hybrid = raw * 0.62 + keyword * 0.18 + coverage * 0.2;
    const score = hybrid + (zoneId && chunk.zoneId === zoneId ? ZONE_BOOST : 0);
    return { ...chunk, raw, keyword, score };
  });
  const inZone = zoneId ? ranked.filter((item) => item.zoneId === zoneId) : [];
  const bestZone = Math.max(0, ...inZone.map((item) => item.raw));
  const bestAny = Math.max(0, ...ranked.map((item) => item.raw));
  const preferZone = Boolean(zoneId) && bestZone >= THRESHOLD && bestZone + 0.02 >= bestAny;
  const pool = preferZone ? inZone : ranked;
  return pool
    .map((item) => ({ ...item, keyword: queryCoverage(query, `${item.title}\n${item.body}`) }))
    .filter((item) => item.raw >= THRESHOLD && item.keyword >= COVERAGE_FLOOR)
    .sort((a, b) => b.score - a.score || b.raw - a.raw)
    .slice(0, k);
}

export { THRESHOLD as RETRIEVAL_THRESHOLD };
