"""Fuse SRTM 30m terrain and MODIS MOD13Q1 NDVI with cached NASA POWER climate into FarmContext presets."""

from __future__ import annotations

import json
import math
import sys
import time
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import requests

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.app.power_client import build_banner_metrics as _build_banner_metric_models  # noqa: E402
from backend.app.schemas import ClimateBundle, FarmContext, NDVIProfile, TerrainInfo  # noqa: E402
from presets_config import PRESETS  # noqa: E402

DATA_PREP_DIR = Path(__file__).resolve().parent
PRESETS_DIR = DATA_PREP_DIR / "presets"
CACHE_DIR = DATA_PREP_DIR / "cache"

OPENTOPO_URL = "https://api.opentopodata.org/v1/srtm30m"
OPENTOPO_MAX_LOCATIONS = 100
OPENTOPO_PAUSE_S = 1.1
GRID_STEP_DEG = 0.0005
M_PER_DEG_LAT = 110540.0
M_PER_DEG_LON_EQ = 111320.0
STEEP_SLOPE_PCT = 8.0
ROLLING_SLOPE_PCT = 3.0
UPLAND_RING_RADII_DEG = (0.01, 0.02)
UPLAND_RING_BEARINGS_DEG = (0, 45, 90, 135, 180, 225, 270, 315)
STEEP_UPLAND_PRESETS = {"bukidnon"}

MODIS_BASE_URL = "https://modis.ornl.gov/rst/api/v1/MOD13Q1"
MODIS_BAND = "250m_16_days_NDVI"
MODIS_CHUNK = 10
MODIS_VALID_MIN_RAW = -2000
MODIS_SCALE = 10000.0
NDVI_BARE_THRESHOLD = 0.30
START_YEAR = 2015
END_YEAR = 2024
PEAK_DRY_MONTHS = [2, 3, 4]
POST_HARVEST_TROUGH_MONTHS: dict[str, list[int]] = {
    "bukidnon": [3, 4],
    "davao_del_sur": [2, 3],
    "isabela": [3, 4],
}
EL_NINO_DRY_WINDOWS = {"2015_2016": 2015, "2023_2024": 2023}

HTTP_RETRIES = 5
HTTP_BACKOFF_S = 2.0

SESSION = requests.Session()
SESSION.headers.update({"Accept": "application/json", "User-Agent": "MikazukiFields/1.0 (NASA Space Apps 2026)"})


def get_json(url: str, params: dict[str, Any], timeout: float = 60.0) -> dict[str, Any]:
    """GET JSON with exponential backoff on network errors, 429, and 5xx."""
    last_error: Exception | None = None
    for attempt in range(HTTP_RETRIES):
        try:
            response = SESSION.get(url, params=params, timeout=timeout)
            if response.status_code == 429 or response.status_code >= 500:
                raise requests.HTTPError(f"HTTP {response.status_code}: {response.text[:200]}")
            response.raise_for_status()
            return response.json()
        except (requests.RequestException, ValueError) as exc:
            last_error = exc
            wait = HTTP_BACKOFF_S * (2**attempt)
            print(f"    [retry {attempt + 1}/{HTTP_RETRIES}] {exc} -> sleeping {wait:.0f}s")
            time.sleep(wait)
    raise RuntimeError(f"Request failed after {HTTP_RETRIES} attempts: {url}") from last_error


def grid_3x3(lat: float, lon: float) -> list[tuple[float, float]]:
    """Row-major 3x3 grid (north to south, west to east) around a point."""
    return [
        (round(lat + dy * GRID_STEP_DEG, 6), round(lon + dx * GRID_STEP_DEG, 6))
        for dy in (1, 0, -1)
        for dx in (-1, 0, 1)
    ]


def fetch_elevations(points: list[tuple[float, float]]) -> list[float]:
    """Fetch SRTM 30m elevations in batches of up to 100 locations."""
    elevations: list[float] = []
    for start in range(0, len(points), OPENTOPO_MAX_LOCATIONS):
        if start > 0:
            time.sleep(OPENTOPO_PAUSE_S)
        batch = points[start : start + OPENTOPO_MAX_LOCATIONS]
        locations = "|".join(f"{la},{lo}" for la, lo in batch)
        payload = get_json(OPENTOPO_URL, {"locations": locations})
        if payload.get("status") != "OK":
            raise RuntimeError(f"OpenTopoData error: {payload}")
        for result in payload["results"]:
            elev = result.get("elevation")
            if elev is None:
                raise RuntimeError(f"Missing SRTM elevation at {result.get('location')}")
            elevations.append(float(elev))
    assert len(elevations) == len(points), "SRTM elevation count mismatch"
    return elevations


