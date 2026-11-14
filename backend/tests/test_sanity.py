from __future__ import annotations

import time
import numpy as np

from backend.app.main import _resolve_farm_context, post_plans
from backend.app.optimizer import ALL_SEQS, optimize_plans
from backend.app.schemas import PlanOverrides, PlanRequest, PlanResponse, PlanSliders
from backend.app.simulator import CROP_ARRAYS, simulate_batch_vectorized, simulate_single_detailed


def _bukidnon_request(**kwargs) -> PlanRequest:
    defaults = dict(
        preset_id="bukidnon",
        lat=7.90,
        lon=125.09,
        baseline_crop="corn",
        soil_texture="loam",
        irrigation="rainfed",
        goal="cash",
        sliders=PlanSliders(water=33.3, soil=33.3, economy=33.4),
        overrides=PlanOverrides(),
    )
    defaults.update(kwargs)
    return PlanRequest(**defaults)


def test_monoculture_depletes_nitrogen():
    """1. Continuous corn x 6 ends with N6 < N0."""
    farm = _resolve_farm_context(preset_id="bukidnon", lat=7.90, lon=125.09)
    req = _bukidnon_request()
    corn_idx = CROP_ARRAYS.id_to_idx["corn"]
    seq = [corn_idx] * 6
    _, kpis = simulate_single_detailed(seq, farm, req, "normal")
    assert kpis.final_soil_n < 65.0
    assert kpis.soil_n_delta < 0.0


def test_plan_b_includes_legume():
    """2. Under default slider weights (33, 33, 33), Plan B contains at least one Fabaceae crop."""
    farm = _resolve_farm_context(preset_id="bukidnon", lat=7.90, lon=125.09)
    req = _bukidnon_request()
    resp = optimize_plans(req, farm)
    families = [s.family for s in resp.scenarios["normal"].plan_b.seasons]
    assert "Fabaceae" in families


def test_no_paddy_rice_in_rainfed_dry_season():
    """3. Neither Plan B nor Plan C places paddy_rice in a rainfed dry season when supply < 0.80 * demand."""
    farm = _resolve_farm_context(preset_id="bukidnon", lat=7.90, lon=125.09).model_copy(deep=True)
    farm.climate.normal.dry.rain_mm = 300.0
    farm.climate.elnino.dry.rain_mm = 225.0
    req = _bukidnon_request(irrigation="rainfed")
    resp = optimize_plans(req, farm)
    for plan in (resp.scenarios["normal"].plan_b, resp.scenarios["normal"].plan_c):
        for s in plan.seasons:
            if s.season_type == "dry":
                assert s.crop_id != "paddy_rice"


def test_elnino_hurts_status_quo_more_than_plan_c():
    """4. Profit drop under El Nino (Normal_Profit - ElNino_Profit) is strictly larger for Plan A than for Plan C.

    Uses Bukidnon's real data as shipped: El Nino replays its 2015-16 NASA POWER months.
    """
    farm = _resolve_farm_context(preset_id="bukidnon", lat=7.90, lon=125.09)
    req = _bukidnon_request()
    resp = optimize_plans(req, farm)
    drop_a = (
        resp.scenarios["normal"].plan_a.kpis.total_profit_php
        - resp.scenarios["elnino"].plan_a.kpis.total_profit_php
    )
    drop_c = (
        resp.scenarios["normal"].plan_c.kpis.total_profit_php
        - resp.scenarios["elnino"].plan_c.kpis.total_profit_php
    )
    assert drop_a > 0, "corn monoculture should lose money in the 2015-16 El Nino dry season"
    assert drop_a > drop_c


def test_elnino_is_observed_2015_16_with_monthly_series():
    """El Nino climate is the real 2015-16 months (not a flat shift), with month-by-month series."""
    for pid in ("bukidnon", "davao_del_sur", "isabela"):
        farm = _resolve_farm_context(preset_id=pid)
        assert farm.climate.elnino_basis == "observed_2015_2016"
        for scenario in (farm.climate.normal, farm.climate.elnino):
            for season in (scenario.wet, scenario.dry):
                assert len(season.monthly_rain_mm) == 6
                assert len(season.monthly_tmax_c) == 6
                assert len(season.monthly_et0_mm_day) == 6
                assert abs(sum(season.monthly_rain_mm) - season.rain_mm) < 1.0
        assert farm.climate.elnino.dry.rain_mm < farm.climate.normal.dry.rain_mm


