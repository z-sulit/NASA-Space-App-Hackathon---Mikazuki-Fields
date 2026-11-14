"""Fetch and process 2015-2024 NASA POWER monthly climate data for preset farms."""

from __future__ import annotations

import calendar
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import requests

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.app.schemas import ClimateBundle  # noqa: E402
from presets_config import PRESETS  # noqa: E402

POWER_ENDPOINT = "https://power.larc.nasa.gov/api/temporal/monthly/point"
POWER_PARAMS = ("T2M", "T2M_MAX", "PRECTOTCORR", "GWETROOT", "ALLSKY_SFC_SW_DWN")
START_YEAR = 2015
END_YEAR = 2024
WET_MONTHS = [6, 7, 8, 9, 10, 11]
DRY_MONTHS = [12, 1, 2, 3, 4, 5]
FILL_VALUE = -999.0
OUTPUT_DIR = Path(__file__).resolve().parent / "presets"


def fetch_power_raw(lat: float, lon: float) -> dict[str, Any]:
    """Query NASA POWER monthly agroclimatology API for 2015-2024."""
    params = {
        "parameters": ",".join(POWER_PARAMS),
        "community": "AG",
        "latitude": lat,
        "longitude": lon,
        "start": START_YEAR,
        "end": END_YEAR,
        "format": "JSON",
    }
    response = requests.get(POWER_ENDPOINT, params=params, timeout=60)
    response.raise_for_status()
    return response.json()


def compute_hargreaves_et0(t2m_c: float, allsky_mj: float) -> float:
    """Compute reference evapotranspiration (mm/day) using Hargreaves radiation form."""
    return round(0.0135 * (t2m_c + 17.8) * 0.408 * allsky_mj, 2)


def clean_power_monthly(raw_json: dict[str, Any]) -> pd.DataFrame:
    """Parse, validate, unit-convert, and impute NASA POWER monthly series."""
    param_data: dict[str, dict[str, float]] = raw_json["properties"]["parameter"]
    param_meta: dict[str, dict[str, Any]] = raw_json.get("parameters", {})

    allsky_units = str(param_meta.get("ALLSKY_SFC_SW_DWN", {}).get("units", ""))
    convert_kwh_to_mj = "kw-hr" in allsky_units.lower() or "kwh" in allsky_units.lower()
    if convert_kwh_to_mj:
        print(f"  [unit] Converting ALLSKY_SFC_SW_DWN from '{allsky_units}' to MJ/m^2/day (* 3.6)")

    rows: list[dict[str, Any]] = []
    seen_ym: set[tuple[int, int]] = set()

    reference_keys = sorted(param_data[POWER_PARAMS[0]].keys())
    for key in reference_keys:
        year = int(key[:4])
        month = int(key[4:6])
        if month == 13:
            continue
        if not (1 <= month <= 12):
            raise ValueError(f"Unexpected month {month} in key {key}")
        ym = (year, month)
        assert ym not in seen_ym, f"Duplicate (year, month) record found: {ym}"
        seen_ym.add(ym)

        row: dict[str, Any] = {"year": year, "month": month}
        for param in POWER_PARAMS:
            val = float(param_data[param].get(key, FILL_VALUE))
            if param == "ALLSKY_SFC_SW_DWN" and convert_kwh_to_mj and val != FILL_VALUE:
                val *= 3.6
            row[param] = np.nan if val == FILL_VALUE else val
        rows.append(row)

    df = pd.DataFrame(rows).sort_values(["year", "month"]).reset_index(drop=True)
    assert not df.duplicated(subset=["year", "month"]).any(), "Duplicate (year, month) rows detected"

    for param in POWER_PARAMS:
        missing_count = int(df[param].isna().sum())
        if missing_count > 0:
            print(f"  [impute] {param}: replacing {missing_count} fill values with calendar-month median")
            month_medians = df.groupby("month")[param].transform("median")
            df[param] = df[param].fillna(month_medians)

        assert not df[param].isna().any(), f"NaN remains in {param} after imputation"
        assert not (df[param] == FILL_VALUE).any(), f"Fill value remains in {param} after imputation"

    days_in_month = [calendar.monthrange(int(y), int(m))[1] for y, m in zip(df["year"], df["month"])]
    df["rain_mm_month"] = df["PRECTOTCORR"] * pd.Series(days_in_month, index=df.index, dtype=float)
    return df


def build_season_climate(
    monthly_normals: pd.DataFrame,
    months: list[int],
    el_nino: bool = False,
) -> dict[str, Any]:
    """Aggregate 6-month normal or El Nino SeasonClimate dictionary."""
    subset = monthly_normals[monthly_normals["month"].isin(months)].copy()
    assert len(subset) == 6, f"Expected 6 months, got {len(subset)}"

    rain_series = subset["rain_mm_month"] * (0.75 if el_nino else 1.0)
    t2m_series = subset["T2M"] + (1.5 if el_nino else 0.0)
    tmax_series = subset["T2M_MAX"] + (1.5 if el_nino else 0.0)
    gwet_series = (subset["GWETROOT"] * (0.85 if el_nino else 1.0)).clip(0.0, 1.0)
    allsky_series = subset["ALLSKY_SFC_SW_DWN"]

    t2m_c = round(float(t2m_series.mean()), 2)
    tmax_c = round(float(tmax_series.mean()), 2)
    gwetroot = round(float(gwet_series.mean()), 3)
    allsky_mj = round(float(allsky_series.mean()), 2)
    et0_mm_day = compute_hargreaves_et0(t2m_c, allsky_mj)

    heavy_months = sorted(
        int(m) for m, r in zip(subset["month"], rain_series) if float(r) > 200.0
    )

    return {
        "rain_mm": round(float(rain_series.sum()), 1),
        "t2m_c": t2m_c,
        "tmax_c": tmax_c,
        "gwetroot": gwetroot,
        "allsky_mj": allsky_mj,
        "et0_mm_day": et0_mm_day,
        "heavy_rain_months": heavy_months,
    }


