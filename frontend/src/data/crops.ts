import type { Crop, CropId } from "../types";

// Mirrors backend/app/crop_library.json in docs/agronomic_model_vectorized_optimizer_spec.md.
// Keep in sync until the API serves it.
export const CROPS: Crop[] = [
  { id: "corn", name: "Yellow/White Corn", short: "Corn", family: "Poaceae", days: 110, kc: 0.85, ky: 1.25, heat_limit_c: 35, soil_n_delta: -18, cover_c: 0.45, fits_goal: ["cash", "forage"], base_yield_t_ha: 4.8, price_php_per_t: 17500, base_cost_php: 36000, flood_tolerant: false, high_water: false },
  { id: "paddy_rice", name: "Paddy Rice", short: "Paddy rice", family: "Poaceae", days: 120, kc: 1.2, ky: 1.2, heat_limit_c: 35, soil_n_delta: -14, cover_c: 0.1, fits_goal: ["cash"], base_yield_t_ha: 4.5, price_php_per_t: 20000, base_cost_php: 42000, flood_tolerant: true, high_water: true },
  { id: "upland_rice", name: "Upland Rice", short: "Upland rice", family: "Poaceae", days: 110, kc: 0.95, ky: 1.15, heat_limit_c: 35, soil_n_delta: -12, cover_c: 0.4, fits_goal: ["cash"], base_yield_t_ha: 3.0, price_php_per_t: 21000, base_cost_php: 28000, flood_tolerant: false, high_water: true },
  { id: "sorghum", name: "Sorghum", short: "Sorghum", family: "Poaceae", days: 100, kc: 0.75, ky: 0.9, heat_limit_c: 40, soil_n_delta: -12, cover_c: 0.45, fits_goal: ["forage", "cash"], base_yield_t_ha: 4.2, price_php_per_t: 15500, base_cost_php: 24000, flood_tolerant: false, high_water: false },
  { id: "mungbean", name: "Mungbean (Monggo)", short: "Mungbean", family: "Fabaceae", days: 65, kc: 0.75, ky: 1.15, heat_limit_c: 40, soil_n_delta: 12, cover_c: 0.35, fits_goal: ["cash"], base_yield_t_ha: 1.2, price_php_per_t: 62000, base_cost_php: 22000, flood_tolerant: false, high_water: false },
  { id: "peanut", name: "Peanut", short: "Peanut", family: "Fabaceae", days: 100, kc: 0.8, ky: 0.7, heat_limit_c: 38, soil_n_delta: 10, cover_c: 0.3, fits_goal: ["cash"], base_yield_t_ha: 1.8, price_php_per_t: 48000, base_cost_php: 30000, flood_tolerant: false, high_water: false },
  { id: "cowpea", name: "Cowpea (Paayap)", short: "Cowpea", family: "Fabaceae", days: 75, kc: 0.75, ky: 1.1, heat_limit_c: 40, soil_n_delta: 12, cover_c: 0.3, fits_goal: ["forage", "cash"], base_yield_t_ha: 1.5, price_php_per_t: 45000, base_cost_php: 20000, flood_tolerant: false, high_water: false },
  { id: "sweet_potato", name: "Sweet Potato (Camote)", short: "Sweet potato", family: "Convolvulaceae", days: 100, kc: 0.8, ky: 0.85, heat_limit_c: 38, soil_n_delta: -6, cover_c: 0.2, fits_goal: ["cash"], base_yield_t_ha: 11.0, price_php_per_t: 8500, base_cost_php: 32000, flood_tolerant: false, high_water: false },
];

export const CROP: Record<CropId, Crop> = Object.fromEntries(CROPS.map((c) => [c.id, c])) as Record<CropId, Crop>;