def test_monthly_dry_spell_counts_even_when_season_total_is_plentiful():
    """A dry spell inside the season causes a water gap even if the 6-month total covers demand."""
    farm = _resolve_farm_context(preset_id="bukidnon").model_copy(deep=True)
    dry = farm.climate.elnino.dry
    corn = [i for i, c in enumerate(CROP_ARRAYS.crops) if c["id"] == "corn"][0]
    # Total rain is far above corn's ~400 mm need, but the months corn is in the ground are dry.
    dry.monthly_rain_mm = [20.0, 15.0, 10.0, 5.0, 600.0, 600.0]
    dry.rain_mm = sum(dry.monthly_rain_mm)
    seq = np.array([corn] * 6)
    seasons, _ = simulate_single_detailed(seq, farm, _bukidnon_request(), "elnino")
    assert seasons[1].water_gap_mm > 0
    assert seasons[1].water_yield_loss > 0


def test_vectorized_matches_single_detailed_elnino():
    """Batch and detailed simulators agree under El Nino too (monthly water balance)."""
    farm = _resolve_farm_context(preset_id="davao_del_sur")
    req = _bukidnon_request(preset_id="davao_del_sur")
    sample_indices = np.array([0, 4681, 12345, 98765, 200000, 262143])
    batch = simulate_batch_vectorized(ALL_SEQS[sample_indices], farm, req, "elnino")
    for k, idx in enumerate(sample_indices):
        _, kpis = simulate_single_detailed(ALL_SEQS[idx], farm, req, "elnino")
        assert abs(batch.total_profit[k] - kpis.total_profit_php) < 1.0
        assert abs(batch.total_water_deficit[k] - kpis.total_water_gap_mm) < 0.2


def test_water_slider_monotonicity():
    """5. Increasing sliders.water from 10 to 90 never increases Plan B's total water deficit/pumping."""
    farm = _resolve_farm_context(preset_id="bukidnon", lat=7.90, lon=125.09)
    req_low = _bukidnon_request(sliders=PlanSliders(water=10, soil=45, economy=45))
    req_high = _bukidnon_request(sliders=PlanSliders(water=90, soil=5, economy=5))
    resp_low = optimize_plans(req_low, farm)
    resp_high = optimize_plans(req_high, farm)
    def_low = resp_low.scenarios["normal"].plan_b.kpis.total_water_gap_mm
    def_high = resp_high.scenarios["normal"].plan_b.kpis.total_water_gap_mm
    assert def_high <= def_low + 1e-6


def test_vectorized_speed_under_one_second():
    """6. Full POST /api/plans evaluation completes in < 1.0s."""
    req = _bukidnon_request()
    post_plans(req)  # warm up

    t0 = time.perf_counter()
    resp = post_plans(req)
    elapsed = time.perf_counter() - t0
    assert isinstance(resp, PlanResponse)
    assert elapsed < 1.0, f"post_plans took {elapsed:.3f}s (>= 1.0s)"


def test_vectorized_matches_single_detailed():
    """Verify vectorized batch simulator matches single-sequence detailed simulator exactly."""
    farm = _resolve_farm_context(preset_id="bukidnon", lat=7.90, lon=125.09)
    req = _bukidnon_request()
    sample_indices = np.array([0, 12345, 98765, 200000, 262143])
    batch = simulate_batch_vectorized(ALL_SEQS[sample_indices], farm, req, "normal")
    for k, idx in enumerate(sample_indices):
        _, kpis = simulate_single_detailed(ALL_SEQS[idx], farm, req, "normal")
        assert abs(batch.total_profit[k] - kpis.total_profit_php) < 1.0
        assert abs(batch.final_soil_n[k] - kpis.final_soil_n) < 0.1
        assert abs(batch.total_water_deficit[k] - kpis.total_water_gap_mm) < 0.2


def test_acid_soil_liming_advisory_and_flood_override():
    """Verify soil_ph < 5.5 triggers liming_advisory and flooded_months enforces flood-tolerant crops."""
    farm = _resolve_farm_context(preset_id="davao_del_sur", lat=6.75, lon=125.36)
    req = _bukidnon_request(
        preset_id="davao_del_sur",
        lat=6.75,
        lon=125.36,
        overrides=PlanOverrides(soil_ph=4.9, flooded_months=[8, 9]),
    )
    resp = optimize_plans(req, farm)
    assert resp.liming_advisory is True
    for s in resp.scenarios["normal"].plan_b.seasons:
        if s.season_type == "wet":
            assert s.crop_id == "paddy_rice"
