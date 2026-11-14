"""FastAPI thin-slice backend for Mikazuki Fields (Gate 2)."""

from __future__ import annotations

import importlib
import importlib.util
import json
import logging
import math
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal, Optional

import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.app.power_client import build_banner_metrics, fetch_custom_pin_climate
from backend.app.schemas import (
    FarmContext,
    LocationInfo,
    PlanCard,
    PlanKPIs,
    PlanRequest,
    PlanResponse,
    PresetSummary,
    ScenarioPlans,
    SeasonClimate,
    SeasonStep,
)

DATA_PREP_DIR = REPO_ROOT / "data-prep"
PRESETS_DIR = DATA_PREP_DIR / "presets"
PRESETS_CONFIG_PATH = DATA_PREP_DIR / "presets_config.py"
CACHE_DIR = REPO_ROOT / "backend" / "cache"

logger = logging.getLogger(__name__)

SEASON_LABELS = [
    "Y1 Wet (Jun–Nov)",
    "Y1 Dry (Dec–May)",
    "Y2 Wet (Jun–Nov)",
    "Y2 Dry (Dec–May)",
    "Y3 Wet (Jun–Nov)",
    "Y3 Dry (Dec–May)",
]
SEASON_MONTHS: dict[Literal["wet", "dry"], list[int]] = {
    "wet": [6, 7, 8, 9, 10, 11],
    "dry": [12, 1, 2, 3, 4, 5],
}
WHC_BY_TEXTURE = {"sandy": 60.0, "loam": 120.0, "clay": 150.0}
K_SOIL_BY_TEXTURE = {"sandy": 0.6, "loam": 1.0, "clay": 0.8}
SOIL_N_LEVEL_MAP = {"low": 35.0, "medium": 65.0, "high": 85.0}

CROP_SPECS: dict[str, dict[str, Any]] = {
    "corn": {
        "id": "corn",
        "name": "Yellow/White Corn",
        "family": "Poaceae",
        "days": 110,
        "kc": 0.85,
        "ky": 1.25,
        "heat_limit_c": 35.0,
        "soil_n_delta": -18.0,
        "cover_c": 0.45,
        "base_yield_t_ha": 4.8,
        "price_php_per_t": 17500.0,
        "base_cost_php": 36000.0,
    },
    "paddy_rice": {
        "id": "paddy_rice",
        "name": "Paddy Rice",
        "family": "Poaceae",
        "days": 120,
        "kc": 1.20,
        "ky": 1.20,
        "heat_limit_c": 35.0,
        "soil_n_delta": -14.0,
        "cover_c": 0.10,
        "base_yield_t_ha": 4.5,
        "price_php_per_t": 20000.0,
        "base_cost_php": 42000.0,
    },
    "upland_rice": {
        "id": "upland_rice",
        "name": "Upland Rice",
        "family": "Poaceae",
        "days": 110,
        "kc": 0.95,
        "ky": 1.15,
        "heat_limit_c": 35.0,
        "soil_n_delta": -12.0,
        "cover_c": 0.40,
        "base_yield_t_ha": 3.0,
        "price_php_per_t": 21000.0,
        "base_cost_php": 28000.0,
    },
    "sorghum": {
        "id": "sorghum",
        "name": "Sorghum",
        "family": "Poaceae",
        "days": 100,
        "kc": 0.75,
        "ky": 0.90,
        "heat_limit_c": 40.0,
        "soil_n_delta": -12.0,
        "cover_c": 0.45,
        "base_yield_t_ha": 4.2,
        "price_php_per_t": 15500.0,
        "base_cost_php": 24000.0,
    },
    "mungbean": {
        "id": "mungbean",
        "name": "Mungbean (Monggo)",
        "family": "Fabaceae",
        "days": 65,
        "kc": 0.75,
        "ky": 1.15,
        "heat_limit_c": 40.0,
        "soil_n_delta": 12.0,
        "cover_c": 0.35,
        "base_yield_t_ha": 1.2,
        "price_php_per_t": 62000.0,
        "base_cost_php": 22000.0,
    },
    "peanut": {
        "id": "peanut",
        "name": "Peanut",
        "family": "Fabaceae",
        "days": 100,
        "kc": 0.80,
        "ky": 0.70,
        "heat_limit_c": 38.0,
        "soil_n_delta": 10.0,
        "cover_c": 0.30,
        "base_yield_t_ha": 1.8,
        "price_php_per_t": 48000.0,
        "base_cost_php": 30000.0,
    },
    "cowpea": {
        "id": "cowpea",
        "name": "Cowpea (Paayap)",
        "family": "Fabaceae",
        "days": 75,
        "kc": 0.75,
        "ky": 1.10,
        "heat_limit_c": 40.0,
        "soil_n_delta": 12.0,
        "cover_c": 0.30,
        "base_yield_t_ha": 1.5,
        "price_php_per_t": 45000.0,
        "base_cost_php": 20000.0,
    },
    "sweet_potato": {
        "id": "sweet_potato",
        "name": "Sweet Potato (Camote)",
        "family": "Convolvulaceae",
        "days": 100,
        "kc": 0.80,
        "ky": 0.85,
        "heat_limit_c": 38.0,
        "soil_n_delta": -6.0,
        "cover_c": 0.20,
        "base_yield_t_ha": 11.0,
        "price_php_per_t": 8500.0,
        "base_cost_php": 32000.0,
    },
}

