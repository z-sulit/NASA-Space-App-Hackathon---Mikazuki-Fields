"""API contract and preset integrity tests for Mikazuki Fields (Gate 1 & Gate 2)."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.schemas import FarmContext, PlanResponse, PresetSummary

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
PRESETS_DIR = REPO_ROOT / "data-prep" / "presets"
EXPECTED_PRESETS = ("bukidnon", "davao_del_sur", "isabela")


def test_preset_json_files_valid_and_agronomic_bounds() -> None:
    """Validate all 3 generated presets against FarmContext and contract bounds."""
    loaded: dict[str, FarmContext] = {}
    for preset_id in EXPECTED_PRESETS:
        path = PRESETS_DIR / f"{preset_id}.json"
        assert path.exists(), f"Missing preset file: {path}"
        raw = json.loads(path.read_text(encoding="utf-8"))
        ctx = FarmContext.model_validate(raw)
        loaded[preset_id] = ctx

        assert len(ctx.banner_metrics) == 5
        assert len(ctx.ndvi_profile.historical_bare_months) > 0
        assert ctx.ndvi_profile.el_nino_ndvi_drop_pct > 0
        assert ctx.climate.normal.wet.rain_mm > ctx.climate.normal.dry.rain_mm
        assert ctx.climate.elnino.dry.rain_mm < ctx.climate.normal.dry.rain_mm

    assert loaded["bukidnon"].terrain.slope_pct > 8.0
    assert loaded["davao_del_sur"].terrain.slope_pct <= 8.0
    assert loaded["isabela"].terrain.slope_pct <= 8.0


def test_health_and_presets_endpoints() -> None:
    """Verify GET /api/health and GET /api/presets return expected Pydantic payloads."""
    with TestClient(app) as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        assert health.json() == {"status": "ok"}

        presets_resp = client.get("/api/presets")
        assert presets_resp.status_code == 200
        summaries = [PresetSummary.model_validate(item) for item in presets_resp.json()]
        assert [s.preset_id for s in summaries] == list(EXPECTED_PRESETS)


def test_farm_endpoint_preset_and_custom_pin() -> None:
    """Verify GET /api/farm works for preset_id and custom pin nearest-preset fallback."""
    with TestClient(app) as client:
        preset_resp = client.get("/api/farm", params={"preset_id": "bukidnon"})
        assert preset_resp.status_code == 200
        preset_ctx = FarmContext.model_validate(preset_resp.json())
        assert preset_ctx.location.preset_id == "bukidnon"
        assert preset_ctx.location.is_custom_pin is False
        assert preset_ctx.terrain.slope_pct > 8.0

        custom_resp = client.get("/api/farm", params={"lat": 8.1, "lon": 125.1})
        assert custom_resp.status_code == 200
        custom_ctx = FarmContext.model_validate(custom_resp.json())
        assert custom_ctx.location.is_custom_pin is True
        assert custom_ctx.location.preset_id is None
        assert custom_ctx.location.lat == 8.1
        assert custom_ctx.location.lon == 125.1
        assert custom_ctx.location.name == "Custom Pin (8.10, 125.10)"


def test_plans_endpoint_contract_and_overrides() -> None:
    """Verify POST /api/plans validates overrides, liming_advisory, and both scenarios."""
    payload = {
        "preset_id": "bukidnon",
        "lat": 7.90,
        "lon": 125.09,
        "baseline_crop": "corn",
        "soil_texture": "loam",
        "irrigation": "rainfed",
        "goal": "cash",
        "sliders": {"water": 40, "soil": 35, "economy": 25},
        "overrides": {
            "soil_n_level": "low",
            "soil_ph": 5.1,
            "last_crop_family": "Poaceae",
            "last_outcome_pests": True,
            "flooded_months": [8, 9],
            "clear_bare_months": [3],
        },
    }

    with TestClient(app) as client:
        resp = client.post("/api/plans", json=payload)
        assert resp.status_code == 200
        plan_resp = PlanResponse.model_validate(resp.json())

        assert plan_resp.liming_advisory is True
        assert len(plan_resp.ground_truth_applied) == 6
        assert "normal" in plan_resp.scenarios
        assert "elnino" in plan_resp.scenarios

        for scenario_key in ("normal", "elnino"):
            scen = plan_resp.scenarios[scenario_key]
            for card in (scen.plan_a, scen.plan_b, scen.plan_c):
                assert len(card.seasons) == 6
                assert len(card.why_bullets) >= 1
