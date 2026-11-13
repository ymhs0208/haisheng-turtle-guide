/**
 * 三種可切換的補救策略。
 * 固定順序與規則式是對照；適性學習用「預期學習收益／時間」並看剩餘參觀時間。
 * 時間充裕（≥ 180 秒）時比的是學習收益本身；時間緊時才改比每一秒的收益，
 * 並且放不進剩餘時間的做法會被排除。收益公式是示範先驗，不是擬合結果。
 * 作答時間已進 BKT，這裡的適性政策不再直接看秒數，避免同一訊號被算兩次。
 */

import type { ExperimentGroup, StrategyId, TurtleAnim } from "./types.js";

export interface StrategyContext {
  pKnow: number;
  remainingSec: number;
  latencyMs: number;
  expectedMs: number;
  remediationCount: number;
  lastStrategy: StrategyId | null;
}

export interface StrategyChoice {
  strategy: StrategyId;
  label: string;
  reason: string;
  timeSec: number;
  anim: TurtleAnim;
  emphasis: "replay" | "none";
  scores: Record<StrategyId, number> | null;
}

export const STRATEGY_ORDER: StrategyId[] = ["animation", "hint", "analogy"];

export const STRATEGY_META: Record<
  StrategyId,
  { label: string; timeSec: number; anim: TurtleAnim; emphasis: "replay" | "none" }
> = {
  animation: { label: "3D 動畫重講", timeSec: 70, anim: "talk", emphasis: "replay" },
  hint: { label: "提示加引導提問", timeSec: 40, anim: "point", emphasis: "none" },
  analogy: { label: "換比喻／例子", timeSec: 28, anim: "talk", emphasis: "none" },
};

export const POLICY_META: Record<ExperimentGroup, { label: string; blurb: string }> = {
  fixed: {
    label: "固定順序",
    blurb: "答錯時依「動畫 → 提示 → 比喻」輪流，當作對照組。",
  },
  rule: {
    label: "規則式",
    blurb: "先看剩餘時間，再看作答是不是快得可疑，最後才看熟練度。",
  },
  adaptive: {
    label: "適性學習",
    blurb: "估計每種補救的學習收益與耗時，挑目前最划算、而且趕得上的一種。",
  },
};

const PLENTIFUL_SEC = 180;

export function expectedGain(strategy: StrategyId, pKnow: number, repeated: boolean): number {
  const gap = Math.min(1, Math.max(0, 1 - pKnow));
  let gain: number;
  if (strategy === "animation") {
    gain = 0.28 * gap * gap;
  } else if (strategy === "hint") {
    const nearMid = 1 - Math.min(1, Math.abs(pKnow - 0.55) / 0.55);
    gain = 0.18 * Math.max(0.2, nearMid) * gap;
  } else {
    gain = 0.09 * (0.5 + 0.5 * gap);
  }
  if (repeated) gain *= 0.75;
  return gain;
}

function finish(strategy: StrategyId, reason: string, scores: Record<StrategyId, number> | null): StrategyChoice {
  const meta = STRATEGY_META[strategy];
  return {
    strategy,
    label: meta.label,
    reason,
    timeSec: meta.timeSec,
    anim: meta.anim,
    emphasis: meta.emphasis,
    scores,
  };
}

function chooseFixed(ctx: StrategyContext): StrategyChoice {
  const strategy = STRATEGY_ORDER[ctx.remediationCount % STRATEGY_ORDER.length] ?? "animation";
  return finish(strategy, `你的導覽使用固定順序，這一輪是${STRATEGY_META[strategy].label}。`, null);
}

function chooseRule(ctx: StrategyContext): StrategyChoice {
  const ratio = ctx.expectedMs > 0 ? ctx.latencyMs / ctx.expectedMs : 1;
  if (ctx.remainingSec < 35) {
    return finish("analogy", "剩下的參觀時間不多，先用較短的比喻。", null);
  }
  if (ratio < 0.55) {
    return finish("analogy", "這題答得很快，可能是某個想法卡住了，換個比喻看看。", null);
  }
  if (ctx.pKnow < 0.45) {
    return finish("animation", "這個概念還不熟，用 3D 動畫把過程再走一遍。", null);
  }
  return finish("hint", "依規則，這次用提示帶你一步步想。", null);
}

function chooseAdaptive(ctx: StrategyContext): StrategyChoice {
  const plentiful = ctx.remainingSec >= PLENTIFUL_SEC;
  const scores = {} as Record<StrategyId, number>;
  let best: StrategyId = "analogy";
  let bestScore = -Infinity;
  let anyFeasible = false;
  for (const id of STRATEGY_ORDER) {
    const time = STRATEGY_META[id].timeSec;
    const gain = expectedGain(id, ctx.pKnow, ctx.lastStrategy === id);
    const feasible = time <= ctx.remainingSec;
    const score = feasible ? (plentiful ? gain : gain / time) : -1;
    scores[id] = score;
    if (feasible) anyFeasible = true;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  if (!anyFeasible) {
    return finish("analogy", "參觀時間所剩無幾，先用最短的比喻收尾。", scores);
  }
  if (!plentiful) {
    return finish(best, "剩下的時間不多，這個方式在短期內的學習收益相對較好。", scores);
  }
  return finish(best, "以目前的熟練度來看，這個方式預期帶來的學習最多。", scores);
}

export function chooseStrategy(policy: ExperimentGroup, ctx: StrategyContext): StrategyChoice {
  if (policy === "fixed") return chooseFixed(ctx);
  if (policy === "rule") return chooseRule(ctx);
  return chooseAdaptive(ctx);
}
