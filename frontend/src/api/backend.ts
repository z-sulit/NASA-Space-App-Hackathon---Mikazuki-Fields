/**
 * Adapter for the Mikazuki Fields FastAPI backend (backend/app/schemas.py on main).
 *
 * The UI keeps its own camelCase shapes (src/types.ts); this file is the only place
 * that knows the backend's JSON. Endpoints used:
 *   GET  /api/farm?preset_id=… | ?lat=…&lon=…   FarmContext (live NASA POWER for pins)
 *   POST /api/plans                             PlanResponse (Plans A/B/C, normal + El Niño)
 *
 * API_BASE is empty by default, so calls go to the same origin: Vite proxies /api to
 * :8000 in dev, and on Vercel /api/* is rewritten to api/index.py. Set VITE_API_BASE
 * (for example https://mikazuki-fields-api.onrender.com) when the API lives elsewhere.
 */
import type { CropId, PlanId, PlanKpis, PlanRequest, PlanResult, PlansResponse, Preset, SeasonClimate, SeasonKind, SeasonResult } from "../types";

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";

// ---------- Backend JSON (subset of backend/app/schemas.py) ----------

interface BSeasonClimate {
  rain_mm: number;
  t2m_c: number;
  tmax_c: number;
  gwetroot: number;
  allsky_mj: number;
  et0_mm_day: number;
  heavy_rain_months: number[];
}
export interface BFarmContext {
  location: { preset_id: string | null; name: string; lat: number; lon: number; is_custom_pin: boolean };
  terrain: { elevation_m: number; slope_pct: number; erosion_risk_label: string };
  ndvi_profile: { mean_ndvi: number; historical_bare_months: number[]; el_nino_ndvi_drop_pct: number };
  climate: Record<"normal" | "elnino", Record<SeasonKind, BSeasonClimate>>;
}
interface BSeasonStep {
  season_index: number;
  season_type: SeasonKind;
  crop_id: string;
  demand_mm: number;
  water_gap_mm: number;
  pumped_mm: number;
  water_yield_loss: number;
  heat_loss: number;
  pest_level: number;
  pest_broken_badge: boolean;
  soil_n: number;
  urea_cost_php: number;
  pump_cost_php: number;
  erosion_index: number;
  bare_soil_erosion_months: number[];
  effective_yield_t_ha: number;
  profit_php: number;
}
interface BPlanCard {
  id: "plan_a" | "plan_b" | "plan_c";
  title: string;
  subtitle: string;
  kpis: {
    total_profit_php: number;
    worst_season_profit_php: number;
    total_water_gap_mm: number;
    total_pumped_mm: number;
    final_soil_n: number;
    soil_n_delta: number;
    mean_erosion_index: number;
    bare_month_count: number;
    pest_break_count: number;
  };
  seasons: BSeasonStep[];
  why_bullets: string[];
}
export interface BPlanResponse {
  ground_truth_applied: string[];
  liming_advisory: boolean;
  scenarios: Record<"normal" | "elnino", Record<"plan_a" | "plan_b" | "plan_c", BPlanCard>>;
}

// ---------- Requests ----------

const WET_MONTHS = [6, 7, 8, 9, 10, 11];
const DRY_MONTHS = [12, 1, 2, 3, 4, 5];

export function toBackendRequest(req: PlanRequest, preset: Preset) {
  const pin = preset.id.startsWith("pin-");
  const o = req.overrides;
  return {
    preset_id: pin ? null : preset.id,
    lat: preset.lat,
    lon: preset.lon,
    baseline_crop: req.baselineCrop,
    soil_texture: req.soil,
    irrigation: req.irrigation,
    goal: req.goal,
    sliders: { water: req.weights.water, soil: req.weights.soil, economy: req.weights.econ },
    overrides: {
      soil_n_level: o.soilTestN === "untested" ? null : o.soilTestN,
      soil_ph: o.soilPh,
      last_outcome_pests: o.pestLastSeason,
      flooded_months: o.floods === "wet" ? WET_MONTHS : o.floods === "dry" ? DRY_MONTHS : [],
    },
  };
}

// ---------- Responses ----------

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PLAN_ID: Record<BPlanCard["id"], PlanId> = { plan_a: "A", plan_b: "B", plan_c: "C" };
// Short UI names for the backend's "Plan A: Status Quo" titles.
const PLAN_NAME: Record<PlanId, string> = { A: "Status Quo", B: "Balanced", C: "Drought-Safe" };