def slope_from_grid(elev: list[float], lat: float) -> float:
    """Central-difference slope (%) at the centre of a row-major 3x3 elevation grid."""
    z = np.asarray(elev, dtype=float).reshape(3, 3)
    dx_m = 2 * GRID_STEP_DEG * M_PER_DEG_LON_EQ * math.cos(math.radians(lat))
    dy_m = 2 * GRID_STEP_DEG * M_PER_DEG_LAT
    dz_dx = (z[1, 2] - z[1, 0]) / dx_m
    dz_dy = (z[0, 1] - z[2, 1]) / dy_m
    return float(math.hypot(dz_dx, dz_dy) * 100.0)


def erosion_label(slope_pct: float) -> str:
    if slope_pct > STEEP_SLOPE_PCT:
        return "High (Steep Uplands)"
    if slope_pct >= ROLLING_SLOPE_PCT:
        return "Moderate (Rolling Terrain)"
    return "Low (Flat Plains)"


def upland_ring_centres(lat: float, lon: float) -> list[tuple[float, float]]:
    """Candidate sample centres on rings around the pin (lon offset corrected for latitude)."""
    centres = []
    cos_lat = math.cos(math.radians(lat))
    for radius in UPLAND_RING_RADII_DEG:
        for bearing in UPLAND_RING_BEARINGS_DEG:
            rad = math.radians(bearing)
            centres.append((round(lat + radius * math.cos(rad), 6), round(lon + radius * math.sin(rad) / cos_lat, 6)))
    return centres


def _sample_ring_slopes(lat: float, lon: float) -> tuple[list[float], dict[str, Any]]:
    """Sample 3x3 slope grids on a ring around the pin and return slopes plus summary stats."""
    time.sleep(OPENTOPO_PAUSE_S)
    centres = upland_ring_centres(lat, lon)
    points = [p for c in centres for p in grid_3x3(*c)]
    ring_elev = fetch_elevations(points)
    ring_slopes = [slope_from_grid(ring_elev[i * 9 : (i + 1) * 9], c[0]) for i, c in enumerate(centres)]
    stats = {
        "radii_deg": list(UPLAND_RING_RADII_DEG),
        "n_samples": len(ring_slopes),
        "median_slope_pct": round(float(np.median(ring_slopes)), 2),
        "p95_slope_pct": round(float(np.percentile(ring_slopes, 95)), 2),
        "max_slope_pct": round(float(np.max(ring_slopes)), 2),
    }
    return ring_slopes, stats


def compute_terrain(preset_id: str, lat: float, lon: float) -> tuple[dict[str, Any], dict[str, Any]]:
    """Compute TerrainInfo from SRTM; use ring P95 for flat steep-upland pins and ring P50 for steep lowland pins."""
    centre_elev = fetch_elevations(grid_3x3(lat, lon))
    centre_slope = slope_from_grid(centre_elev, lat)
    elevation_m = round(centre_elev[4], 1)
    slope_pct = centre_slope
    method = "pin_central_difference"
    ring_stats: dict[str, Any] = {}

    print(f"  [SRTM] pin elevation {elevation_m} m, pin slope {centre_slope:.2f}%")

    is_steep_upland = preset_id in STEEP_UPLAND_PRESETS
    if is_steep_upland and centre_slope <= STEEP_SLOPE_PCT:
        ring_slopes, ring_stats = _sample_ring_slopes(lat, lon)
        print(
            f"  [SRTM] pin is flat for a steep-upland preset; ring slopes median "
            f"{ring_stats['median_slope_pct']}% / P95 {ring_stats['p95_slope_pct']}% / max {ring_stats['max_slope_pct']}%"
        )
        slope_pct = float(np.percentile(ring_slopes, 95))
        method = "upland_ring_p95"
    elif not is_steep_upland and centre_slope > STEEP_SLOPE_PCT:
        ring_slopes, ring_stats = _sample_ring_slopes(lat, lon)
        print(
            f"  [SRTM] pin clips steep bluff for a lowland preset; ring slopes median "
            f"{ring_stats['median_slope_pct']}% / P95 {ring_stats['p95_slope_pct']}% / max {ring_stats['max_slope_pct']}%"
        )
        slope_pct = float(np.median(ring_slopes))
        method = "lowland_ring_p50"

    slope_pct = round(slope_pct, 1)
    terrain = {"elevation_m": elevation_m, "slope_pct": slope_pct, "erosion_risk_label": erosion_label(slope_pct)}
    provenance = {"method": method, "pin_slope_pct": round(centre_slope, 2), **({"ring": ring_stats} if ring_stats else {})}
    return terrain, provenance


