"""API contract, preset integrity, and custom-pin cache tests for Mikazuki Fields."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

import requests
from fastapi.testclient import TestClient

from backend.app import main as main_mod
from backend.app import power_client
from backend.app.main import app
from backend.app.schemas import FarmContext, PlanResponse, PresetSummary

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
PRESETS_DIR = REPO_ROOT / "data-prep" / "presets"
FALLBACK_PATH = REPO_ROOT / "frontend" / "public" / "fallback_plans.json"
EXPECTED_PRESETS = ("bukidnon", "davao_del_sur", "isabela")


def _make_mock_power_payload(wet_prectot: float = 12.0, dry_prectot: float = 3.0) -> dict[str, Any]:
    """Build a synthetic 2015-2024 NASA POWER monthly response with month 13 and -999 fill."""
    t2m: dict[str, float] = {}
    t2m_max: dict[str, float] = {}
    prectot: dict[str, float] = {}
    gwet: dict[str, float] = {}
    allsky: dict[str, float] = {}

    for year in range(2015, 2025):
        for month in range(1, 13):
            key = f"{year}{month:02d}"
            is_wet = 6 <= month <= 11
            t2m[key] = 24.0 if is_wet else 25.5
            t2m_max[key] = 30.0 if is_wet else 33.0
            prectot[key] = wet_prectot if is_wet else dry_prectot
            gwet[key] = 0.80 if is_wet else 0.50
            allsky[key] = 17.0 if is_wet else 19.5
        annual_key = f"{year}13"
        t2m[annual_key] = 24.75
        t2m_max[annual_key] = 31.5
        prectot[annual_key] = 7.5
        gwet[annual_key] = 0.65
        allsky[annual_key] = 18.25

    prectot["202006"] = -999.0

    return {
        "parameters": {"ALLSKY_SFC_SW_DWN": {"units": "MJ/m^2/day"}},
        "properties": {
            "parameter": {
                "T2M": t2m,
                "T2M_MAX": t2m_max,
                "PRECTOTCORR": prectot,
                "GWETROOT": gwet,
                "ALLSKY_SFC_SW_DWN": allsky,
            }
        },
    }


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


def test_farm_endpoint_preset() -> None:
    """Verify GET /api/farm works for a loaded preset_id."""
    with TestClient(app) as client:
        preset_resp = client.get("/api/farm", params={"preset_id": "bukidnon"})
        assert preset_resp.status_code == 200
        preset_ctx = FarmContext.model_validate(preset_resp.json())
        assert preset_ctx.location.preset_id == "bukidnon"
        assert preset_ctx.location.is_custom_pin is False
        assert preset_ctx.terrain.slope_pct > 8.0


def test_custom_pin_cache_miss_then_cache_hit(tmp_path: Path, monkeypatch: Any) -> None:
    """Verify custom pin fetches mocked NASA POWER on miss, writes cache, and serves hit offline."""
    monkeypatch.setattr(main_mod, "CACHE_DIR", tmp_path)
    mock_payload = _make_mock_power_payload(wet_prectot=12.0, dry_prectot=3.0)
    calls = {"count": 0}

    class _FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, Any]:
            return mock_payload

    def _fake_get(url: str, params: dict[str, Any], timeout: float) -> _FakeResponse:
        calls["count"] += 1
        assert timeout == 10.0
        assert params["community"] == "AG"
        return _FakeResponse()

    monkeypatch.setattr(power_client.requests, "get", _fake_get)

    with TestClient(app) as client:
        resp_miss = client.get("/api/farm", params={"lat": 8.1, "lon": 125.1})
        assert resp_miss.status_code == 200
        ctx_miss = FarmContext.model_validate(resp_miss.json())
        assert ctx_miss.location.is_custom_pin is True
        assert ctx_miss.location.preset_id is None
        assert ctx_miss.location.lat == 8.1
        assert ctx_miss.location.lon == 125.1
        assert ctx_miss.location.name == "Custom Pin (8.10, 125.10)"
        assert ctx_miss.climate.normal.wet.rain_mm == 2196.0
        assert len(ctx_miss.banner_metrics) == 5
        assert calls["count"] == 1

        cache_file = tmp_path / "8.10_125.10.json"
        assert cache_file.exists()

        def _fail_if_called(*_args: Any, **_kwargs: Any) -> Any:
            raise AssertionError("requests.get must not be called on cache hit")

        monkeypatch.setattr(power_client.requests, "get", _fail_if_called)

        resp_hit = client.get("/api/farm", params={"lat": 8.1, "lon": 125.1})
        assert resp_hit.status_code == 200
        ctx_hit = FarmContext.model_validate(resp_hit.json())
        assert ctx_hit.climate.normal.wet.rain_mm == 2196.0


def test_custom_pin_timeout_fallback_no_cache(tmp_path: Path, monkeypatch: Any) -> None:
    """Verify timeout falls back to nearest preset climate with is_custom_pin=True and writes no cache."""
    monkeypatch.setattr(main_mod, "CACHE_DIR", tmp_path)

    def _raise_timeout(*_args: Any, **_kwargs: Any) -> Any:
        raise requests.Timeout("NASA POWER timed out")

    monkeypatch.setattr(power_client.requests, "get", _raise_timeout)

    bukidnon = FarmContext.model_validate(json.loads((PRESETS_DIR / "bukidnon.json").read_text(encoding="utf-8")))

    with TestClient(app) as client:
        resp = client.get("/api/farm", params={"lat": 8.1, "lon": 125.1})
        assert resp.status_code == 200
        ctx = FarmContext.model_validate(resp.json())
        assert ctx.location.is_custom_pin is True
        assert ctx.location.preset_id is None
        assert ctx.location.name == "Custom Pin (8.10, 125.10)"
        assert ctx.climate.normal.wet.rain_mm == bukidnon.climate.normal.wet.rain_mm
        assert not (tmp_path / "8.10_125.10.json").exists()


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


def test_fallback_plans_json_valid() -> None:
    """Verify frontend/public/fallback_plans.json exists and validates against contract schemas."""
    assert FALLBACK_PATH.exists(), f"Missing fallback bundle: {FALLBACK_PATH}"
    raw = json.loads(FALLBACK_PATH.read_text(encoding="utf-8"))

    presets = [PresetSummary.model_validate(item) for item in raw["presets"]]
    assert [p.preset_id for p in presets] == list(EXPECTED_PRESETS)

    for pid in EXPECTED_PRESETS:
        farm = FarmContext.model_validate(raw["farms"][pid])
        assert farm.location.preset_id == pid
        assert len(farm.banner_metrics) == 5

        plan = PlanResponse.model_validate(raw["plans"][pid])
        assert "normal" in plan.scenarios
        assert "elnino" in plan.scenarios
        for scenario_key in ("normal", "elnino"):
            scen = plan.scenarios[scenario_key]
            for card in (scen.plan_a, scen.plan_b, scen.plan_c):
                assert len(card.seasons) == 6
                assert len(card.why_bullets) >= 1


def test_root_and_working_dir_imports() -> None:
    """Verify GET /, cloud deployment configs at repo root, and imports from backend/ cwd."""
    with TestClient(app) as client:
        root_resp = client.get("/")
        assert root_resp.status_code == 200
        root_data = root_resp.json()
        assert root_data["status"] == "ok"
        assert root_data["health"] == "/api/health"

    for filename in ("render.yaml", "Procfile", "railway.json", ".python-version"):
        assert (REPO_ROOT / filename).exists(), f"Missing deployment config: {filename}"

    railway_cfg = json.loads((REPO_ROOT / "railway.json").read_text(encoding="utf-8"))
    assert railway_cfg["deploy"]["healthcheckPath"] == "/api/health"

    proc = subprocess.run(
        [
            sys.executable,
            "-c",
            "import app.main, app.power_client, app.optimizer, app.simulator; assert app.main.app.title == 'Mikazuki Fields API'",
        ],
        cwd=REPO_ROOT / "backend",
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, f"Import from backend/ cwd failed: {proc.stderr}"


def test_vercel_serverless_entry_and_readonly_cache_fallback(tmp_path: Path, monkeypatch: Any) -> None:
    """Verify Vercel ASGI entrypoint, config files, VERCEL=1 tempdir cache, and read-only write safety."""
    assert (REPO_ROOT / "api" / "index.py").exists()
    assert (REPO_ROOT / "vercel.json").exists()
    assert (REPO_ROOT / "requirements.txt").exists()

    vercel_cfg = json.loads((REPO_ROOT / "vercel.json").read_text(encoding="utf-8"))
    assert any(
        r.get("source") == "/api/(.*)" and r.get("destination") == "/api/index.py"
        for r in vercel_cfg.get("rewrites", [])
    )

    from api.index import app as vercel_app

    assert vercel_app is app

    monkeypatch.setenv("VERCEL", "1")
    cache_dir = main_mod._get_cache_dir()
    assert Path(tempfile.gettempdir()).resolve() in cache_dir.resolve().parents

    monkeypatch.delenv("VERCEL", raising=False)
    ro_dir = tmp_path / "readonly_cache"
    monkeypatch.setattr(main_mod, "CACHE_DIR", ro_dir)
    orig_mkdir = Path.mkdir

    def _deny_ro_mkdir(self: Path, *args: Any, **kwargs: Any) -> None:
        if self == ro_dir:
            raise PermissionError("Read-only filesystem")
        return orig_mkdir(self, *args, **kwargs)

    monkeypatch.setattr(Path, "mkdir", _deny_ro_mkdir)
    fallback_dir = main_mod._get_cache_dir()
    assert fallback_dir == Path(tempfile.gettempdir()) / "mikazuki_cache"

    mock_payload = _make_mock_power_payload(wet_prectot=11.0, dry_prectot=2.5)

    class _FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, Any]:
            return mock_payload

    monkeypatch.setattr(power_client.requests, "get", lambda *_a, **_kw: _FakeResponse())
    orig_write_text = Path.write_text

    def _deny_cache_write(self: Path, *args: Any, **kwargs: Any) -> int:
        if self.parent == fallback_dir:
            raise OSError("Read-only cache directory")
        return orig_write_text(self, *args, **kwargs)

    monkeypatch.setattr(Path, "write_text", _deny_cache_write)
    stale_cache = fallback_dir / "8.15_125.15.json"
    if stale_cache.exists():
        stale_cache.unlink()

    with TestClient(app) as client:
        resp = client.get("/api/farm", params={"lat": 8.15, "lon": 125.15})
        assert resp.status_code == 200
        ctx = FarmContext.model_validate(resp.json())
        assert ctx.location.is_custom_pin is True
        assert ctx.climate.normal.wet.rain_mm == 2013.0
