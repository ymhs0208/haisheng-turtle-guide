import assert from "node:assert/strict";
import test from "node:test";
import { chooseStrategy, expectedGain } from "../src/strategy.js";

const base = {
  pKnow: 0.3,
  remainingSec: 600,
  latencyMs: 20_000,
  expectedMs: 20_000,
  remediationCount: 0,
  lastStrategy: null,
};

test("固定順序照動畫、提示、比喻輪流", () => {
  assert.equal(chooseStrategy("fixed", { ...base, remediationCount: 0 }).strategy, "animation");
  assert.equal(chooseStrategy("fixed", { ...base, remediationCount: 1 }).strategy, "hint");
  assert.equal(chooseStrategy("fixed", { ...base, remediationCount: 2 }).strategy, "analogy");
  assert.equal(chooseStrategy("fixed", { ...base, remediationCount: 3 }).strategy, "animation");
  assert.match(chooseStrategy("fixed", base).reason, /固定順序/);
});

test("規則式先看時間、再看答得太快、最後才看熟練度", () => {
  assert.equal(chooseStrategy("rule", { ...base, pKnow: 0.2, remainingSec: 20 }).strategy, "analogy");
  assert.equal(
    chooseStrategy("rule", { ...base, pKnow: 0.2, remainingSec: 600, latencyMs: 2_000 }).strategy,
    "analogy",
  );
  assert.equal(
    chooseStrategy("rule", { ...base, pKnow: 0.2, remainingSec: 600, latencyMs: 40_000 }).strategy,
    "animation",
  );
  assert.equal(
    chooseStrategy("rule", { ...base, pKnow: 0.8, remainingSec: 600, latencyMs: 40_000 }).strategy,
    "hint",
  );
});

test("適性學習在時間充裕時重講弱概念、在中間熟練度用提示、時間不夠就用短比喻", () => {
  assert.equal(chooseStrategy("adaptive", { ...base, pKnow: 0.25, remainingSec: 600 }).strategy, "animation");
  assert.equal(chooseStrategy("adaptive", { ...base, pKnow: 0.55, remainingSec: 600 }).strategy, "hint");
  assert.equal(chooseStrategy("adaptive", { ...base, pKnow: 0.25, remainingSec: 50 }).strategy, "analogy");
  assert.equal(chooseStrategy("adaptive", { ...base, pKnow: 0.25, remainingSec: 30 }).strategy, "analogy");
  assert.ok(expectedGain("animation", 0.25, true) < expectedGain("animation", 0.25, false));
});
