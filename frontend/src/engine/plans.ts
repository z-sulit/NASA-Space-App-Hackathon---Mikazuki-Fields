/**
 * Demo 3-route planner: a TypeScript port of section 3 of the engine spec
 * (exhaustive search over 8^6 = 262,144 rotations). Stands in for
 * POST /api/plans until the FastAPI backend is up.
 */
import type { Crop, CropId, Irrigation, PlanId, PlanKpis, PlanRequest, PlanResult, PlansResponse, Preset, SeasonResult } from "../types";
import { CROP, CROPS } from "../data/crops";
import { makeEnv, run, type Env } from "./simulate";
import { formatPhpUsd } from "../utils/currency";

const N_CROPS = CROPS.length;
const TOTAL = N_CROPS ** 6;
const FORAGE = new Set<CropId>(["corn", "sorghum", "cowpea"]);

function decode(r: number, out: Crop[]): Crop[] {
  for (let t = 0; t < 6; t++) {
    out[t] = CROPS[r % N_CROPS];
    r = Math.floor(r / N_CROPS);
  }
  return out;
}

interface Arrays {
  ok: Uint8Array;
  guard3: Uint8Array;
  highWater: Uint8Array;
  water: Float64Array;
  soil: Float64Array;
  econ: Float64Array;
  waterE: Float64Array;
  soilE: Float64Array;
  econE: Float64Array;
}

function evaluateAll(req: PlanRequest, envN: Env, envE: Env): Arrays {
  const a: Arrays = {
    ok: new Uint8Array(TOTAL),
    guard3: new Uint8Array(TOTAL),
    highWater: new Uint8Array(TOTAL),
    water: new Float64Array(TOTAL),
    soil: new Float64Array(TOTAL),
    econ: new Float64Array(TOTAL),
    waterE: new Float64Array(TOTAL),
    soilE: new Float64Array(TOTAL),
    econE: new Float64Array(TOTAL),
  };
  const seq: Crop[] = new Array(6);
  for (let r = 0; r < TOTAL; r++) {
    decode(r, seq);
    if (req.goal === "forage") {
      let f = 0;
      for (let t = 0; t < 6; t++) if (FORAGE.has(seq[t].id)) f++;
      if (f < 2) continue;
    }
    const s = run(seq, envN);
    if (!s.feasible) continue;
    const e = run(seq, envE);
    a.ok[r] = 1;
    a.water[r] = s.waterMm;
    a.soil[r] = 0.5 * s.nFinal + 0.3 * (100 - s.avgErosion) + 0.2 * (100 - 100 * s.avgPest);
    a.econ[r] = 0.7 * s.total + 0.3 * s.worst;
    a.waterE[r] = e.waterMm;
    a.soilE[r] = 0.5 * e.nFinal + 0.3 * (100 - e.avgErosion) + 0.2 * (100 - 100 * e.avgPest);
    a.econE[r] = 0.7 * e.total + 0.3 * e.worst;
    for (let t = 0; t < 6; t++) if (seq[t].high_water) a.highWater[r] = 1;
    for (let t = 2; t < 6; t++) {
      if (seq[t].family === seq[t - 1].family && seq[t].family === seq[t - 2].family) a.guard3[r] = 1;
    }
  }
  return a;
}

/** Min-max scaler over feasible rotations; `invert` for "less is better" (water). */
function scaler(values: Float64Array, ok: Uint8Array, invert = false) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let r = 0; r < TOTAL; r++) {
    if (!ok[r]) continue;
    if (values[r] < lo) lo = values[r];
    if (values[r] > hi) hi = values[r];
  }
  const span = hi - lo || 1;
  return (r: number) => {
    const x = (values[r] - lo) / span;
    return 100 * (invert ? 1 - x : x);
  };
}

