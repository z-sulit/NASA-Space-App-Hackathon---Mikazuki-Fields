"""Frozen Pydantic v2 API contract for Mikazuki Fields (Gate 1)."""

from __future__ import annotations

from typing import Literal, Optional, Union

from pydantic import BaseModel, Field


class PresetSummary(BaseModel):
    """Summary metadata for a pre-cached Philippine farm preset."""

    preset_id: str
    name: str
    lat: float
    lon: float
    baseline_crop: str
    typical_terrain: str


class LocationInfo(BaseModel):
    """Selected farm coordinates and preset metadata."""

    preset_id: Optional[str] = None
    name: str
    lat: float
    lon: float
    is_custom_pin: bool = False


class TerrainInfo(BaseModel):
    """SRTM 30m elevation and derived slope erosion risk."""

    elevation_m: float
    slope_pct: float
    erosion_risk_label: str
    # True when read live from SRTM for this exact point; False for a preset's cached value or one borrowed from the nearest preset.
    live: bool = False


class NDVIProfile(BaseModel):
    """MODIS MOD13Q1 250m greenness and bare-soil profile (2015-2024)."""

    mean_ndvi: float
    historical_bare_months: list[int] = Field(default_factory=list)
    el_nino_ndvi_drop_pct: float


class SeasonClimate(BaseModel):
    """6-month seasonal agro-climatic summary from NASA POWER."""

    rain_mm: float
    t2m_c: float
    tmax_c: float
    gwetroot: float = Field(..., ge=0.0, le=1.0)
    allsky_mj: float
    et0_mm_day: float
    heavy_rain_months: list[int] = Field(default_factory=list)
    # Month-by-month series in season order (wet: Jun..Nov, dry: Dec..May). The simulator
    # runs its water balance per month when these are present, so a dry spell inside a
    # season counts even when the 6-month total looks plentiful. Empty = season totals only.
    monthly_rain_mm: list[float] = Field(default_factory=list)
    monthly_tmax_c: list[float] = Field(default_factory=list)
    monthly_et0_mm_day: list[float] = Field(default_factory=list)


class ScenarioClimate(BaseModel):
    """Wet and dry season climate pair for a scenario."""

    wet: SeasonClimate
    dry: SeasonClimate


class ClimateBundle(BaseModel):
    """Normal and El Nino climate scenarios for a farm."""

    normal: ScenarioClimate
    elnino: ScenarioClimate
    # "observed_2015_2016": El Nino replays this location's Jun 2015-May 2016 NASA POWER months.
    # "synthetic": -25% rain, +1.5 C on the 10-year normals (used when those months are missing).
    elnino_basis: Literal["observed_2015_2016", "synthetic"] = "synthetic"


class BannerMetric(BaseModel):
    """Plain-English NASA metric chip for the Top Banner."""

    id: str
    scientific_term: str
    farmer_label: str
    value_display: str
    status: Literal["good", "warning", "danger"] = "good"
    source: str
    tooltip: str


class FarmContext(BaseModel):
    """Complete multi-dataset farm profile returned by GET /api/farm."""

    location: LocationInfo
    terrain: TerrainInfo
    ndvi_profile: NDVIProfile
    climate: ClimateBundle
    banner_metrics: list[BannerMetric]


class PlanSliders(BaseModel):
    """Farmer priority weights (water, soil, economy)."""

    water: float = Field(40.0, ge=0.0, le=100.0)
    soil: float = Field(35.0, ge=0.0, le=100.0)
    economy: float = Field(25.0, ge=0.0, le=100.0)


class PlanOverrides(BaseModel):
    """Optional farmer ground-truth overrides."""

    soil_n_level: Optional[Union[Literal["low", "medium", "high"], float]] = None
    soil_ph: Optional[float] = Field(default=None, ge=3.0, le=9.5)
    last_crop_family: Optional[str] = None
    last_outcome_pests: bool = False
    flooded_months: list[int] = Field(default_factory=list)
    clear_bare_months: list[int] = Field(default_factory=list)
    max_budget_php: Optional[float] = Field(default=None, ge=0.0)
    excluded_crops: list[str] = Field(default_factory=list)
    must_include_staple: bool = False
    last_harvest_yield_t_ha: Optional[float] = Field(default=None, gt=0.0, le=50.0)


class PlanRequest(BaseModel):
    """Request payload for POST /api/plans."""

    preset_id: Optional[str] = "bukidnon"
    lat: float = Field(default=7.90, ge=-90.0, le=90.0)
    lon: float = Field(default=125.09, ge=-180.0, le=180.0)
    baseline_crop: str = "corn"
    soil_texture: Literal["clay", "clay_loam", "silty_loam", "loam", "sandy_loam", "sandy"] = "loam"
    irrigation: Literal["rainfed", "irrigated"] = "rainfed"
    goal: Literal["cash", "forage"] = "cash"
    sliders: PlanSliders = Field(default_factory=PlanSliders)
    overrides: PlanOverrides = Field(default_factory=PlanOverrides)


class SeasonStep(BaseModel):
    """Single-season agronomic and financial simulation output."""

    season_index: int
    season_label: str
    season_type: Literal["wet", "dry"]
    crop_id: str
    crop_name: str
    family: str
    demand_mm: float
    supply_mm: float
    water_gap_mm: float
    pumped_mm: float
    water_yield_loss: float
    heat_loss: float
    pest_level: float
    pest_loss: float
    pest_broken_badge: bool
    soil_n: float
    urea_cost_php: float
    pump_cost_php: float
    erosion_index: float
    bare_soil_erosion_months: list[int] = Field(default_factory=list)
    effective_yield_t_ha: float
    profit_php: float


class PlanKPIs(BaseModel):
    """Aggregated 6-season KPIs and normalized scores for a plan."""

    total_profit_php: float
    worst_season_profit_php: float
    profit_elnino_delta_pct: float
    total_water_gap_mm: float
    total_pumped_mm: float
    final_soil_n: float
    soil_n_delta: float
    mean_erosion_index: float
    bare_month_count: int
    pest_break_count: int
    water_score: float
    soil_score: float
    economy_score: float


class PlanCard(BaseModel):
    """One of the three compared 6-season rotation plans."""

    id: Literal["plan_a", "plan_b", "plan_c"]
    title: str
    subtitle: str
    kpis: PlanKPIs
    seasons: list[SeasonStep]
    why_bullets: list[str]


class ScenarioPlans(BaseModel):
    """Plans A, B, and C evaluated under a single climate scenario."""

    plan_a: PlanCard
    plan_b: PlanCard
    plan_c: PlanCard


class PlanResponse(BaseModel):
    """Response payload for POST /api/plans containing normal and El Nino scenarios."""

    ground_truth_applied: list[str] = Field(default_factory=list)
    liming_advisory: bool = False
    scenarios: dict[Literal["normal", "elnino"], ScenarioPlans]