_PRESET_SUMMARIES: list[PresetSummary] = []
_FARM_CONTEXTS: dict[str, FarmContext] = {}


def _load_presets_config() -> dict[str, dict[str, Any]]:
    spec = importlib.util.spec_from_file_location("presets_config", PRESETS_CONFIG_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {PRESETS_CONFIG_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return dict(module.PRESETS)


def load_presets() -> None:
    """Load preset metadata and validated FarmContext JSON files into memory."""
    presets_cfg = _load_presets_config()
    summaries: list[PresetSummary] = []
    contexts: dict[str, FarmContext] = {}

    for preset_id, meta in presets_cfg.items():
        summaries.append(PresetSummary.model_validate(meta))
        preset_file = PRESETS_DIR / f"{preset_id}.json"
        if not preset_file.exists():
            raise FileNotFoundError(f"Missing preset JSON: {preset_file}")
        raw = json.loads(preset_file.read_text(encoding="utf-8"))
        contexts[preset_id] = FarmContext.model_validate(raw)

    _PRESET_SUMMARIES[:] = summaries
    _FARM_CONTEXTS.clear()
    _FARM_CONTEXTS.update(contexts)


def _ensure_loaded() -> None:
    if not _FARM_CONTEXTS:
        load_presets()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_presets()
    yield


app = FastAPI(title="Mikazuki Fields API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _resolve_farm_context(
    preset_id: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> FarmContext:
    _ensure_loaded()
    if preset_id and preset_id in _FARM_CONTEXTS:
        return _FARM_CONTEXTS[preset_id].model_copy(deep=True)

    if lat is None or lon is None:
        if preset_id:
            raise HTTPException(status_code=404, detail=f"Unknown preset_id '{preset_id}'")
        raise HTTPException(status_code=400, detail="Provide either a valid preset_id or both lat and lon.")

    cache_path = CACHE_DIR / f"{lat:.2f}_{lon:.2f}.json"
    if cache_path.exists():
        try:
            cached_raw = json.loads(cache_path.read_text(encoding="utf-8"))
            return FarmContext.model_validate(cached_raw)
        except (OSError, ValueError) as exc:
            logger.warning("Ignoring corrupt cache file %s: %s", cache_path, exc)

    nearest_id = min(
        _FARM_CONTEXTS.keys(),
        key=lambda pid: math.hypot(lat - _FARM_CONTEXTS[pid].location.lat, lon - _FARM_CONTEXTS[pid].location.lon),
    )
    nearest = _FARM_CONTEXTS[nearest_id]
    custom_location = LocationInfo(
        preset_id=None,
        name=f"Custom Pin ({lat:.2f}, {lon:.2f})",
        lat=lat,
        lon=lon,
        is_custom_pin=True,
    )

    try:
        live_climate = fetch_custom_pin_climate(lat, lon, timeout_s=10.0)
        custom_ctx = FarmContext(
            location=custom_location,
            terrain=nearest.terrain.model_copy(deep=True),
            ndvi_profile=nearest.ndvi_profile.model_copy(deep=True),
            climate=live_climate,
            banner_metrics=build_banner_metrics(live_climate, nearest.terrain, nearest.ndvi_profile),
        )
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(custom_ctx.model_dump_json(indent=2), encoding="utf-8")
        return custom_ctx
    except (requests.RequestException, TimeoutError, ValueError) as exc:
        logger.warning("Custom pin live NASA POWER fetch failed for (%.2f, %.2f): %s; using nearest preset %s", lat, lon, exc, nearest_id)
        fallback = nearest.model_copy(deep=True)
        fallback.location = custom_location
        return fallback


def _build_ground_truth_chips(req: PlanRequest) -> list[str]:
    ov = req.overrides
    chips: list[str] = []
    if ov.soil_n_level is not None:
        chips.append(f"Soil N: {ov.soil_n_level}")
    if ov.soil_ph is not None:
        chips.append(f"Soil pH: {ov.soil_ph:.1f}")
    if ov.last_crop_family:
        chips.append(f"Prior Family: {ov.last_crop_family}")
    if ov.last_outcome_pests:
        chips.append("Prior Pest Outbreak")
    if ov.flooded_months:
        months_str = ",".join(str(m) for m in sorted(set(ov.flooded_months)))
        chips.append(f"Flooded Months: {months_str}")
    if ov.clear_bare_months:
        months_str = ",".join(str(m) for m in sorted(set(ov.clear_bare_months)))
        chips.append(f"Cleared Bare Months: {months_str}")
    return chips


def _initial_soil_n(req: PlanRequest) -> float:
    level = req.overrides.soil_n_level
    if isinstance(level, (int, float)):
        return float(max(10.0, min(100.0, level)))
    if isinstance(level, str):
        return SOIL_N_LEVEL_MAP.get(level.lower(), 65.0)
    return 65.0


def _simulate_sequence(
    crop_ids: list[str],
    req: PlanRequest,
    farm: FarmContext,
    scenario: Literal["normal", "elnino"],
) -> tuple[list[SeasonStep], PlanKPIs]:
    clim_bundle = farm.climate.normal if scenario == "normal" else farm.climate.elnino
    whc = WHC_BY_TEXTURE[req.soil_texture]
    k_soil = K_SOIL_BY_TEXTURE[req.soil_texture]
    slope_pct = farm.terrain.slope_pct
    low_ph = req.overrides.soil_ph is not None and req.overrides.soil_ph < 5.5
    cleared_bare = set(req.overrides.clear_bare_months)
    bare_reference = set(farm.ndvi_profile.historical_bare_months) - cleared_bare

    soil_n0 = _initial_soil_n(req)
    soil_n = soil_n0
    store = clim_bundle.wet.gwetroot * whc
    pest = 0.45 if req.overrides.last_outcome_pests else 0.15
    prev_family = req.overrides.last_crop_family

    steps: list[SeasonStep] = []
    for idx, crop_id in enumerate(crop_ids):
        season_type: Literal["wet", "dry"] = "wet" if idx % 2 == 0 else "dry"
        next_type: Literal["wet", "dry"] = "dry" if season_type == "wet" else "wet"
        season_clim: SeasonClimate = getattr(clim_bundle, season_type)
        next_clim: SeasonClimate = getattr(clim_bundle, next_type)
        crop = CROP_SPECS.get(crop_id, CROP_SPECS["corn"])

        demand_mm = crop["kc"] * season_clim.et0_mm_day * crop["days"]
        if crop["id"] == "paddy_rice":
            demand_mm += 200.0
        supply_mm = 0.80 * season_clim.rain_mm + store
        gap_mm = max(0.0, demand_mm - supply_mm)

        if req.irrigation == "irrigated":
            pumped_mm = gap_mm
            pump_cost = pumped_mm * 35.0
            water_yield_loss = 0.0
        else:
            pumped_mm = 0.0
            pump_cost = 0.0
            water_yield_loss = min(0.85, crop["ky"] * (gap_mm / demand_mm)) if demand_mm > 0 else 0.0

        leftover = max(0.0, supply_mm - demand_mm)
        store = 0.5 * min(whc, leftover) + 0.5 * (next_clim.gwetroot * whc)

        heat_loss = min(0.70, 0.10 * max(0.0, season_clim.tmax_c - crop["heat_limit_c"]))

        same_family = prev_family is not None and crop["family"] == prev_family
        if prev_family is None:
            pest_broken = False
        elif same_family:
            pest = min(1.0, pest + 0.25)
            pest_broken = False
        else:
            pest = pest * 0.30
            pest_broken = idx >= 1
        pest_loss = 0.15 * pest

        is_legume = crop["family"] == "Fabaceae"
        delta_n = float(crop["soil_n_delta"])
        if req.soil_texture == "sandy" and season_type == "wet":
            delta_n -= 3.0
        if same_family:
            delta_n -= 3.0
        if low_ph and is_legume:
            delta_n *= 0.5

        if not is_legume and soil_n < 60.0:
            urea_cost = (60.0 - soil_n) * 180.0
            n_yield_factor = min(1.0, 0.70 + 0.30 * (soil_n / 60.0))
        else:
            urea_cost = 0.0
            n_yield_factor = 1.0

        next_soil_n = float(max(10.0, min(100.0, soil_n + delta_n)))

        f_bare = max(0.0, (180.0 - crop["days"]) / 180.0)
        c_eff = (crop["days"] / 180.0) * crop["cover_c"] + f_bare
        erosion_index = max(
            0.0,
            min(100.0, (season_clim.rain_mm / 1200.0) * k_soil * (1.0 + slope_pct / 10.0) * c_eff * 50.0),
        )

        season_months = set(SEASON_MONTHS[season_type])
        heavy_in_season = set(season_clim.heavy_rain_months) & season_months
        bare_in_season = (bare_reference & season_months) if f_bare > 0.20 else set()
        bare_erosion_months = sorted((heavy_in_season & bare_in_season) | (heavy_in_season if crop["days"] < 90 else set()))

        eff_yield = (
            crop["base_yield_t_ha"]
            * (1.0 - water_yield_loss)
            * (1.0 - heat_loss)
            * (1.0 - pest_loss)
            * n_yield_factor
        )
        profit_php = eff_yield * crop["price_php_per_t"] - crop["base_cost_php"] - urea_cost - pump_cost

        steps.append(
            SeasonStep(
                season_index=idx,
                season_label=SEASON_LABELS[idx],
                season_type=season_type,
                crop_id=crop["id"],
                crop_name=crop["name"],
                family=crop["family"],
                demand_mm=round(demand_mm, 1),
                supply_mm=round(supply_mm, 1),
                water_gap_mm=round(gap_mm, 1),
                pumped_mm=round(pumped_mm, 1),
                water_yield_loss=round(water_yield_loss, 3),
                heat_loss=round(heat_loss, 3),
                pest_level=round(pest, 3),
                pest_loss=round(pest_loss, 3),
                pest_broken_badge=pest_broken,
                soil_n=round(next_soil_n, 1),
                urea_cost_php=round(urea_cost, 0),
                pump_cost_php=round(pump_cost, 0),
                erosion_index=round(erosion_index, 1),
                bare_soil_erosion_months=bare_erosion_months,
                effective_yield_t_ha=round(eff_yield, 2),
                profit_php=round(profit_php, 0),
            )
        )
        soil_n = next_soil_n
        prev_family = crop["family"]

    total_profit = sum(s.profit_php for s in steps)
    worst_profit = min(s.profit_php for s in steps)
    total_gap = sum(s.water_gap_mm for s in steps)
    total_pumped = sum(s.pumped_mm for s in steps)
    final_n = steps[-1].soil_n
    mean_erosion = sum(s.erosion_index for s in steps) / len(steps)
    mean_pest = sum(s.pest_level for s in steps) / len(steps)
    bare_count = sum(len(s.bare_soil_erosion_months) for s in steps)
    pest_breaks = sum(1 for s in steps if s.pest_broken_badge)

    water_metric = total_pumped if req.irrigation == "irrigated" else total_gap
    water_score = max(0.0, min(100.0, 100.0 - water_metric / 15.0))
    soil_score = max(0.0, min(100.0, 0.5 * final_n + 0.3 * (100.0 - mean_erosion) + 0.2 * (100.0 - 100.0 * mean_pest)))
    economy_score = max(0.0, min(100.0, total_profit / 3500.0))

    kpis = PlanKPIs(
        total_profit_php=round(total_profit, 0),
        worst_season_profit_php=round(worst_profit, 0),
        profit_elnino_delta_pct=0.0,
        total_water_gap_mm=round(total_gap, 1),
        total_pumped_mm=round(total_pumped, 1),
        final_soil_n=round(final_n, 1),
        soil_n_delta=round(final_n - soil_n0, 1),
        mean_erosion_index=round(mean_erosion, 1),
        bare_month_count=bare_count,
        pest_break_count=pest_breaks,
        water_score=round(water_score, 1),
        soil_score=round(soil_score, 1),
        economy_score=round(economy_score, 1),
    )
    return steps, kpis


def _stub_sequences(req: PlanRequest, farm: FarmContext) -> dict[Literal["plan_a", "plan_b", "plan_c"], list[str]]:
    baseline = req.baseline_crop if req.baseline_crop in CROP_SPECS else "corn"
    can_paddy = farm.terrain.slope_pct <= 8.0 and (req.irrigation == "irrigated" or farm.climate.normal.wet.rain_mm >= 1100.0)
    if req.goal == "forage":
        plan_b = ["corn", "cowpea", "sorghum", "cowpea", "corn", "mungbean"]
    elif can_paddy and baseline == "paddy_rice":
        plan_b = ["paddy_rice", "mungbean", "corn", "peanut", "paddy_rice", "mungbean"]
    else:
        plan_b = ["corn", "mungbean", "sweet_potato", "peanut", "corn", "mungbean"]
    plan_c = ["sorghum", "cowpea", "sweet_potato", "mungbean", "sorghum", "peanut"]
    return {"plan_a": [baseline] * 6, "plan_b": plan_b, "plan_c": plan_c}


def _generate_stub_plans(req: PlanRequest, farm: FarmContext) -> PlanResponse:
    seqs = _stub_sequences(req, farm)
    titles = {
        "plan_a": ("Plan A: Status Quo", "Continuous Monoculture"),
        "plan_b": ("Plan B: Balanced Optimal", "Recommended Route"),
        "plan_c": ("Plan C: Drought-Safe", "Max Water & Soil Protection"),
    }

    sim_cache: dict[tuple[str, str], tuple[list[SeasonStep], PlanKPIs]] = {}
    for scenario in ("normal", "elnino"):
        for pid, crop_seq in seqs.items():
            sim_cache[(scenario, pid)] = _simulate_sequence(crop_seq, req, farm, scenario)  # type: ignore[arg-type]

    for pid in ("plan_a", "plan_b", "plan_c"):
        norm_profit = sim_cache[("normal", pid)][1].total_profit_php
        el_profit = sim_cache[("elnino", pid)][1].total_profit_php
        delta_pct = round(((el_profit - norm_profit) / abs(norm_profit)) * 100.0, 1) if norm_profit else 0.0
        sim_cache[("normal", pid)][1].profit_elnino_delta_pct = delta_pct
        sim_cache[("elnino", pid)][1].profit_elnino_delta_pct = delta_pct

    scenarios: dict[Literal["normal", "elnino"], ScenarioPlans] = {}
    for scenario in ("normal", "elnino"):
        cards: dict[str, PlanCard] = {}
        for pid in ("plan_a", "plan_b", "plan_c"):
            steps, kpis = sim_cache[(scenario, pid)]
            title, subtitle = titles[pid]
            if pid == "plan_a":
                bullets = [
                    f"Repeats {steps[0].crop_name} every season, building pest pressure across {steps[0].family}.",
                    f"Ending soil nitrogen shifts by {kpis.soil_n_delta:+.1f} kg/ha, driving urea top-up cost.",
                ]
            elif pid == "plan_b":
                bullets = [
                    f"Breaks grass pest cycles {kpis.pest_break_count} times with Fabaceae and root rotations.",
                    f"Balances 3-year profit (PHP {kpis.total_profit_php:,.0f}) with {kpis.final_soil_n:.1f} kg/ha final Soil N.",
                ]
            else:
                bullets = [
                    f"Prioritizes drought-hardy crops with only {kpis.total_water_gap_mm:.0f} mm rainfed gap.",
                    f"Keeps erosion index at {kpis.mean_erosion_index:.1f} across {farm.terrain.slope_pct:.1f}% slope.",
                ]
            cards[pid] = PlanCard(
                id=pid,  # type: ignore[arg-type]
                title=title,
                subtitle=subtitle,
                kpis=kpis,
                seasons=steps,
                why_bullets=bullets,
            )
        scenarios[scenario] = ScenarioPlans(
            plan_a=cards["plan_a"],
            plan_b=cards["plan_b"],
            plan_c=cards["plan_c"],
        )

    return PlanResponse(
        ground_truth_applied=_build_ground_truth_chips(req),
        liming_advisory=(req.overrides.soil_ph is not None and req.overrides.soil_ph < 5.5),
        scenarios=scenarios,
    )


def _try_external_optimizer(req: PlanRequest, farm: FarmContext) -> Optional[PlanResponse]:
    """Delegate to Person 2's vectorized optimizer once backend/app/optimizer.py is added."""
    try:
        optimizer = importlib.import_module("backend.app.optimizer")
    except ImportError:
        return None
    fn = getattr(optimizer, "generate_plans", None) or getattr(optimizer, "optimize_plans", None)
    if fn is None:
        return None
    result = fn(req, farm)
    return result if isinstance(result, PlanResponse) else PlanResponse.model_validate(result)


@app.get("/")
def root() -> dict[str, str]:
    """Service metadata and liveness indicator at root path."""
    return {
        "service": "Mikazuki Fields API",
        "status": "ok",
        "docs": "/docs",
        "health": "/api/health",
    }


@app.get("/api/health")
def health_check() -> dict[str, str]:
    """Liveness probe."""
    return {"status": "ok"}


@app.get("/api/presets", response_model=list[PresetSummary])
def get_presets() -> list[PresetSummary]:
    """Return the 3 pre-cached Philippine farm locations."""
    _ensure_loaded()
    return _PRESET_SUMMARIES


@app.get("/api/farm", response_model=FarmContext)
def get_farm(
    preset_id: Optional[str] = Query(default=None),
    lat: Optional[float] = Query(default=None, ge=-90.0, le=90.0),
    lon: Optional[float] = Query(default=None, ge=-180.0, le=180.0),
) -> FarmContext:
    """Return FarmContext for a preset_id or nearest preset fallback for custom pins."""
    return _resolve_farm_context(preset_id=preset_id, lat=lat, lon=lon)


@app.post("/api/plans", response_model=PlanResponse)
def post_plans(req: PlanRequest) -> PlanResponse:
    """Evaluate Plans A, B, and C across normal and El Nino scenarios."""
    farm = _resolve_farm_context(preset_id=req.preset_id, lat=req.lat, lon=req.lon)
    response = _try_external_optimizer(req, farm)
    if response is not None:
        return response
    return _generate_stub_plans(req, farm)
