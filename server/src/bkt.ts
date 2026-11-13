/**
 * 貝氏知識追蹤（BKT），加上作答時間對猜測／失誤參數的溫和調整。
 * 參數是博物館短訪可用的示範先驗，還沒有用真實遊客資料校正。
 * 作答時間不另建模型，只稍微改變這一題的 P(G)、P(S)。
 */

export interface BktParams {
  pL0: number;
  pT: number;
  pG: number;
  pS: number;
}

export const DEFAULT_BKT: BktParams = {
  pL0: 0.3,
  pT: 0.12,
  pG: 0.25,
  pS: 0.1,
};

export interface BktUpdate {
  pNext: number;
  pG: number;
  pS: number;
  posterior: number;
  ratio: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function updateBkt(
  pKnow: number,
  correct: boolean,
  latencyMs: number,
  expectedMs: number,
  params: BktParams = DEFAULT_BKT,
): BktUpdate {
  const ratio = expectedMs > 0 ? latencyMs / expectedMs : 1;
  let pG = params.pG;
  let pS = params.pS;
  if (correct) {
    if (ratio < 0.6) {
      pS *= 0.55;
      pG *= 0.75;
    } else if (ratio > 1.8) {
      pG = Math.min(0.5, pG * 1.45);
    }
  } else if (ratio < 0.45) {
    pS *= 0.35;
  } else if (ratio > 1.8) {
    pS = Math.min(0.45, pS * 2);
  }

  const know = clamp(pKnow, 0.01, 0.99);
  const pObs = correct
    ? know * (1 - pS) + (1 - know) * pG
    : know * pS + (1 - know) * (1 - pG);
  const denom = Math.max(pObs, 1e-6);
  const posterior = correct ? (know * (1 - pS)) / denom : (know * pS) / denom;
  const pNext = clamp(posterior + (1 - posterior) * params.pT, 0.01, 0.99);
  return { pNext, pG, pS, posterior, ratio };
}

export function timingNote(correct: boolean, ratio: number): string {
  if (correct && ratio < 0.6) return "答得又快又正確，這次把熟練度拉高比較多。";
  if (correct && ratio > 1.8) return "有答對，但花的時間比較長，上升幅度保守一些。";
  if (!correct && ratio < 0.45) return "答錯得很快，比較不像單純手滑，熟練度調降多一點。";
  if (!correct && ratio > 1.8) return "想了比較久仍答錯，可能有一部分是一時混淆。";
  return "已依這次作答更新熟練度。";
}
