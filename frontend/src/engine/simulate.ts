/**
 * Demo season-step simulator: a TypeScript port of section 2 of
 * docs/agronomic_model_vectorized_optimizer_spec.md. It only exists so the UI
 * draft has realistic numbers before the FastAPI backend is up; the backend is
 * the source of truth.
 */
import type {
  Crop,
  CropId,
  Overrides,
  Preset,
  Scenario,
  SeasonClimate,
  SeasonKind,
  SeasonResult,
  Soil,
  Irrigation,
} from "../types";
import { CROP } from "../data/crops";

export const WHC: Record<Soil, number> = { sandy: 60, loam: 120, clay: 150 };
const K_SOIL: Record<Soil, number> = { sandy: 0.6, loam: 1.0, clay: 0.8 };
const N0 = { untested: 65, low: 35, medium: 65, high: 85 } as const;
export const SEASON_MONTHS: Record<SeasonKind, string[]> = {
  wet: ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"],
  dry: ["Dec", "Jan", "Feb", "Mar", "Apr", "May"],
};

export const seasonKind = (i: number): SeasonKind => (i % 2 === 0 ? "wet" : "dry");

/** Season climate, with the El Niño / Dry Spell shock applied (-25% rain, +1.5 °C). */
export function climate(preset: Preset, kind: SeasonKind, scenario: Scenario): SeasonClimate {
  const c = preset.seasons[kind];
  if (scenario === "normal") return c;
  const t2m = c.t2m_c + 1.5;
  return {
    ...c,
    rain_mm: c.rain_mm * 0.75,
    monthly_rain_mm: c.monthly_rain_mm.map((m) => m * 0.75),
    t2m_c: t2m,
    tmax_c: c.tmax_c + 1.5,
    gwetroot: c.gwetroot * 0.85,
    et0_mm_day: 0.0135 * (t2m + 17.8) * 0.408 * c.allsky_mj,
  };
}

export interface Env {
  climates: SeasonClimate[]; // index 0..6 (6 = the season after the plan, for carry-over)
  soil: Soil;
  irrigation: Irrigation;
  slopePct: number;
  overrides: Overrides;
  baselineFamily: Crop["family"];
  relaxFlood: boolean;
}

export function makeEnv(
  preset: Preset,
  soil: Soil,
  irrigation: Irrigation,
  scenario: Scenario,
  overrides: Overrides,
  baselineCrop: CropId,
  relaxFlood = false,
): Env {
  return {
    climates: Array.from({ length: 7 }, (_, i) => climate(preset, seasonKind(i), scenario)),
    soil,
    irrigation,
    slopePct: preset.slope_pct,
    overrides,
    baselineFamily: CROP[baselineCrop].family,
    relaxFlood,
  };
}

export interface Summary {
  feasible: boolean;
  waterMm: number;
  nFinal: number;
  avgErosion: number;
  avgPest: number;
  total: number;
  worst: number;
}

/** Runs 6 seasons. Pass `record` to collect per-season detail (slower); omit it in the optimizer loop. */
export function run(seq: Crop[], env: Env, record?: SeasonResult[]): Summary {
  const whc = WHC[env.soil];
  const kSoil = K_SOIL[env.soil];
  let n: number = N0[env.overrides.soilTestN];
  let store = env.climates[0].gwetroot * whc;
  let pest = env.overrides.pestLastSeason ? 0.45 : 0.15;
  let prevFamily = env.baselineFamily;
  let feasible = true;
  let water = 0;
  let erosionSum = 0;
  let pestSum = 0;
  let total = 0;
  let worst = Infinity;

  for (let t = 0; t < 6; t++) {
    const crop = seq[t];
    const clim = env.climates[t];
    const kind = seasonKind(t);
    const isPaddy = crop.id === "paddy_rice";

    // 1. Water balance
    const demand = crop.kc * clim.et0_mm_day * crop.days + (isPaddy ? 200 : 0);
    const supply = 0.8 * clim.rain_mm + store;
    const gap = Math.max(0, demand - supply);
    let pumped = 0;
    let pumpCost = 0;
    let waterLoss = 0;
    if (env.irrigation === "irrigated") {
      pumped = gap;
      pumpCost = pumped * 35;
    } else {
      waterLoss = Math.min(0.85, (crop.ky * gap) / demand);
      if (isPaddy && supply < 0.8 * demand) feasible = false;
    }
    if (isPaddy && env.slopePct > 8) feasible = false;
    if (!env.relaxFlood && env.overrides.floods === kind && !crop.flood_tolerant) feasible = false;
    const leftover = Math.max(0, supply - demand);
    store = 0.5 * Math.min(whc, leftover) + 0.5 * (env.climates[t + 1].gwetroot * whc);

    // 2. Heat
    const heatLoss = Math.min(0.7, 0.1 * Math.max(0, clim.tmax_c - crop.heat_limit_c));

    // 3. Nitrogen and urea top-up
    const sameFamily = crop.family === prevFamily;
    let dN = crop.soil_n_delta - (env.soil === "sandy" && kind === "wet" ? 3 : 0) - (sameFamily ? 3 : 0);
    if (env.overrides.soilPh !== null && env.overrides.soilPh < 5.5 && crop.family === "Fabaceae") dN *= 0.5;
    let ureaCost = 0;
    let nFactor = 1;
    if (crop.family !== "Fabaceae" && n < 60) {
      ureaCost = (60 - n) * 180;
      nFactor = Math.min(1, 0.7 + 0.3 * (n / 60));
    }
    const nStart = n;
    n = Math.min(100, Math.max(10, n + dN));

    // 4. Pests
    pest = sameFamily ? Math.min(1, pest + 0.25) : pest * 0.3;
    const pestLoss = 0.15 * pest;

    // 5. Erosion over a 180-day season
    const covered = crop.days / 180;
    const cEff = covered * crop.cover_c + (1 - covered);
    const erosion = Math.min(100, Math.max(0, (clim.rain_mm / 1200) * kSoil * (1 + env.slopePct / 10) * cEff * 50));

    // 6. Profit
    const yieldT = crop.base_yield_t_ha * (1 - waterLoss) * (1 - heatLoss) * (1 - pestLoss) * nFactor;
    const profit = yieldT * crop.price_php_per_t - crop.base_cost_php - ureaCost - pumpCost;

    water += gap;
    erosionSum += erosion;
    pestSum += pest;
    total += profit;
    if (profit < worst) worst = profit;

    if (record) {
      const coveredMonths = Math.min(6, Math.round(crop.days / 30));
      const months = SEASON_MONTHS[kind];
      const bareMonths = months.filter((_, m) => m >= coveredMonths && clim.monthly_rain_mm[m] > 200);
      record.push({
        index: t,
        kind,
        label: clim.label,
        crop: crop.id,
        nStart,
        nEnd: n,
        demandMm: demand,
        gapMm: gap,
        pumpedMm: pumped,
        waterLoss,
        heatLoss,
        pest,
        pestBroken: t >= 1 && !sameFamily,
        erosion,
        bareMonths,
        coveredMonths,
        yieldT,
        ureaCost,
        pumpCost,
        profit,
      });
    }
    prevFamily = crop.family;
  }

  return { feasible, waterMm: water, nFinal: n, avgErosion: erosionSum / 6, avgPest: pestSum / 6, total, worst };
}