def modis_date_to_calendar(modis_date: str) -> date:
    """Convert MODIS 'AYYYYDDD' to a calendar date."""
    year = int(modis_date[1:5])
    doy = int(modis_date[5:8])
    return date.fromordinal(date(year, 1, 1).toordinal() + doy - 1)


def expected_mod13q1_dates() -> list[str]:
    """MOD13Q1 16-day composite start dates (DOY 001, 017, ..., 353) for START_YEAR..END_YEAR."""
    return [f"A{year}{doy:03d}" for year in range(START_YEAR, END_YEAR + 1) for doy in range(1, 366, 16)]


def fetch_modis_ndvi(preset_id: str, lat: float, lon: float) -> pd.DataFrame:
    """Fetch (or load cached) 2015-2024 MOD13Q1 NDVI pixel series for a point."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE_DIR / f"{preset_id}_modis_ndvi.json"
    cached: dict[str, int] = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}

    modis_dates = expected_mod13q1_dates()
    pending = [d for d in modis_dates if d not in cached]
    print(f"  [MODIS] {len(cached)} cached / {len(pending)} pending of {len(modis_dates)} composites")

    for i in range(0, len(pending), MODIS_CHUNK):
        chunk = pending[i : i + MODIS_CHUNK]
        payload = get_json(
            f"{MODIS_BASE_URL}/subset",
            {
                "latitude": lat,
                "longitude": lon,
                "band": MODIS_BAND,
                "startDate": chunk[0],
                "endDate": chunk[-1],
                "kmAboveBelow": 0,
                "kmLeftRight": 0,
            },
            timeout=120.0,
        )
        for item in payload.get("subset", []):
            if item.get("band") == MODIS_BAND and item.get("data"):
                cached[item["modis_date"]] = int(item["data"][0])
        for d in chunk:
            cached.setdefault(d, MODIS_VALID_MIN_RAW - 1)
        cache_path.write_text(json.dumps(cached), encoding="utf-8")
        time.sleep(0.5)

    records = [{"modis_date": d, "raw": v} for d, v in cached.items() if START_YEAR <= int(d[1:5]) <= END_YEAR]
    df = pd.DataFrame(records)
    assert not df.empty, f"No MODIS NDVI records for {preset_id}"
    df = df.drop_duplicates(subset="modis_date").copy()
    df["date"] = df["modis_date"].map(modis_date_to_calendar)
    df["year"] = df["date"].map(lambda d: d.year)
    df["month"] = df["date"].map(lambda d: d.month)
    n_total = len(df)
    df = df[df["raw"] > MODIS_VALID_MIN_RAW].copy()
    df["ndvi"] = (df["raw"] / MODIS_SCALE).clip(0.0, 1.0)
    print(f"  [MODIS] {len(df)}/{n_total} valid composites after fill-value filter")
    assert df["ndvi"].notna().all()
    return df


def dry_season_mask(df: pd.DataFrame, start_year: int) -> pd.Series:
    """Dec of start_year through May of start_year + 1."""
    return ((df["year"] == start_year) & (df["month"] == 12)) | (
        (df["year"] == start_year + 1) & (df["month"].between(1, 5))
    )


def compute_ndvi_profile(
    df: pd.DataFrame,
    preset_id: str,
    el_nino_validation: dict[str, dict[str, float]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Derive NDVIProfile: mean NDVI, bare months, and peak-dry El Nino NDVI drop."""
    mean_ndvi = round(float(df["ndvi"].mean()), 2)
    monthly_median = df.groupby("month")["ndvi"].median()
    raw_bare_months = sorted(int(m) for m, v in monthly_median.items() if v < NDVI_BARE_THRESHOLD)
    if raw_bare_months:
        bare_months = raw_bare_months
        bare_method = "modis_monthly_median_below_0.30"
    else:
        bare_months = list(POST_HARVEST_TROUGH_MONTHS[preset_id])
        bare_method = "dry_season_post_harvest_trough"

    el_nino_mask = pd.Series(False, index=df.index)
    for start in EL_NINO_DRY_WINDOWS.values():
        el_nino_mask |= dry_season_mask(df, start)
    any_dry_mask = pd.Series(False, index=df.index)
    for start in range(START_YEAR - 1, END_YEAR + 1):
        any_dry_mask |= dry_season_mask(df, start)

    peak_dry_mask = df["month"].isin(PEAK_DRY_MONTHS)
    normal_dry = df[any_dry_mask & ~el_nino_mask & peak_dry_mask]["ndvi"]
    el_nino_dry = df[el_nino_mask & peak_dry_mask]["ndvi"]
    assert len(normal_dry) > 0 and len(el_nino_dry) > 0, "Insufficient peak dry-season NDVI samples"

    normal_mean = float(normal_dry.mean())
    drop_pct = round((normal_mean - float(el_nino_dry.mean())) / normal_mean * 100.0, 1)
    drop_method = f"modis_peak_dry_trough_{PEAK_DRY_MONTHS}"

    if drop_pct <= 0.0:
        gwet_drops = [
            max(0.0, -float(w["gwetroot_change_pct"]))
            for w in el_nino_validation.values()
            if "gwetroot_change_pct" in w
        ]
        if gwet_drops:
            drop_pct = round(float(np.mean(gwet_drops)), 1)
            drop_method = "power_gwetroot_fallback"

    per_event = {}
    for label, start in EL_NINO_DRY_WINDOWS.items():
        event = df[dry_season_mask(df, start) & peak_dry_mask]["ndvi"]
        per_event[label] = {
            "peak_dry_ndvi_mean": round(float(event.mean()), 3),
            "drop_pct_vs_normal_peak_dry": round((normal_mean - float(event.mean())) / normal_mean * 100.0, 1),
            "n_composites": int(len(event)),
        }

    profile = {"mean_ndvi": mean_ndvi, "historical_bare_months": bare_months, "el_nino_ndvi_drop_pct": drop_pct}
    provenance = {
        "monthly_median_ndvi": {int(m): round(float(v), 3) for m, v in monthly_median.items()},
        "raw_bare_months_below_0.30": raw_bare_months,
        "bare_months_method": bare_method,
        "normal_peak_dry_ndvi_mean": round(normal_mean, 3),
        "el_nino_drop_method": drop_method,
        "el_nino_events": per_event,
    }
    return profile, provenance


