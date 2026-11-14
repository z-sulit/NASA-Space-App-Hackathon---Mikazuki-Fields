"""FastAPI thin-slice backend for Mikazuki Fields (Gate 2)."""

from __future__ import annotations

import importlib.util
import json
import logging
import math
import os
import sys
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.app.optimizer import optimize_plans
from backend.app.power_client import build_banner_metrics, fetch_custom_pin_climate
from backend.app.schemas import (
    FarmContext,
    LocationInfo,
    PlanRequest,
    PlanResponse,
    PresetSummary,
)

DATA_PREP_DIR = REPO_ROOT / "data-prep"
PRESETS_DIR = DATA_PREP_DIR / "presets"
PRESETS_CONFIG_PATH = DATA_PREP_DIR / "presets_config.py"
CACHE_DIR = REPO_ROOT / "backend" / "cache"

logger = logging.getLogger(__name__)

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


def _get_cache_dir() -> Path:
    """Return writable custom-pin cache dir, using tempdir on Vercel or read-only filesystems."""
    tmp_cache = Path(tempfile.gettempdir()) / "mikazuki_cache"
    if os.environ.get("VERCEL"):
        try:
            tmp_cache.mkdir(parents=True, exist_ok=True)
        except OSError:
            pass
        return tmp_cache
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        return CACHE_DIR
    except OSError:
        try:
            tmp_cache.mkdir(parents=True, exist_ok=True)
        except OSError:
            pass
        return tmp_cache


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

    cache_dir = _get_cache_dir()
    cache_path = cache_dir / f"{lat:.2f}_{lon:.2f}.json"
    custom_location = LocationInfo(
        preset_id=None,
        name=f"Custom Pin ({lat:.2f}, {lon:.2f})",
        lat=lat,
        lon=lon,
        is_custom_pin=True,
    )
    if cache_path.exists():
        try:
            cached = FarmContext.model_validate(json.loads(cache_path.read_text(encoding="utf-8")))
            # The cache key rounds to 0.01 degrees; report the point that was asked for.
            cached.location = custom_location
            return cached
        except (OSError, ValueError) as exc:
            logger.warning("Ignoring corrupt cache file %s: %s", cache_path, exc)

    nearest_id = min(
        _FARM_CONTEXTS.keys(),
        key=lambda pid: math.hypot(lat - _FARM_CONTEXTS[pid].location.lat, lon - _FARM_CONTEXTS[pid].location.lon),
    )
    nearest = _FARM_CONTEXTS[nearest_id]

    try:
        live_climate = fetch_custom_pin_climate(lat, lon, timeout_s=10.0)
        custom_ctx = FarmContext(
            location=custom_location,
            terrain=nearest.terrain.model_copy(deep=True),
            ndvi_profile=nearest.ndvi_profile.model_copy(deep=True),
            climate=live_climate,
            banner_metrics=build_banner_metrics(live_climate, nearest.terrain, nearest.ndvi_profile),
        )
        try:
            cache_dir.mkdir(parents=True, exist_ok=True)
            cache_path.write_text(custom_ctx.model_dump_json(indent=2), encoding="utf-8")
        except OSError as exc:
            logger.warning("Unable to write custom pin cache %s: %s", cache_path, exc)
        return custom_ctx
    except (requests.RequestException, TimeoutError, ValueError) as exc:
        logger.warning("Custom pin live NASA POWER fetch failed for (%.2f, %.2f): %s; using nearest preset %s", lat, lon, exc, nearest_id)
        fallback = nearest.model_copy(deep=True)
        fallback.location = custom_location
        return fallback


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
    return optimize_plans(req, farm)
