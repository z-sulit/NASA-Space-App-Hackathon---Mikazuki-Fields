from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import numpy as np

from backend.app.schemas import (
    FarmContext,
    PlanKPIs,
    PlanRequest,
    SeasonClimate,
    SeasonStep,
)

CROP_LIB_PATH = Path(__file__).resolve().parent / "crop_library.json"

WHC_MAP = {"sandy": 60.0, "loam": 120.0, "clay": 150.0}
K_SOIL_MAP = {"sandy": 0.6, "loam": 1.0, "clay": 0.8}
FAMILY_TO_ID = {"Poaceae": 0, "Fabaceae": 1, "Convolvulaceae": 2}
WET_MONTHS = [6, 7, 8, 9, 10, 11]
DRY_MONTHS = [12, 1, 2, 3, 4, 5]
SEASON_LABELS = [
    "Y1 Wet (Jun–Nov)",
    "Y1 Dry (Dec–May)",
    "Y2 Wet (Jun–Nov)",
    "Y2 Dry (Dec–May)",
    "Y3 Wet (Jun–Nov)",
    "Y3 Dry (Dec–May)",
]


@dataclass(frozen=True)
class CropArrays:
    crops: list[dict[str, Any]]
    id_to_idx: dict[str, int]
    days: np.ndarray
    kc: np.ndarray
    ky: np.ndarray
    heat_limit_c: np.ndarray
    soil_n_delta: np.ndarray
    cover_c: np.ndarray
    base_yield: np.ndarray
    price: np.ndarray
    base_cost: np.ndarray
    family_id: np.ndarray
    is_paddy: np.ndarray
    is_legume: np.ndarray
    flood_tolerant: np.ndarray
    high_water: np.ndarray
    is_forage: np.ndarray


def load_crop_arrays() -> CropArrays:
    crops = json.loads(CROP_LIB_PATH.read_text(encoding="utf-8"))
    id_to_idx = {c["id"]: i for i, c in enumerate(crops)}
    return CropArrays(
        crops=crops,
        id_to_idx=id_to_idx,
        days=np.array([c["days"] for c in crops], dtype=np.float64),
        kc=np.array([c["kc"] for c in crops], dtype=np.float64),
        ky=np.array([c["ky"] for c in crops], dtype=np.float64),
        heat_limit_c=np.array([c["heat_limit_c"] for c in crops], dtype=np.float64),
        soil_n_delta=np.array([c["soil_n_delta"] for c in crops], dtype=np.float64),
        cover_c=np.array([c["cover_c"] for c in crops], dtype=np.float64),
        base_yield=np.array([c["base_yield_t_ha"] for c in crops], dtype=np.float64),
        price=np.array([c["price_php_per_t"] for c in crops], dtype=np.float64),
        base_cost=np.array([c["base_cost_php"] for c in crops], dtype=np.float64),
        family_id=np.array([FAMILY_TO_ID[c["family"]] for c in crops], dtype=np.int32),
        is_paddy=np.array([c["id"] == "paddy_rice" for c in crops], dtype=bool),
        is_legume=np.array([c["family"] == "Fabaceae" for c in crops], dtype=bool),
        flood_tolerant=np.array([c["flood_tolerant"] for c in crops], dtype=bool),
        high_water=np.array([c["high_water"] for c in crops], dtype=bool),
        is_forage=np.array(["forage" in c["fits_goal"] for c in crops], dtype=bool),
    )


CROP_ARRAYS = load_crop_arrays()


@dataclass
class BatchSimResult:
    total_profit: np.ndarray
    worst_profit: np.ndarray
    final_soil_n: np.ndarray
    mean_erosion: np.ndarray
    mean_pest: np.ndarray
    total_water_deficit: np.ndarray
    total_pumped: np.ndarray
    paddy_rainfed_infeasible: np.ndarray


def resolve_initial_n(req: PlanRequest) -> float:
    n_level = req.overrides.soil_n_level
    if isinstance(n_level, (int, float)):
        return float(np.clip(n_level, 10.0, 100.0))
    n_map = {"low": 35.0, "medium": 65.0, "high": 85.0}
    return n_map.get(n_level or "medium", 65.0)


def _initial_state(req: PlanRequest, wet_gwetroot: float) -> tuple[float, float, float, int]:
    n0 = resolve_initial_n(req)
    whc = WHC_MAP[req.soil_texture]
    store0 = wet_gwetroot * whc
    pest0 = 0.45 if req.overrides.last_outcome_pests else 0.15
    prev_fam = -1
    if req.overrides.last_crop_family and req.overrides.last_crop_family in FAMILY_TO_ID:
        prev_fam = FAMILY_TO_ID[req.overrides.last_crop_family]
    return n0, store0, pest0, prev_fam


