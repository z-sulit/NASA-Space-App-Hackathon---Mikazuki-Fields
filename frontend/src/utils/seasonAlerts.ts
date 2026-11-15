import type { SeasonResult } from "../types";

export interface SeasonAlert {
  netLoss: boolean;
  wiltRisk: boolean;
  unmetGapMm: number;
  severe: boolean;
}

/** Classifies net financial loss and drought-driven crop wilt risk for a simulated season. */
export function seasonAlerts(s: Pick<SeasonResult, "profit" | "gapMm" | "pumpedMm" | "waterLoss">): SeasonAlert {
  const netLoss = s.profit < 0;
  const unmetGapMm = Math.max(0, s.gapMm - s.pumpedMm);
  const wiltRisk = s.waterLoss >= 0.35 || unmetGapMm >= 120;
  return { netLoss, wiltRisk, unmetGapMm, severe: netLoss || wiltRisk };
}