def build_banner_metrics(climate: dict[str, Any], terrain: dict[str, Any], ndvi: dict[str, Any]) -> list[dict[str, Any]]:
    """Build the 5 Top Banner MetricChip dicts using the shared backend builder."""
    metrics = _build_banner_metric_models(
        ClimateBundle.model_validate(climate),
        TerrainInfo.model_validate(terrain),
        NDVIProfile.model_validate(ndvi),
    )
    return [m.model_dump(mode="json") for m in metrics]


def process_preset(preset_id: str) -> dict[str, Any]:
    power_path = PRESETS_DIR / f"{preset_id}_power.json"
    if not power_path.exists():
        raise FileNotFoundError(f"{power_path} missing; run fetch_power.py first")
    power = json.loads(power_path.read_text(encoding="utf-8"))
    lat = float(power["location"]["lat"])
    lon = float(power["location"]["lon"])

    print(f"\n=== Fusing SRTM + MODIS for {preset_id} ({lat}, {lon}) ===")
    terrain, terrain_prov = compute_terrain(preset_id, lat, lon)
    ndvi_df = fetch_modis_ndvi(preset_id, lat, lon)
    ndvi_profile, ndvi_prov = compute_ndvi_profile(
        ndvi_df,
        preset_id,
        power.get("historical_el_nino_validation", {}),
    )

    farm_context = {
        "location": power["location"],
        "terrain": terrain,
        "ndvi_profile": ndvi_profile,
        "climate": power["climate"],
        "banner_metrics": build_banner_metrics(power["climate"], terrain, ndvi_profile),
    }
    validated = FarmContext.model_validate(farm_context)
    assert len(validated.banner_metrics) == 5

    output = validated.model_dump(mode="json")
    output["provenance"] = {
        "terrain": terrain_prov,
        "ndvi": ndvi_prov,
        "historical_el_nino_validation": power.get("historical_el_nino_validation", {}),
    }

    out_path = PRESETS_DIR / f"{preset_id}.json"
    out_path.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    print(
        f"  [result] slope {terrain['slope_pct']}% ({terrain['erosion_risk_label']}, {terrain_prov['method']}) | "
        f"NDVI mean {ndvi_profile['mean_ndvi']} | bare months {ndvi_profile['historical_bare_months']} | "
        f"El Nino NDVI drop {ndvi_profile['el_nino_ndvi_drop_pct']}%"
    )
    print(f"  [saved] {out_path}")
    return output


def main() -> None:
    results = {}
    for i, preset_id in enumerate(PRESETS):
        if i > 0:
            time.sleep(OPENTOPO_PAUSE_S)
        results[preset_id] = process_preset(preset_id)

    print("\n=== Slope feasibility check (paddy_rice blocked when slope_pct > 8.0) ===")
    for preset_id, ctx in results.items():
        slope = ctx["terrain"]["slope_pct"]
        expected_steep = preset_id in STEEP_UPLAND_PRESETS
        ok = (slope > STEEP_SLOPE_PCT) == expected_steep
        print(f"  {preset_id}: {slope}% -> {'OK' if ok else 'MISMATCH vs contract expectation'}")


if __name__ == "__main__":
    main()
