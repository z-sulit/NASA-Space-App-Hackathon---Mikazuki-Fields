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

/**
 * Season climate for a scenario. El Niño replays the farm's real 2015–16 months when we
 * have them (preset.elnino, from NASA POWER); otherwise a flat shock (−25% rain, +1.5 °C).
 */
export function climate(preset: Preset, kind: SeasonKind, scenario: Scenario): SeasonClimate {
  const c = preset.seasons[kind];
  if (scenario === "normal") return c;
  if (preset.elnino) return preset.elnino[kind];
  const t2m = c.t2m_c + 1.5;
  const et0Scale = (t2m + 17.8) / (c.t2m_c + 17.8);
  return {
    ...c,
    rain_mm: c.rain_mm * 0.75,
    monthly_rain_mm: c.monthly_rain_mm.map((m) => m * 0.75),
    t2m_c: t2m,
    tmax_c: c.tmax_c + 1.5,
    gwetroot: c.gwetroot * 0.85,
    et0_mm_day: 0.0135 * (t2m + 17.8) * 0.408 * c.allsky_mj,
    monthly_tmax_c: c.monthly_tmax_c?.map((t) => t + 1.5),
    monthly_et0_mm_day: c.monthly_et0_mm_day?.map((e) => e * et0Scale),
  };
}

const RAIN_EFFECTIVE = 0.8; // share of rain that reaches the roots
const BARE_EVAP = 0.3; // soil evaporation (share of ET0) while the field is bare
const PADDY_EXTRA = 200; // puddling + percolation for paddy rice

export interface SeasonWater {
  demand: number;
  supply: number;
  gap: number;
  endStore: number;
  cropTmax: number;
  months: NonNullable<SeasonResult["months"]>;
}

/**
 * Water for one crop in one season; mirrors season_water() in backend/app/simulator.py.
 * With monthly series it runs a soil bucket month by month while the crop is in the ground
 * (a crop of D days occupies D/30 months), so a dry spell inside the season counts even
 * when the 6-month total is plentiful. Otherwise it uses season totals.
 */
/** Per-crop monthly numbers for one season climate, computed once and reused (WeakMap on the climate). */
interface Prep {
  need: number[];
  bare: number[];
  demand: number;
  supplyRain: number;
  cropTmax: number;
  planted: boolean[];
}
const prepCache = new WeakMap<SeasonClimate, Map<string, Prep>>();
function prep(crop: Crop, clim: SeasonClimate): Prep {
  let byCrop = prepCache.get(clim);
  if (!byCrop) prepCache.set(clim, (byCrop = new Map()));
  const hit = byCrop.get(crop.id);
  if (hit) return hit;
  const r = clim.monthly_rain_mm;
  const e = clim.monthly_et0_mm_day!;
  const t = clim.monthly_tmax_c!;
  const extra = crop.id === "paddy_rice" ? PADDY_EXTRA : 0;
  const frac = [0, 1, 2, 3, 4, 5].map((k) => Math.min(1, Math.max(0, crop.days / 30 - k)));
  const cropMonths = frac.reduce((a, b) => a + b, 0);
  const need = frac.map((f, k) => crop.kc * e[k] * 30 * f + (extra * f) / cropMonths);
  const out: Prep = {
    need,
    bare: frac.map((f, k) => BARE_EVAP * e[k] * 30 * (1 - f)),
    demand: need.reduce((a, b) => a + b, 0),
    supplyRain: frac.reduce((a, f, k) => a + (f > 0 ? RAIN_EFFECTIVE * r[k] : 0), 0),
    cropTmax: frac.reduce((a, f, k) => a + f * t[k], 0) / cropMonths,
    planted: frac.map((f) => f > 0),
  };
  byCrop.set(crop.id, out);
  return out;
}

/**
 * Water for one crop in one season; mirrors season_water() in backend/app/simulator.py.
 * With monthly series it runs a soil bucket month by month while the crop is in the ground
 * (a crop of D days occupies D/30 months), so a dry spell inside the season counts even
 * when the 6-month total is plentiful. Otherwise it uses season totals.
 */
export function seasonWater(crop: Crop, store: number, clim: SeasonClimate, whc: number, kind: SeasonKind, detail = false): SeasonWater {
  const r = clim.monthly_rain_mm;
  if (!(r?.length === 6 && clim.monthly_et0_mm_day?.length === 6 && clim.monthly_tmax_c?.length === 6)) {
    const demand = crop.kc * clim.et0_mm_day * crop.days + (crop.id === "paddy_rice" ? PADDY_EXTRA : 0);
    const supply = RAIN_EFFECTIVE * clim.rain_mm + store;
    return { demand, supply, gap: Math.max(0, demand - supply), endStore: Math.max(0, supply - demand), cropTmax: clim.tmax_c, months: [] };
  }
  // Hot path for the optimizer (1.5 million calls): cached per-crop numbers, no allocations unless `detail`.
  const p = prep(crop, clim);
  let bucket = store;
  let gap = 0;
  const months: SeasonWater["months"] = [];
  for (let k = 0; k < 6; k++) {
    const need = p.need[k];
    const avail = RAIN_EFFECTIVE * r[k] + bucket;
    const short = need > avail ? need - avail : 0;
    gap += short;
    if (detail && p.planted[k]) months.push({ month: SEASON_MONTHS[kind][k], rain: r[k], need, inSoil: bucket, short });
    const next = avail - need - p.bare[k];
    bucket = next < 0 ? 0 : next > whc ? whc : next;
  }
  return { demand: p.demand, supply: p.supplyRain + store, gap, endStore: bucket, cropTmax: p.cropTmax, months };
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

    // 1. Water balance (monthly when the climate has monthly series)
    const w = seasonWater(crop, store, clim, whc, kind, record !== undefined);
    const { demand, supply, gap } = w;
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
    store = 0.5 * Math.min(whc, w.endStore) + 0.5 * (env.climates[t + 1].gwetroot * whc);

    // 2. Heat: mean afternoon heat over the months the crop is in the ground
    const heatLoss = Math.min(0.7, 0.1 * Math.max(0, w.cropTmax - crop.heat_limit_c));

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
        months: w.months,
        cropTmax: w.cropTmax,
      });
    }
    prevFamily = crop.family;
  }

  return { feasible, waterMm: water, nFinal: n, avgErosion: erosionSum / 6, avgPest: pestSum / 6, total, worst };
}