def simulate_batch_vectorized(
    seqs: np.ndarray,
    farm: FarmContext,
    req: PlanRequest,
    scenario: Literal["normal", "elnino"],
) -> BatchSimResult:
    """Vectorized 6-season simulation across all (M, 6) candidate crop sequences."""
    m = seqs.shape[0]
    ca = CROP_ARRAYS
    clim_sc = farm.climate.normal if scenario == "normal" else farm.climate.elnino
    whc = np.float32(WHC_MAP[req.soil_texture])
    k_soil = K_SOIL_MAP[req.soil_texture]
    slope_pct = farm.terrain.slope_pct
    is_irrigated = req.irrigation == "irrigated"
    acid_soil = req.overrides.soil_ph is not None and req.overrides.soil_ph < 5.5

    n0, store0, pest0, prev_fam0 = _initial_state(req, clim_sc.wet.gwetroot)

    soil_n = np.full(m, n0, dtype=np.float32)
    store = np.full(m, store0, dtype=np.float32)
    pest = np.full(m, pest0, dtype=np.float32)
    prev_fam = np.full(m, prev_fam0, dtype=np.int8)

    total_profit = np.zeros(m, dtype=np.float32)
    worst_profit = np.full(m, np.inf, dtype=np.float32)
    erosion_sum = np.zeros(m, dtype=np.float32)
    pest_sum = np.zeros(m, dtype=np.float32)
    deficit_sum = np.zeros(m, dtype=np.float32)
    pumped_sum = np.zeros(m, dtype=np.float32)
    paddy_rainfed_infeasible = np.zeros(m, dtype=bool)

    f_bare_8 = (180.0 - ca.days) / 180.0
    c_eff_8 = (ca.days / 180.0) * ca.cover_c + f_bare_8
    gross_rev_8 = (ca.base_yield * ca.price).astype(np.float32)
    base_cost_8 = ca.base_cost.astype(np.float32)
    ky_8 = ca.ky.astype(np.float32)
    fam_8 = ca.family_id.astype(np.int8)

    for t in range(6):
        is_wet = t % 2 == 0
        s_clim: SeasonClimate = clim_sc.wet if is_wet else clim_sc.dry
        next_gwet = clim_sc.dry.gwetroot if is_wet else clim_sc.wet.gwetroot

        demand_8 = (ca.kc * s_clim.et0_mm_day * ca.days + np.where(ca.is_paddy, 200.0, 0.0)).astype(np.float32)
        heat_loss_8 = np.minimum(0.70, 0.10 * np.maximum(0.0, s_clim.tmax_c - ca.heat_limit_c)).astype(np.float32)
        erosion_8 = np.clip(
            (s_clim.rain_mm / 1200.0) * k_soil * (1.0 + slope_pct / 10.0) * c_eff_8 * 50.0,
            0.0,
            100.0,
        ).astype(np.float32)
        sandy_leach = 3.0 if (req.soil_texture == "sandy" and is_wet) else 0.0
        n_delta_8 = ca.soil_n_delta - sandy_leach
        if acid_soil:
            n_delta_8 = np.where(ca.is_legume, 0.5 * n_delta_8, n_delta_8)
        n_delta_8 = n_delta_8.astype(np.float32)

        c_idx = seqs[:, t]
        fam = fam_8[c_idx]
        demand = demand_8[c_idx]
        is_paddy = ca.is_paddy[c_idx]
        is_legume = ca.is_legume[c_idx]

        # 1. Water Balance
        supply = np.float32(0.80 * s_clim.rain_mm) + store
        gap = np.maximum(np.float32(0.0), demand - supply)

        if not is_irrigated:
            paddy_rainfed_infeasible |= is_paddy & (supply < np.float32(0.80) * demand)
            pump_cost = np.float32(0.0)
            water_yield_loss = np.minimum(np.float32(0.85), ky_8[c_idx] * (gap / np.maximum(demand, np.float32(1e-6))))
            deficit_sum += gap
        else:
            pump_cost = gap * np.float32(35.0)
            water_yield_loss = np.float32(0.0)
            pumped_sum += gap

        leftover = np.maximum(np.float32(0.0), supply - demand)
        store = np.float32(0.5) * np.minimum(whc, leftover) + np.float32(0.5 * next_gwet) * whc

        # 2. Heat Penalty
        heat_loss = heat_loss_8[c_idx]

        # 3. Soil Nitrogen & Urea Top-Up
        same_family = (prev_fam >= 0) & (fam == prev_fam)
        delta_n = n_delta_8[c_idx] - np.where(same_family, np.float32(3.0), np.float32(0.0))

        needs_urea = (~is_legume) & (soil_n < np.float32(60.0))
        urea_cost = np.where(needs_urea, (np.float32(60.0) - soil_n) * np.float32(180.0), np.float32(0.0))
        n_yield_factor = np.where(
            ~is_legume,
            np.minimum(np.float32(1.0), np.float32(0.70) + np.float32(0.30) * (soil_n / np.float32(60.0))),
            np.float32(1.0),
        )
        soil_n = np.clip(soil_n + delta_n, np.float32(10.0), np.float32(100.0))

        # 4. Pest Carryover
        if t == 0 and prev_fam0 == -1:
            pest_t = pest
        else:
            pest_t = np.where(same_family, np.minimum(np.float32(1.0), pest + np.float32(0.25)), pest * np.float32(0.30))
        pest = pest_t
        pest_sum += pest_t
        pest_loss = np.float32(0.15) * pest_t

        # 5. Bare-Soil Erosion Index
        erosion_sum += erosion_8[c_idx]

        # 6. Net Seasonal Profit
        profit_t = (
            gross_rev_8[c_idx]
            * (np.float32(1.0) - water_yield_loss)
            * (np.float32(1.0) - heat_loss)
            * (np.float32(1.0) - pest_loss)
            * n_yield_factor
            - base_cost_8[c_idx]
            - urea_cost
            - pump_cost
        )
        total_profit += profit_t
        worst_profit = np.minimum(worst_profit, profit_t)
        prev_fam = fam

    return BatchSimResult(
        total_profit=total_profit.astype(np.float64),
        worst_profit=worst_profit.astype(np.float64),
        final_soil_n=soil_n.astype(np.float64),
        mean_erosion=(erosion_sum / np.float32(6.0)).astype(np.float64),
        mean_pest=(pest_sum / np.float32(6.0)).astype(np.float64),
        total_water_deficit=deficit_sum.astype(np.float64),
        total_pumped=pumped_sum.astype(np.float64),
        paddy_rainfed_infeasible=paddy_rainfed_infeasible,
    )