def compute_historical_el_nino_stats(
    df: pd.DataFrame,
    normal_dry: dict[str, Any],
) -> dict[str, dict[str, float]]:
    """Compare 2015-16 and 2023-24 El Nino dry seasons against 10-year dry normal."""
    windows = {
        "2015_2016": [(2015, 12), (2016, 1), (2016, 2), (2016, 3), (2016, 4), (2016, 5)],
        "2023_2024": [(2023, 12), (2024, 1), (2024, 2), (2024, 3), (2024, 4), (2024, 5)],
    }

    indexed = df.set_index(["year", "month"])
    stats: dict[str, dict[str, float]] = {}

    for label, ym_list in windows.items():
        dry_df = indexed.loc[ym_list]
        rain_total = float(dry_df["rain_mm_month"].sum())
        tmax_mean = float(dry_df["T2M_MAX"].mean())
        gwet_mean = float(dry_df["GWETROOT"].mean())
        allsky_mean = float(dry_df["ALLSKY_SFC_SW_DWN"].mean())

        rain_change_pct = ((rain_total - normal_dry["rain_mm"]) / normal_dry["rain_mm"]) * 100.0
        gwet_change_pct = ((gwet_mean - normal_dry["gwetroot"]) / normal_dry["gwetroot"]) * 100.0
        tmax_delta_c = tmax_mean - normal_dry["tmax_c"]
        allsky_change_pct = ((allsky_mean - normal_dry["allsky_mj"]) / normal_dry["allsky_mj"]) * 100.0

        stats[label] = {
            "dry_rain_mm": round(rain_total, 1),
            "normal_dry_rain_mm": normal_dry["rain_mm"],
            "rain_change_pct": round(rain_change_pct, 1),
            "dry_tmax_c": round(tmax_mean, 2),
            "tmax_delta_c": round(tmax_delta_c, 2),
            "dry_gwetroot": round(gwet_mean, 3),
            "gwetroot_change_pct": round(gwet_change_pct, 1),
            "dry_allsky_mj": round(allsky_mean, 2),
            "allsky_change_pct": round(allsky_change_pct, 1),
        }

    return stats


def process_preset(preset_id: str, meta: dict[str, Any]) -> dict[str, Any]:
    """Fetch, process, validate, and save NASA POWER climate data for one preset."""
    print(f"\n=== Fetching NASA POWER for {preset_id} ({meta['lat']}, {meta['lon']}) ===")
    raw = fetch_power_raw(float(meta["lat"]), float(meta["lon"]))
    df = clean_power_monthly(raw)

    monthly_normals = (
        df.groupby("month", as_index=False)[
            ["rain_mm_month", "T2M", "T2M_MAX", "GWETROOT", "ALLSKY_SFC_SW_DWN"]
        ]
        .mean()
        .sort_values("month")
    )

    climate = {
        "normal": {
            "wet": build_season_climate(monthly_normals, WET_MONTHS, el_nino=False),
            "dry": build_season_climate(monthly_normals, DRY_MONTHS, el_nino=False),
        },
        "elnino": {
            "wet": build_season_climate(monthly_normals, WET_MONTHS, el_nino=True),
            "dry": build_season_climate(monthly_normals, DRY_MONTHS, el_nino=True),
        },
    }

    ClimateBundle.model_validate(climate)

    el_nino_stats = compute_historical_el_nino_stats(df, climate["normal"]["dry"])
    for window, wstats in el_nino_stats.items():
        print(
            f"  [El Nino {window}] Dry Rain: {wstats['dry_rain_mm']} mm "
            f"({wstats['rain_change_pct']:+.1f}% vs 10yr normal {wstats['normal_dry_rain_mm']} mm) | "
            f"T2M_MAX: {wstats['dry_tmax_c']} C ({wstats['tmax_delta_c']:+.2f} C) | "
            f"GWETROOT: {wstats['dry_gwetroot']} ({wstats['gwetroot_change_pct']:+.1f}%)"
        )

    payload = {
        "preset_id": preset_id,
        "location": {
            "preset_id": preset_id,
            "name": meta["name"],
            "lat": meta["lat"],
            "lon": meta["lon"],
            "is_custom_pin": False,
        },
        "baseline_crop": meta["baseline_crop"],
        "typical_terrain": meta["typical_terrain"],
        "climate": climate,
        "historical_el_nino_validation": el_nino_stats,
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / f"{preset_id}_power.json"
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"  [saved] {out_path}")
    return payload


def main() -> None:
    """Process all preset farm locations."""
    for preset_id, meta in PRESETS.items():
        process_preset(preset_id, meta)


if __name__ == "__main__":
    main()
