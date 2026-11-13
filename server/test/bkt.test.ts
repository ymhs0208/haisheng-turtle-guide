import assert from "node:assert/strict";
import test from "node:test";
import { timingNote, updateBkt } from "../src/bkt.js";

test("答對會升、答錯會降，而且不會貼邊", () => {
  const correct = updateBkt(0.3, true, 20_000, 20_000);
  const wrong = updateBkt(0.3, false, 20_000, 20_000);
  assert.ok(correct.pNext > 0.3);
  assert.ok(wrong.pNext < 0.3);
  let p = 0.3;
  for (let i = 0; i < 30; i++) {
    p = updateBkt(p, i % 2 === 0, 1000 + i * 700, 20_000).pNext;
    assert.ok(p >= 0.01 && p <= 0.99);
  }
});

test("又快又正確的熟練度高於慢速答對；快錯低於慢錯", () => {
  const fastCorrect = updateBkt(0.3, true, 2_000, 20_000);
  const slowCorrect = updateBkt(0.3, true, 50_000, 20_000);
  assert.ok(fastCorrect.pNext > slowCorrect.pNext);
  const fastWrong = updateBkt(0.3, false, 2_000, 20_000);
  const slowWrong = updateBkt(0.3, false, 50_000, 20_000);
  assert.ok(fastWrong.pNext < slowWrong.pNext);
  assert.match(timingNote(false, fastWrong.ratio), /手滑/);
});

test("連續答對會把熟練度推高", () => {
  let p = 0.3;
  for (let i = 0; i < 8; i++) p = updateBkt(p, true, 12_000, 20_000).pNext;
  assert.ok(p > 0.8);
});
