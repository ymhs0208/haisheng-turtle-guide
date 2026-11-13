import { randomUUID } from "node:crypto";

export interface QueueItem {
  id: string;
  text: string;
  zoneId: string;
  votes: number;
  sessionIds: string[];
  createdAt: number;
  answered: boolean;
}

export function normalizeQuestion(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[？?！!。．，,、．~～]/g, "");
}

export function jaccard(a: string, b: string): number {
  const grams = (value: string) => {
    const set = new Set<string>();
    if (value.length < 2) {
      if (value) set.add(value);
      return set;
    }
    for (let i = 0; i < value.length - 1; i++) set.add(value.slice(i, i + 2));
    return set;
  };
  const left = grams(a);
  const right = grams(b);
  if (left.size === 0 && right.size === 0) return 1;
  let inter = 0;
  for (const token of left) if (right.has(token)) inter += 1;
  const union = left.size + right.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function mergeIntoQueue(
  queue: QueueItem[],
  incoming: { text: string; zoneId: string; sessionId: string },
  threshold = 0.72,
): { merged: boolean; item: QueueItem } {
  const normalized = normalizeQuestion(incoming.text);
  for (const item of queue) {
    if (item.zoneId !== incoming.zoneId) continue;
    if (jaccard(normalizeQuestion(item.text), normalized) >= threshold) {
      item.votes += 1;
      if (!item.sessionIds.includes(incoming.sessionId)) item.sessionIds.push(incoming.sessionId);
      return { merged: true, item };
    }
  }
  const item: QueueItem = {
    id: randomUUID(),
    text: incoming.text.trim(),
    zoneId: incoming.zoneId,
    votes: 1,
    sessionIds: [incoming.sessionId],
    createdAt: Date.now(),
    answered: false,
  };
  queue.push(item);
  return { merged: false, item };
}
