import assert from "node:assert/strict";
import test from "node:test";
import { jaccard, mergeIntoQueue, normalizeQuestion, type QueueItem } from "../src/dedupe.js";

test("同區近義問題會合併，不同區或不同題不會", () => {
  const queue: QueueItem[] = [];
  const first = mergeIntoQueue(queue, { text: "海龜吃什麼", zoneId: "turtle", sessionId: "a" });
  const second = mergeIntoQueue(queue, { text: "海龜 吃什麼呢", zoneId: "turtle", sessionId: "b" });
  assert.equal(normalizeQuestion("海龜 吃什麼呢"), "海龜吃什麼呢");
  assert.ok(jaccard(normalizeQuestion("海龜吃什麼"), normalizeQuestion("海龜吃什麼呢")) >= 0.72);
  assert.equal(second.merged, true);
  assert.equal(second.item.votes, 2);
  assert.equal(first.item.sessionIds.length, 2);
  const other = mergeIntoQueue(queue, { text: "珊瑚為什麼會白化", zoneId: "turtle", sessionId: "c" });
  assert.equal(other.merged, false);
  const otherZone = mergeIntoQueue(queue, { text: "海龜吃什麼", zoneId: "coral", sessionId: "d" });
  assert.equal(otherZone.merged, false);
  assert.equal(queue.length, 3);
});
