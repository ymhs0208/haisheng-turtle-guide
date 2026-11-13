/** 64 維字元 n-gram 雜湊向量。離線可重現，也對得上 pgvector 的示範欄位。 */

export const EMBED_DIM = 64;

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function localEmbed(text: string): number[] {
  const vec = new Array<number>(EMBED_DIM).fill(0);
  const s = text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  for (let i = 0; i < s.length; i++) {
    const grams = [s[i]];
    if (i + 1 < s.length) grams.push(s.slice(i, i + 2));
    for (const g of grams) {
      const h = hash(g!);
      const idx = h % EMBED_DIM;
      const sign = (h & 1) === 0 ? 1 : -1;
      vec[idx] = (vec[idx] ?? 0) + sign * (g!.length === 2 ? 1.4 : 1);
    }
  }
  let norm = 0;
  for (const value of vec) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  return vec.map((value) => value / norm);
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

export function chunkDocument(title: string, body: string, tags: string[]): string {
  return `${title}\n${body}\n${tags.join(" ")}`;
}
