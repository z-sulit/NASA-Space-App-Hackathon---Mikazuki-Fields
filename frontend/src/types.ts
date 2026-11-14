export type CropId =
  | "corn"
  | "paddy_rice"
  | "upland_rice"
  | "sorghum"
  | "mungbean"
  | "peanut"
  | "cowpea"
  | "sweet_potato";

export type Family = "Poaceae" | "Fabaceae" | "Convolvulaceae";
export type Soil = "clay" | "loam" | "sandy";
export type Irrigation = "rainfed" | "irrigated";
export type Goal = "cash" | "forage";
export type Scenario = "normal" | "elnino";
export type SeasonKind = "wet" | "dry";
export type PlanId = "A" | "B" | "C";

export interface Crop {
  id: CropId;
  name: string;
  short: string;
  family: Family;
  days: number;
  kc: number;
  ky: number;
  heat_limit_c: number;
  soil_n_delta: number;
  cover_c: number;
  fits_goal: Goal[];
  base_yield_t_ha: number;
  price_php_per_t: number;
  base_cost_php: number;
  flood_tolerant: boolean;
  high_water: boolean;
}

export interface SeasonClimate {
  label: string;
  rain_mm: number;
  monthly_rain_mm: number[];
  t2m_c: number;
  tmax_c: number;
  allsky_mj: number;
  gwetroot: number;
  et0_mm_day: number;
}

export interface Preset {
  id: string;
  name: string;
  lat: number;
  lon: number;
  seasons: Record<SeasonKind, SeasonClimate>;
  elnino_2016_dry_rain_pct: number | null;
  slope_pct: number;
  ndvi_dry_min: number;
  placeholders: string[];
  source: string;
}

export interface Overrides {
  soilTestN: "untested" | "low" | "medium" | "high";
  soilPh: number | null;
  pestLastSeason: boolean;
  floods: "never" | SeasonKind;
}

export interface Weights {
  water: number;
  soil: number;
  econ: number;
}

export interface PlanRequest {
  presetId: string;
  baselineCrop: CropId;
  soil: Soil;
  irrigation: Irrigation;
  goal: Goal;
  weights: Weights;
  overrides: Overrides;
}

export interface SeasonResult {
  index: number;
  kind: SeasonKind;
  label: string;
  crop: CropId;
  nStart: number;
  nEnd: number;
  demandMm: number;
  gapMm: number;
  pumpedMm: number;
  waterLoss: number;
  heatLoss: number;
  pest: number;
  pestBroken: boolean;
  erosion: number;
  bareMonths: string[];
  coveredMonths: number;
  yieldT: number;
  ureaCost: number;
  pumpCost: number;
  profit: number;
}

export interface PlanKpis {
  totalProfit: number;
  worstSeasonProfit: number;
  nStart: number;
  nFinal: number;
  waterMm: number;
  avgErosion: number;
  erosionLevel: "Low" | "Medium" | "High";
  ureaTotal: number;
  pestBreaks: number;
  bareMonthCount: number;
}

export interface PlanResult {
  id: PlanId;
  name: string;
  promise: string;
  rotation: CropId[];
  seasons: SeasonResult[];
  kpis: PlanKpis;
  why: string[];
}

export interface PlansResponse {
  normal: PlanResult[];
  elnino: PlanResult[];
  source: "api" | "demo";
  notes: string[];
}