def _bare_soil_erosion_months(
    days: int,
    heavy_rain_months: list[int],
    season_months: list[int],
    clear_bare_months: list[int],
) -> list[int]:
    """Identify heavy-rain months (>200mm) occurring during the uncovered tail of a 180-day season."""
    covered_months = max(1, round(days / 30.0))
    uncovered_window = season_months[covered_months:]
    cleared = set(clear_bare_months)
    return [m for m in uncovered_window if m in heavy_rain_months and m not in cleared]


def simulate_single_detailed(
    seq: list[int] | np.ndarray,
    farm: FarmContext,
    req: PlanRequest,
    scenario: Literal["normal", "elnino"],
) -> tuple[list[SeasonStep], PlanKPIs]:
    """Run exact 6-season simulation for a single sequence and return full per-season breakdown."""
    ca = CROP_ARRAYS
    clim_sc = farm.climate.normal if scenario == "normal" else farm.climate.elnino
    whc = WHC_MAP[req.soil_texture]
    k_soil = K_SOIL_MAP[req.soil_texture]
    slope_pct = farm.terrain.slope_pct
    is_irrigated = req.irrigation == "irrigated"
    acid_soil = req.overrides.soil_ph is not None and req.overrides.soil_ph < 5.5

    n0, store, pest, prev_fam = _initial_state(req, clim_sc.wet.gwetroot)
    soil_n = n0

    seasons_out: list[SeasonStep] = []
    total_profit = 0.0
    worst_profit = float("inf")
    erosion_sum = 0.0
    deficit_sum = 0.0
    pumped_sum = 0.0
    pest_broken_count = 0
    bare_flag_count = 0

    for t in range(6):
        c_idx = int(seq[t])
        crop = ca.crops[c_idx]
        fam = int(ca.family_id[c_idx])
        days = int(crop["days"])
        is_wet = t % 2 == 0
        s_type: Literal["wet", "dry"] = "wet" if is_wet else "dry"
        s_clim = clim_sc.wet if is_wet else clim_sc.dry
        next_gwet = clim_sc.dry.gwetroot if is_wet else clim_sc.wet.gwetroot

        # 1. Water Balance
        demand = float(crop["kc"]) * s_clim.et0_mm_day * days + (200.0 if crop["id"] == "paddy_rice" else 0.0)
        supply = 0.80 * s_clim.rain_mm + store
        gap = max(0.0, demand - supply)

        if not is_irrigated:
            pumped = 0.0
            pump_cost = 0.0
            water_yield_loss = min(0.85, float(crop["ky"]) * (gap / max(demand, 1e-6)))
            deficit_t = gap
            deficit_sum += gap
        else:
            pumped = gap
            pump_cost = pumped * 35.0
            water_yield_loss = 0.0
            deficit_t = 0.0
            pumped_sum += pumped

        leftover = max(0.0, supply - demand)
        store = 0.5 * min(whc, leftover) + 0.5 * (next_gwet * whc)

        # 2. Heat Penalty
        heat_loss = min(0.70, 0.10 * max(0.0, s_clim.tmax_c - float(crop["heat_limit_c"])))

        # 3. Soil Nitrogen & Urea Top-Up
        same_family = (prev_fam >= 0) and (fam == prev_fam)
        sandy_leach = 3.0 if (req.soil_texture == "sandy" and is_wet) else 0.0
        delta_n = float(crop["soil_n_delta"]) - sandy_leach - (3.0 if same_family else 0.0)
        is_legume = crop["family"] == "Fabaceae"
        if acid_soil and is_legume:
            delta_n *= 0.5

        if (not is_legume) and (soil_n < 60.0):
            urea_cost = (60.0 - soil_n) * 180.0
            n_yield_factor = min(1.0, 0.70 + 0.30 * (soil_n / 60.0))
        else:
            urea_cost = 0.0
            n_yield_factor = 1.0
        soil_n = float(np.clip(soil_n + delta_n, 10.0, 100.0))

        # 4. Pest Carryover
        if t == 0 and prev_fam == -1:
            pest_t = pest
            pest_broken = False
        else:
            if same_family:
                pest_t = min(1.0, pest + 0.25)
                pest_broken = False
            else:
                pest_t = pest * 0.30
                pest_broken = t >= 1
                if pest_broken:
                    pest_broken_count += 1
        pest = pest_t
        pest_loss = 0.15 * pest_t

        # 5. Bare-Soil Erosion Index
        f_bare = (180.0 - days) / 180.0
        c_eff = (days / 180.0) * float(crop["cover_c"]) + f_bare
        erosion_t = float(
            np.clip(
                (s_clim.rain_mm / 1200.0) * k_soil * (1.0 + slope_pct / 10.0) * c_eff * 50.0,
                0.0,
                100.0,
            )
        )
        erosion_sum += erosion_t
        season_months = WET_MONTHS if is_wet else DRY_MONTHS
        bare_months = _bare_soil_erosion_months(
            days,
            s_clim.heavy_rain_months,
            season_months,
            req.overrides.clear_bare_months,
        )
        bare_flag_count += len(bare_months)

        # 6. Net Seasonal Profit
        eff_yield = (
            float(crop["base_yield_t_ha"])
            * (1.0 - water_yield_loss)
            * (1.0 - heat_loss)
            * (1.0 - pest_loss)
            * n_yield_factor
        )
        revenue = eff_yield * float(crop["price_php_per_t"])
        profit_t = revenue - float(crop["base_cost_php"]) - urea_cost - pump_cost

        total_profit += profit_t
        worst_profit = min(worst_profit, profit_t)
        prev_fam = fam

        seasons_out.append(
            SeasonStep(
                season_index=t,
                season_label=SEASON_LABELS[t],
                season_type=s_type,
                crop_id=crop["id"],
                crop_name=crop["name"],
                family=crop["family"],
                demand_mm=round(demand, 1),
                supply_mm=round(supply, 1),
                water_gap_mm=round(deficit_t, 1),
                pumped_mm=round(pumped, 1),
                water_yield_loss=round(water_yield_loss, 3),
                heat_loss=round(heat_loss, 3),
                pest_level=round(pest_t, 3),
                pest_loss=round(pest_loss, 3),
                pest_broken_badge=pest_broken,
                soil_n=round(soil_n, 1),
                urea_cost_php=round(urea_cost, 0),
                pump_cost_php=round(pump_cost, 0),
                erosion_index=round(erosion_t, 1),
                bare_soil_erosion_months=bare_months,
                effective_yield_t_ha=round(eff_yield, 2),
                profit_php=round(profit_t, 0),
            )
        )

    kpis = PlanKPIs(
        total_profit_php=round(total_profit, 0),
        worst_season_profit_php=round(worst_profit, 0),
        profit_elnino_delta_pct=0.0,
        total_water_gap_mm=round(deficit_sum, 1),
        total_pumped_mm=round(pumped_sum, 1),
        final_soil_n=round(soil_n, 1),
        soil_n_delta=round(soil_n - n0, 1),
        mean_erosion_index=round(erosion_sum / 6.0, 1),
        bare_month_count=bare_flag_count,
        pest_break_count=pest_broken_count,
        water_score=0.0,
        soil_score=0.0,
        economy_score=0.0,
    )
    return seasons_out, kpis
