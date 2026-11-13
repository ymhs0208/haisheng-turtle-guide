import type { AgeGroup } from "./types.js";
import { POLICY_META, STRATEGY_META, STRATEGY_ORDER } from "./strategy.js";

export const AGE_META: Record<AgeGroup, { label: string; blurb: string }> = {
  child: { label: "兒童", blurb: "用比較短的句子" },
  teen: { label: "青少年", blurb: "一般導覽用詞" },
  adult: { label: "成人", blurb: "一般導覽用詞" },
};

export function metaPayload(extra: { llm: string; llmReady: boolean; store: string; vector: string }) {
  return {
    sample: true,
    ageGroups: (Object.keys(AGE_META) as AgeGroup[]).map((id) => ({ id, ...AGE_META[id] })),
    policies: (Object.keys(POLICY_META) as (keyof typeof POLICY_META)[]).map((id) => ({
      id,
      ...POLICY_META[id],
    })),
    strategies: STRATEGY_ORDER.map((id) => ({ id, label: STRATEGY_META[id].label, timeSec: STRATEGY_META[id].timeSec })),
    ...extra,
  };
}
