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


PADDY_EXTRA_MM = 200.0  # puddling + percolation on top of crop water use
RAIN_EFFECTIVE = 0.80  # share of rain that reaches the root zone
BARE_EVAP_FRAC = 0.30  # soil evaporation as a share of ET0 while the field is bare


def season_water(
    c_idx: np.ndarray,
    store: np.ndarray,
    s_clim: SeasonClimate,
    whc: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Water balance for one season, for every sequence at once (c_idx, store: shape (m,)).

    Returns (demand, supply, gap, end_store, crop_tmax), each shape (m,).

    With monthly series it runs a soil bucket month by month while the crop is in the
    ground (a crop of D days occupies D/30 months from planting), so a dry spell inside
    the season shows up as a gap even when the 6-month total is plentiful. Without them it
    falls back to the original season-total balance.
    """
    ca = CROP_ARRAYS
    c_idx = np.asarray(c_idx).astype(np.intp, copy=False)  # one conversion, not one per lookup
    paddy_extra = np.where(ca.is_paddy, PADDY_EXTRA_MM, 0.0)
    monthly = len(s_clim.monthly_rain_mm) == 6 and len(s_clim.monthly_et0_mm_day) == 6 and len(s_clim.monthly_tmax_c) == 6

    if not monthly:
        demand_8 = ca.kc * s_clim.et0_mm_day * ca.days + paddy_extra
        demand = demand_8[c_idx]
        supply = RAIN_EFFECTIVE * s_clim.rain_mm + store
        gap = np.maximum(0.0, demand - supply)
        end_store = np.maximum(0.0, supply - demand)
        crop_tmax = np.full(c_idx.shape, s_clim.tmax_c)
        return demand, supply, gap, end_store, crop_tmax

    rain = np.asarray(s_clim.monthly_rain_mm, dtype=np.float64)
    et0 = np.asarray(s_clim.monthly_et0_mm_day, dtype=np.float64)
    tmax = np.asarray(s_clim.monthly_tmax_c, dtype=np.float64)
    # Fraction of each month the crop is in the ground: (8 crops, 6 months).
    frac = np.clip(ca.days[:, None] / 30.0 - np.arange(6)[None, :], 0.0, 1.0)
    crop_months = frac.sum(axis=1)
    need_8m = ca.kc[:, None] * et0[None, :] * 30.0 * frac + paddy_extra[:, None] * frac / crop_months[:, None]
    bare_8m = BARE_EVAP_FRAC * et0[None, :] * 30.0 * (1.0 - frac)
    supply_rain_8 = (RAIN_EFFECTIVE * rain[None, :] * (frac > 0)).sum(axis=1)
    tmax_8 = (frac * tmax[None, :]).sum(axis=1) / crop_months
    peak_tmax_8 = np.where(frac > 0, tmax[None, :], -np.inf).max(axis=1)
    eff_tmax_8 = 0.7 * tmax_8 + 0.3 * peak_tmax_8

    # The batch run covers 262,144 sequences per season, so this loop is kept lean:
    # float32, 1-D takes from per-month rows, and no per-crop lookup in months when no
    # crop is in the ground (every crop is out by month 5; max duration is 120 days).
    need_rows = np.ascontiguousarray(need_8m.T, dtype=np.float32)
    bare_rows = np.ascontiguousarray(bare_8m.T, dtype=np.float32)
    planted = frac.max(axis=0) > 0
    whc32 = np.float32(whc)
    store32 = store.astype(np.float32, copy=False)
    # Exact shortcut: if every sequence starts the season with the same soil water (always in
    # season 1, and usually after a wet season refills the soil), the result depends only on
    # the crop, so run the 8 crops once and copy the answers out.
    if c_idx.size > 64 and store32.size and np.all(store32 == store32[0]):
        crops = np.arange(len(ca.days), dtype=np.intp)
        d8, s8, g8, e8, t8 = season_water(crops, np.full(crops.shape, store32[0], dtype=np.float32), s_clim, whc)
        return d8.take(c_idx), s8.take(c_idx), g8.take(c_idx), e8.take(c_idx), t8.take(c_idx)
    gap = np.zeros(c_idx.shape, dtype=np.float32)
    bucket = store32.copy()
    for k in range(6):
        eff_rain = np.float32(RAIN_EFFECTIVE * rain[k])
        if planted[k]:
            need = need_rows[k].take(c_idx)
            avail = bucket + eff_rain
            short = need - avail
            np.maximum(short, np.float32(0.0), out=short)
            gap += short
            bucket = avail - need
            bucket -= bare_rows[k].take(c_idx)
        else:
            bucket += eff_rain - bare_rows[k][0]
        np.clip(bucket, np.float32(0.0), whc32, out=bucket)
    demand = need_8m.sum(axis=1).astype(np.float32).take(c_idx)
    supply = supply_rain_8.astype(np.float32).take(c_idx) + store.astype(np.float32, copy=False)
    return demand, supply, gap, bucket, eff_tmax_8.astype(np.float32).take(c_idx)


def heat_loss_from(crop_tmax: np.ndarray, heat_limit: np.ndarray) -> np.ndarray:
    return np.minimum(0.70, 0.10 * np.maximum(0.0, crop_tmax - heat_limit))


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


def resolve_initial_n(req: PlanRequest, mean_ndvi: float = 0.40) -> float:
    n_level = req.overrides.soil_n_level
    if isinstance(n_level, (int, float)):
        return float(np.clip(n_level, 10.0, 100.0))
    if n_level is None:
        return 55.0 if mean_ndvi < 0.35 else (70.0 if mean_ndvi >= 0.50 else 65.0)
    n_map = {"low": 35.0, "medium": 65.0, "high": 85.0}
    return n_map.get(n_level, 65.0)


def _initial_state(req: PlanRequest, wet_gwetroot: float, mean_ndvi: float = 0.40) -> tuple[float, float, float, int]:
    n0 = resolve_initial_n(req, mean_ndvi)
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

    mean_ndvi = farm.ndvi_profile.mean_ndvi
    n0, store0, pest0, prev_fam0 = _initial_state(req, clim_sc.wet.gwetroot, mean_ndvi)

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
    ph_factor_8 = np.where((~ca.is_legume) & acid_soil, np.float32(0.95), np.float32(1.0)).astype(np.float32)

    for t in range(6):
        is_wet = t % 2 == 0
        s_clim: SeasonClimate = clim_sc.wet if is_wet else clim_sc.dry
        next_gwet = clim_sc.dry.gwetroot if is_wet else clim_sc.wet.gwetroot

        ndvi_erosion_mult = 1.15 if ((not is_wet) and mean_ndvi < 0.35) else 1.0
        erosion_8 = np.clip(
            (s_clim.rain_mm / 1200.0) * k_soil * (1.0 + slope_pct / 10.0) * c_eff_8 * 50.0 * ndvi_erosion_mult,
            0.0,
            100.0,
        ).astype(np.float32)
        if req.soil_texture == "sandy":
            rain_leach = 2.0 + 3.0 * min(1.0, max(0.0, (s_clim.rain_mm - 600.0) / 800.0))
        elif req.soil_texture == "loam" and s_clim.rain_mm > 1000.0:
            rain_leach = 1.5 * min(1.0, (s_clim.rain_mm - 1000.0) / 600.0)
        else:
            rain_leach = 0.0
        n_delta_8 = ca.soil_n_delta - rain_leach
        if acid_soil:
            n_delta_8 = np.where(ca.is_legume, 0.5 * n_delta_8, n_delta_8)
        n_delta_8 = n_delta_8.astype(np.float32)

        c_idx = seqs[:, t]
        fam = fam_8[c_idx]
        is_paddy = ca.is_paddy[c_idx]
        is_legume = ca.is_legume[c_idx]

        # 1. Water Balance + NASA GWETROOT waterlogging
        demand, supply, gap, end_store, crop_tmax = season_water(c_idx, store, s_clim, float(whc))
        demand = demand.astype(np.float32, copy=False)
        supply = supply.astype(np.float32, copy=False)
        gap = gap.astype(np.float32, copy=False)

        if not is_irrigated:
            paddy_rainfed_infeasible |= is_paddy & (supply < np.float32(0.80) * demand)
            pump_cost = np.float32(0.0)
            water_yield_loss = np.minimum(np.float32(0.85), ky_8[c_idx] * (gap / np.maximum(demand, np.float32(1e-6))))
            deficit_sum += gap
        else:
            pump_cost = gap * np.float32(35.0)
            water_yield_loss = np.float32(0.0)
            pumped_sum += gap

        if s_clim.gwetroot > 0.85:
            wl_base = min(0.25, 1.2 * (s_clim.gwetroot - 0.85)) * (0.5 if req.soil_texture == "sandy" else 1.0)
            waterlog_mult_8 = np.where(~ca.flood_tolerant, np.float32(1.0 - wl_base), np.float32(1.0)).astype(np.float32)
        else:
            waterlog_mult_8 = np.ones(len(ca.days), dtype=np.float32)

        store = (np.float32(0.5) * np.minimum(whc, end_store.astype(np.float32, copy=False)) + np.float32(0.5 * next_gwet) * whc).astype(np.float32, copy=False)

        # 2. Heat Penalty (mean + peak monthly NASA T2M_MAX) and Solar Radiation (NASA ALLSKY_SFC_SW_DWN)
        heat_loss = heat_loss_from(crop_tmax, ca.heat_limit_c.astype(np.float32).take(c_idx.astype(np.intp, copy=False))).astype(np.float32, copy=False)
        solar_factor = np.float32(min(1.06, max(0.88, 1.0 + 0.015 * (s_clim.allsky_mj - 18.5))))
        env_mult_8 = (waterlog_mult_8 * ph_factor_8 * solar_factor).astype(np.float32)

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

        # 4. Pest Carryover & Rotation Vigor
        if t == 0 and prev_fam0 == -1:
            pest_t = pest
        else:
            pest_t = np.where(same_family, np.minimum(np.float32(1.0), pest + np.float32(0.25)), pest * np.float32(0.30))
        pest = pest_t
        pest_sum += pest_t
        pest_loss = np.float32(0.15) * pest_t

        rotation_factor = np.ones(m, dtype=np.float32)
        rotation_factor[(~is_legume) & (prev_fam == 1)] = np.float32(1.06)
        if t > 0 or req.overrides.last_outcome_pests:
            rotation_factor[same_family] = np.float32(0.97)

        # 5. Bare-Soil Erosion Index
        erosion_sum += erosion_8[c_idx]

        # 6. Net Seasonal Profit (88% fixed + 12% harvest cost scaled by yield)
        yield_ratio = (
            (np.float32(1.0) - water_yield_loss)
            * (np.float32(1.0) - heat_loss)
            * (np.float32(1.0) - pest_loss)
            * n_yield_factor
            * env_mult_8[c_idx]
            * rotation_factor
        )
        crop_cost = base_cost_8[c_idx] * (np.float32(0.88) + np.float32(0.12) * np.minimum(np.float32(1.1), yield_ratio))
        profit_t = (
            gross_rev_8[c_idx] * yield_ratio
            - crop_cost
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

    mean_ndvi = farm.ndvi_profile.mean_ndvi
    n0, store, pest, prev_fam = _initial_state(req, clim_sc.wet.gwetroot, mean_ndvi)
    prev_fam0 = prev_fam
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

        # 1. Water Balance (same routine as the batch run)
        d_arr, s_arr, g_arr, end_arr, tmax_arr = season_water(np.array([c_idx]), np.array([store], dtype=np.float64), s_clim, whc)
        demand, supply, gap, end_store, crop_tmax = float(d_arr[0]), float(s_arr[0]), float(g_arr[0]), float(end_arr[0]), float(tmax_arr[0])

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

        if (not bool(crop["flood_tolerant"])) and s_clim.gwetroot > 0.85:
            waterlog_loss = min(0.25, 1.2 * (s_clim.gwetroot - 0.85)) * (0.5 if req.soil_texture == "sandy" else 1.0)
        else:
            waterlog_loss = 0.0

        store = 0.5 * min(whc, end_store) + 0.5 * (next_gwet * whc)

        # 2. Heat Penalty & Solar Radiation
        heat_loss = min(0.70, 0.10 * max(0.0, crop_tmax - float(crop["heat_limit_c"])))
        solar_factor = min(1.06, max(0.88, 1.0 + 0.015 * (s_clim.allsky_mj - 18.5)))

        # 3. Soil Nitrogen, rain-driven leaching & Urea Top-Up
        same_family = (prev_fam >= 0) and (fam == prev_fam)
        if req.soil_texture == "sandy":
            rain_leach = 2.0 + 3.0 * min(1.0, max(0.0, (s_clim.rain_mm - 600.0) / 800.0))
        elif req.soil_texture == "loam" and s_clim.rain_mm > 1000.0:
            rain_leach = 1.5 * min(1.0, (s_clim.rain_mm - 1000.0) / 600.0)
        else:
            rain_leach = 0.0
        delta_n = float(crop["soil_n_delta"]) - rain_leach - (3.0 if same_family else 0.0)
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

        # 4. Pest Carryover & Rotation Vigor
        if t == 0 and prev_fam0 == -1:
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

        legume_boost = (not is_legume) and (prev_fam == 1)
        mono_drag = same_family and ((t > 0) or req.overrides.last_outcome_pests)
        rotation_factor = 1.06 if legume_boost else (0.97 if mono_drag else 1.0)
        ph_factor = 0.95 if ((not is_legume) and acid_soil) else 1.0

        # 5. Bare-Soil Erosion Index
        f_bare = (180.0 - days) / 180.0
        c_eff = (days / 180.0) * float(crop["cover_c"]) + f_bare
        ndvi_erosion_mult = 1.15 if ((not is_wet) and mean_ndvi < 0.35) else 1.0
        erosion_t = float(
            np.clip(
                (s_clim.rain_mm / 1200.0) * k_soil * (1.0 + slope_pct / 10.0) * c_eff * 50.0 * ndvi_erosion_mult,
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
        yield_ratio = (
            (1.0 - water_yield_loss)
            * (1.0 - waterlog_loss)
            * (1.0 - heat_loss)
            * (1.0 - pest_loss)
            * n_yield_factor
            * solar_factor
            * rotation_factor
            * ph_factor
        )
        eff_yield = float(crop["base_yield_t_ha"]) * yield_ratio
        crop_cost = float(crop["base_cost_php"]) * (0.88 + 0.12 * min(1.1, yield_ratio))
        revenue = eff_yield * float(crop["price_php_per_t"])
        profit_t = revenue - crop_cost - urea_cost - pump_cost

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