function toPlan(card: BPlanCard, irrigated: boolean): PlanResult {
  const id = PLAN_ID[card.id];
  const k = card.kpis;
  const nStart = k.final_soil_n - k.soil_n_delta;
  const seasons: SeasonResult[] = card.seasons.map((s, i) => {
    const year = Math.floor(s.season_index / 2) + 1;
    return {
      index: s.season_index,
      kind: s.season_type,
      // Built here: the backend's labels carry a mis-encoded en dash.
      label: `Y${year} ${s.season_type === "wet" ? "Wet (Jun–Nov)" : "Dry (Dec–May)"}`,
      crop: s.crop_id as CropId,
      nStart: i === 0 ? nStart : card.seasons[i - 1].soil_n,
      nEnd: s.soil_n,
      demandMm: s.demand_mm,
      gapMm: s.water_gap_mm,
      pumpedMm: s.pumped_mm,
      waterLoss: s.water_yield_loss,
      heatLoss: s.heat_loss,
      pest: s.pest_level,
      pestBroken: s.pest_broken_badge,
      erosion: s.erosion_index,
      bareMonths: s.bare_soil_erosion_months.map((m) => MONTH[m - 1]),
      coveredMonths: 6 - s.bare_soil_erosion_months.length,
      yieldT: s.effective_yield_t_ha,
      ureaCost: s.urea_cost_php,
      pumpCost: s.pump_cost_php,
      profit: s.profit_php,
    };
  });
  const kpis: PlanKpis = {
    totalProfit: k.total_profit_php,
    worstSeasonProfit: k.worst_season_profit_php,
    nStart,
    nFinal: k.final_soil_n,
    waterMm: irrigated ? k.total_pumped_mm : k.total_water_gap_mm,
    avgErosion: k.mean_erosion_index,
    erosionLevel: k.mean_erosion_index < 35 ? "Low" : k.mean_erosion_index < 60 ? "Medium" : "High",
    ureaTotal: seasons.reduce((a, s) => a + s.ureaCost, 0),
    pestBreaks: k.pest_break_count,
    bareMonthCount: k.bare_month_count,
  };
  return {
    id,
    name: PLAN_NAME[id],
    promise: card.subtitle.replace(/\s*\(El Ni[ñn]o\)\s*$/, ""),
    rotation: seasons.map((s) => s.crop),
    seasons,
    kpis,
    why: card.why_bullets,
  };
}

export function fromBackendPlans(res: BPlanResponse, req: PlanRequest, source: PlansResponse["source"]): PlansResponse {
  const irrigated = req.irrigation === "irrigated";
  const order = ["plan_a", "plan_b", "plan_c"] as const;
  const notes = [...res.ground_truth_applied];
  if (res.liming_advisory) notes.push("Your soil is acidic (pH below 5.5): lime before planting legumes.");
  return {
    normal: order.map((p) => toPlan(res.scenarios.normal[p], irrigated)),
    elnino: order.map((p) => toPlan(res.scenarios.elnino[p], irrigated)),
    source,
    notes,
  };
}

/** Backend gives season totals only; spread them over the months, a bit more in its heavy-rain months. */
function monthly(c: BSeasonClimate, months: number[]): number[] {
  const w = months.map((m) => (c.heavy_rain_months.includes(m) ? 1.3 : 1));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => Math.round(((c.rain_mm * x) / sum) * 10) / 10);
}

/**
 * FarmContext -> the UI's Preset. `base` (the bundled preset of the same id, if any)
 * keeps the measured monthly rain and the 2015–16 El Niño figure the backend does not send.
 */
export function farmToPreset(ctx: BFarmContext, base?: Preset): Preset {
  const loc = ctx.location;
  const id = loc.preset_id ?? `pin-${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
  const season = (kind: SeasonKind): SeasonClimate => {
    const c = ctx.climate.normal[kind];
    return {
      label: kind === "wet" ? "Jun–Nov" : "Dec–May",
      rain_mm: c.rain_mm,
      monthly_rain_mm: base?.seasons[kind].monthly_rain_mm ?? monthly(c, kind === "wet" ? WET_MONTHS : DRY_MONTHS),
      t2m_c: c.t2m_c,
      tmax_c: c.tmax_c,
      allsky_mj: c.allsky_mj,
      gwetroot: c.gwetroot,
      et0_mm_day: c.et0_mm_day,
    };
  };
  return {
    id,
    name: loc.is_custom_pin ? `Pinned farm (${loc.lat.toFixed(2)}° N, ${loc.lon.toFixed(2)}° E)` : (base?.name ?? loc.name),
    lat: loc.lat,
    lon: loc.lon,
    seasons: { wet: season("wet"), dry: season("dry") },
    elnino_2016_dry_rain_pct: base?.elnino_2016_dry_rain_pct ?? null,
    slope_pct: ctx.terrain.slope_pct,
    ndvi_dry_min: ctx.ndvi_profile.mean_ndvi,
    // Presets carry measured SRTM slope and MODIS NDVI; a pin borrows the nearest preset's.
    placeholders: loc.is_custom_pin ? ["slope_pct", "ndvi_dry_min"] : [],
    source: "Mikazuki API: NASA POWER 2015–2024, SRTM 30 m, MODIS MOD13Q1",
  };
}

// ---------- Calls ----------

async function getJson<T>(url: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const type = res.headers.get("content-type") ?? "";
    // A static host (GitHub Pages, Vite without a backend) may answer /api/* with HTML.
    if (!type.includes("json")) throw new Error("not JSON");
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export const apiPlans = (body: unknown, timeoutMs?: number) =>
  getJson<BPlanResponse>(`${API_BASE}/api/plans`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, timeoutMs);

export const apiFarm = (q: { presetId: string } | { lat: number; lon: number }, timeoutMs?: number) =>
  getJson<BFarmContext>(
    `${API_BASE}/api/farm?${"presetId" in q ? `preset_id=${encodeURIComponent(q.presetId)}` : `lat=${q.lat.toFixed(4)}&lon=${q.lon.toFixed(4)}`}`,
    undefined,
    timeoutMs,
  );

/** The offline bundle main ships in frontend/public (made by data-prep/export_fallback.py). */
export interface FallbackBundle {
  farms: Record<string, BFarmContext>;
  plans: Record<string, BPlanResponse>;
}
let bundle: Promise<FallbackBundle | null> | null = null;
export function fallbackBundle(): Promise<FallbackBundle | null> {
  bundle ??= getJson<FallbackBundle>(`${import.meta.env.BASE_URL}fallback_plans.json`, undefined, 8000).catch(() => null);
  return bundle;
}