function hamming(a: number, b: number) {
  let d = 0;
  for (let t = 0; t < 6; t++) {
    if (a % N_CROPS !== b % N_CROPS) d++;
    a = Math.floor(a / N_CROPS);
    b = Math.floor(b / N_CROPS);
  }
  return d;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Deterministic "why this route" bullets formatted as PHP / USD. */
export function summarizePlans(
  normal: PlanResult[],
  elnino: PlanResult[],
  irrigation: Irrigation,
): [string[], string[], string[]] {
  const drop = (i: number) => {
    const n = normal[i].kpis.totalProfit;
    return n > 0 ? Math.round(((n - elnino[i].kpis.totalProfit) / n) * 100) : 0;
  };
  const [A, B, C] = normal;
  const waterWord = irrigation === "irrigated" ? "pumped" : "water shortfall";
  const whyA = [
    A.kpis.nFinal < A.kpis.nStart
      ? `Same crop 6 times: soil nitrogen falls from ${A.kpis.nStart} to ${Math.round(A.kpis.nFinal)}.`
      : `Soil nitrogen ends at ${Math.round(A.kpis.nFinal)}.`,
    A.kpis.pestBreaks === 0 ? `Pests build up every season, reaching ${pct(A.seasons[5].pest)} pressure.` : `${A.kpis.pestBreaks} pest-cycle breaks.`,
    A.kpis.ureaTotal > 0 ? `Fertilizer top-ups cost ${formatPhpUsd(A.kpis.ureaTotal)} over 3 years.` : `In El Niño, 3-year profit falls ${drop(0)}%.`,
  ];
  const dB = B.kpis.totalProfit - A.kpis.totalProfit;
  const whyB = [
    `Soil nitrogen ends at ${Math.round(B.kpis.nFinal)}, versus ${Math.round(A.kpis.nFinal)} for Status Quo.`,
    `${B.kpis.pestBreaks} crop-family switches break pest cycles.`,
    `3-year profit ${formatPhpUsd(B.kpis.totalProfit)} (${dB >= 0 ? "+" : "−"}${formatPhpUsd(Math.abs(dB))} vs Status Quo).`,
  ];
  // Only keep bullets that actually tell Plan C apart, so we never print "0 mm versus 0 mm".
  const whyC = [
    A.kpis.waterMm - C.kpis.waterMm > 5 &&
      `Needs less water: ${Math.round(C.kpis.waterMm)} mm ${waterWord}, versus ${Math.round(A.kpis.waterMm)} mm for Status Quo.`,
    drop(0) - drop(2) >= 1 && `In El Niño, profit falls ${drop(2)}%, versus ${drop(0)}% for Status Quo.`,
    `No paddy or upland rice, so a dry year can't leave a thirsty crop in the field.`,
    `${C.kpis.pestBreaks} pest-cycle breaks; soil nitrogen ends at ${Math.round(C.kpis.nFinal)}.`,
  ]
    .filter((x): x is string => Boolean(x))
    .slice(0, 3);
  return [whyA, whyB, whyC];
}

function kpis(seasons: SeasonResult[]): PlanKpis {
  const totalProfit = seasons.reduce((s, x) => s + x.profit, 0);
  const avgErosion = seasons.reduce((s, x) => s + x.erosion, 0) / 6;
  return {
    totalProfit,
    worstSeasonProfit: Math.min(...seasons.map((s) => s.profit)),
    nStart: seasons[0].nStart,
    nFinal: seasons[5].nEnd,
    waterMm: seasons.reduce((s, x) => s + x.gapMm, 0),
    avgErosion,
    erosionLevel: avgErosion < 35 ? "Low" : avgErosion < 60 ? "Medium" : "High",
    ureaTotal: seasons.reduce((s, x) => s + x.ureaCost, 0),
    pestBreaks: seasons.filter((s) => s.pestBroken).length,
    bareMonthCount: seasons.reduce((s, x) => s + x.bareMonths.length, 0),
  };
}

const META: Record<PlanId, { name: string; promise: string }> = {
  A: { name: "Status Quo", promise: "What you plant now, 6 seasons in a row" },
  B: { name: "Balanced", promise: "Best balance for your priorities" },
  C: { name: "Drought-Safe", promise: "Holds up best in a dry year" },
};

export function planRoutes(req: PlanRequest, preset: Preset): PlansResponse {
  const notes: string[] = [];
  let envN = makeEnv(preset, req.soil, req.irrigation, "normal", req.overrides, req.baselineCrop);
  let envE = makeEnv(preset, req.soil, req.irrigation, "elnino", req.overrides, req.baselineCrop);
  let a = evaluateAll(req, envN, envE);
  if (!a.ok.some((x) => x) && req.overrides.floods !== "never") {
    notes.push("No rotation fits a field that floods every " + req.overrides.floods + " season on this slope, so the flood rule was relaxed.");
    envN = makeEnv(preset, req.soil, req.irrigation, "normal", req.overrides, req.baselineCrop, true);
    envE = makeEnv(preset, req.soil, req.irrigation, "elnino", req.overrides, req.baselineCrop, true);
    a = evaluateAll(req, envN, envE);
  }
  if (!a.ok.some((x) => x)) throw new Error("No feasible rotation for these inputs.");

  const W = scaler(a.water, a.ok, true);
  const S = scaler(a.soil, a.ok);
  const E = scaler(a.econ, a.ok);
  const WE = scaler(a.waterE, a.ok, true);
  const SE = scaler(a.soilE, a.ok);
  const EE = scaler(a.econE, a.ok);
  const sum = req.weights.water + req.weights.soil + req.weights.econ || 1;
  const ww = req.weights.water / sum;
  const ws = req.weights.soil / sum;
  const we = req.weights.econ / sum;

  let best = -1;
  let bestScore = -Infinity;
  for (let r = 0; r < TOTAL; r++) {
    if (!a.ok[r] || a.guard3[r]) continue;
    const scNorm = ww * W(r) + ws * S(r) + we * E(r);
    const scEln = ww * WE(r) + ws * SE(r) + we * EE(r);
    const sc = 0.85 * scNorm + 0.15 * scEln;
    if (sc > bestScore) {
      bestScore = sc;
      best = r;
    }
  }
  let safe = -1;
  let safeScore = -Infinity;
  for (let r = 0; r < TOTAL; r++) {
    if (!a.ok[r] || a.highWater[r] || hamming(r, best) < 2) continue;
    const sc = Math.min(0.6 * W(r) + 0.25 * S(r) + 0.15 * E(r), 0.6 * WE(r) + 0.25 * SE(r) + 0.15 * EE(r));
    if (sc > safeScore) {
      safeScore = sc;
      safe = r;
    }
  }

  const seq: Crop[] = new Array(6);
  const rotations: Record<PlanId, CropId[]> = {
    A: Array(6).fill(req.baselineCrop),
    B: decode(best, seq).map((c) => c.id),
    C: decode(safe < 0 ? best : safe, seq).map((c) => c.id),
  };
  const statusQuo = run(rotations.A.map((id) => CROP[id]), envN);
  if (!statusQuo.feasible) notes.push(`Status Quo breaks a hard rule for this farm (for example paddy rice on a slope or in a dry rainfed season); shown for comparison only.`);

  const build = (env: Env) =>
    (["A", "B", "C"] as PlanId[]).map((id) => {
      const seasons: SeasonResult[] = [];
      run(rotations[id].map((c) => CROP[c]), env, seasons);
      return { id, ...META[id], rotation: rotations[id], seasons, kpis: kpis(seasons), why: [] as string[] } satisfies PlanResult;
    });
  const normal = build(envN);
  const elnino = build(envE);

  summarizePlans(normal, elnino, req.irrigation).forEach((w, i) => {
    normal[i].why = w;
    elnino[i].why = w;
  });

  return { normal, elnino, source: "demo", notes };
}

/**
 * A rotation the farmer picked by hand, run through the same simulator as the
 * 3 routes so its numbers are directly comparable.
 */
export function customPlan(req: PlanRequest, preset: Preset, rotation: CropId[]): { normal: PlanResult; elnino: PlanResult } {
  const one = (scenario: "normal" | "elnino") => {
    const env = makeEnv(preset, req.soil, req.irrigation, scenario, req.overrides, req.baselineCrop, true);
    const seasons: SeasonResult[] = [];
    run(rotation.map((c) => CROP[c]), env, seasons);
    const k = kpis(seasons);
    return {
      id: "B" as PlanId,
      custom: true,
      name: "Your rotation",
      promise: "The crops you picked, season by season",
      rotation,
      seasons,
      kpis: k,
      why: [
        `Soil nitrogen goes from ${Math.round(k.nStart)} to ${Math.round(k.nFinal)}.`,
        `${k.pestBreaks} crop-family switches break pest cycles.`,
      ],
    } satisfies PlanResult;
  };
  return { normal: one("normal"), elnino: one("elnino") };
}

function scaleWhyCurrency(text: string, ha: number): string {
  return text.replace(/(₱|PHP\s*)([\d,]+(?:\.\d+)?)/g, (_m, prefix: string, num: string) => {
    const val = Number(num.replace(/,/g, ""));
    if (!Number.isFinite(val)) return `${prefix}${num}`;
    const scaled = Math.round(val * ha).toLocaleString("en-PH");
    return `${prefix}${scaled}`;
  });
}

/** Scale a 1-hectare PlanResult proportionally to `landSizeHa` hectares. */
export function scalePlanResult(plan: PlanResult, landSizeHa: number): PlanResult {
  const ha = Number.isFinite(landSizeHa) && landSizeHa > 0 ? landSizeHa : 1;
  if (ha === 1) return plan;
  return {
    ...plan,
    seasons: plan.seasons.map((s) => ({
      ...s,
      yieldT: s.yieldT * ha,
      ureaCost: s.ureaCost * ha,
      pumpCost: s.pumpCost * ha,
      profit: s.profit * ha,
    })),
    kpis: {
      ...plan.kpis,
      totalProfit: plan.kpis.totalProfit * ha,
      worstSeasonProfit: plan.kpis.worstSeasonProfit * ha,
      ureaTotal: plan.kpis.ureaTotal * ha,
    },
    why: plan.why.map((line) => scaleWhyCurrency(line, ha)),
  };
}

/** Scale all routes in a PlansResponse proportionally to `landSizeHa` hectares. */
export function scalePlansResponse(res: PlansResponse, landSizeHa: number): PlansResponse {
  const ha = Number.isFinite(landSizeHa) && landSizeHa > 0 ? landSizeHa : 1;
  if (ha === 1) return res;
  return {
    ...res,
    normal: res.normal.map((p) => scalePlanResult(p, ha)),
    elnino: res.elnino.map((p) => scalePlanResult(p, ha)),
  };
}
