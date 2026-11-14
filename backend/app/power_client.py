"""Shared NASA POWER ingestion, cleaning, seasonal aggregation, and banner metric helpers."""

from __future__ import annotations

import calendar
import logging
from datetime import date
from typing import Any

import numpy as np
import pandas as pd
import requests

from backend.app.schemas import (
    BannerMetric,
    ClimateBundle,
    NDVIProfile,
    ScenarioClimate,
    SeasonClimate,
    TerrainInfo,
)

logger = logging.getLogger(__name__)

POWER_ENDPOINT = "https://power.larc.nasa.gov/api/temporal/monthly/point"
POWER_PARAMS = ("T2M", "T2M_MAX", "PRECTOTCORR", "GWETROOT", "ALLSKY_SFC_SW_DWN")
START_YEAR = 2015
END_YEAR = 2024
WET_MONTHS = [6, 7, 8, 9, 10, 11]
DRY_MONTHS = [12, 1, 2, 3, 4, 5]
FILL_VALUE = -999.0

STEEP_SLOPE_PCT = 8.0
ROLLING_SLOPE_PCT = 3.0

TOOLTIPS = {
    "soil_thirst": "Water left where roots drink, top ~1 m. 0 is bone dry, 1 is soaked.",
    "daily_water_use": "Water that sun and heat pull from soil and leaves. 5 mm a day is 50,000 litres per hectare.",
    "seasonal_rain": "Average rain for this season from 10 years of NASA records (2015–2024).",
    "erosion_slope": "How steep your field is. Steep + bare + heavy rain washes topsoil away.",
    "green_cover": "How green your land looks from space. Below 0.3 is mostly bare soil.",
}


def fetch_power_raw(lat: float, lon: float, timeout_s: float = 60.0) -> dict[str, Any]:
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
    response = requests.get(POWER_ENDPOINT, params=params, timeout=timeout_s)
    response.raise_for_status()
    return response.json()


def compute_hargreaves_et0(t2m_c: float, allsky_mj: float) -> float:
    """Compute reference evapotranspiration (mm/day) using Hargreaves radiation form."""
    return round(0.0135 * (t2m_c + 17.8) * 0.408 * allsky_mj, 2)


def clean_power_monthly(raw_json: dict[str, Any]) -> pd.DataFrame:
    """Parse, validate, unit-convert, and impute NASA POWER monthly series."""
    try:
        param_data: dict[str, dict[str, float]] = raw_json["properties"]["parameter"]
    except (KeyError, TypeError) as exc:
        raise ValueError("NASA POWER payload missing properties.parameter") from exc

    missing_params = [p for p in POWER_PARAMS if p not in param_data]
    if missing_params:
        raise ValueError(f"NASA POWER payload missing parameters: {missing_params}")

    param_meta: dict[str, dict[str, Any]] = raw_json.get("parameters", {})
    allsky_units = str(param_meta.get("ALLSKY_SFC_SW_DWN", {}).get("units", ""))
    convert_kwh_to_mj = "kw-hr" in allsky_units.lower() or "kwh" in allsky_units.lower()
    if convert_kwh_to_mj:
        logger.info("Converting ALLSKY_SFC_SW_DWN from '%s' to MJ/m^2/day (* 3.6)", allsky_units)

    rows: list[dict[str, Any]] = []
    seen_ym: set[tuple[int, int]] = set()

    reference_keys = sorted(param_data[POWER_PARAMS[0]].keys())
    for key in reference_keys:
        if len(key) < 6:
            raise ValueError(f"Invalid NASA POWER date key: {key!r}")
        year = int(key[:4])
        month = int(key[4:6])
        if month == 13:
            continue
        if not (1 <= month <= 12):
            raise ValueError(f"Unexpected month {month} in key {key}")
        ym = (year, month)
        if ym in seen_ym:
            raise ValueError(f"Duplicate (year, month) record found: {ym}")
        seen_ym.add(ym)

        row: dict[str, Any] = {"year": year, "month": month}
        for param in POWER_PARAMS:
            raw_val = param_data[param].get(key, FILL_VALUE)
            val = FILL_VALUE if raw_val is None else float(raw_val)
            if param == "ALLSKY_SFC_SW_DWN" and convert_kwh_to_mj and val != FILL_VALUE:
                val *= 3.6
            row[param] = np.nan if val == FILL_VALUE else val
        rows.append(row)

    if not rows:
        raise ValueError("NASA POWER monthly series is empty")

    df = pd.DataFrame(rows).sort_values(["year", "month"]).reset_index(drop=True)
    if df.duplicated(subset=["year", "month"]).any():
        raise ValueError("Duplicate (year, month) rows detected")

    for param in POWER_PARAMS:
        missing_count = int(df[param].isna().sum())
        if missing_count > 0:
            logger.info("%s: replacing %d fill values with calendar-month median", param, missing_count)
            month_medians = df.groupby("month")[param].transform("median")
            df[param] = df[param].fillna(month_medians)

        if df[param].isna().any() or (df[param] == FILL_VALUE).any():
            raise ValueError(f"Unrecoverable missing/fill values remain in {param}")

    days_in_month = [calendar.monthrange(int(y), int(m))[1] for y, m in zip(df["year"], df["month"])]
    df["rain_mm_month"] = df["PRECTOTCORR"] * pd.Series(days_in_month, index=df.index, dtype=float)
    return df


def build_season_climate(
    monthly_normals: pd.DataFrame,
    months: list[int],
    el_nino: bool = False,
) -> SeasonClimate:
    """Aggregate 6-month normal or El Nino SeasonClimate model."""
    subset = monthly_normals[monthly_normals["month"].isin(months)].copy()
    if len(subset) != 6:
        raise ValueError(f"Expected 6 months in season, got {len(subset)}")

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

    return SeasonClimate(
        rain_mm=round(float(rain_series.sum()), 1),
        t2m_c=t2m_c,
        tmax_c=tmax_c,
        gwetroot=gwetroot,
        allsky_mj=allsky_mj,
        et0_mm_day=et0_mm_day,
        heavy_rain_months=heavy_months,
    )


def build_climate_bundle_from_df(df: pd.DataFrame) -> ClimateBundle:
    """Compute 10-year monthly normals and return validated normal + El Nino ClimateBundle."""
    monthly_normals = (
        df.groupby("month", as_index=False)[
            ["rain_mm_month", "T2M", "T2M_MAX", "GWETROOT", "ALLSKY_SFC_SW_DWN"]
        ]
        .mean()
        .sort_values("month")
    )
    return ClimateBundle(
        normal=ScenarioClimate(
            wet=build_season_climate(monthly_normals, WET_MONTHS, el_nino=False),
            dry=build_season_climate(monthly_normals, DRY_MONTHS, el_nino=False),
        ),
        elnino=ScenarioClimate(
            wet=build_season_climate(monthly_normals, WET_MONTHS, el_nino=True),
            dry=build_season_climate(monthly_normals, DRY_MONTHS, el_nino=True),
        ),
    )


def fetch_custom_pin_climate(lat: float, lon: float, timeout_s: float = 10.0) -> ClimateBundle:
    """Fetch live NASA POWER 2015-2024 monthly series for a pin and build ClimateBundle."""
    raw = fetch_power_raw(lat, lon, timeout_s=timeout_s)
    df = clean_power_monthly(raw)
    return build_climate_bundle_from_df(df)


def soil_thirst_label(gwetroot: float) -> tuple[str, str]:
    """Map root-zone wetness (0-1) to farmer-facing Soil Thirst label and chip status."""
    if gwetroot > 0.80:
        return "Soaked", "good"
    if gwetroot >= 0.60:
        return "Comfortable", "good"
    if gwetroot >= 0.40:
        return "Thirsty", "warning"
    return "Very Thirsty", "danger"


def build_banner_metrics(
    climate: ClimateBundle,
    terrain: TerrainInfo,
    ndvi: NDVIProfile,
) -> list[BannerMetric]:
    """Build the 5 Top Banner MetricChip models from fused NASA data (normal scenario)."""
    wet = climate.normal.wet
    dry = climate.normal.dry

    thirst_label, thirst_status = soil_thirst_label(dry.gwetroot)

    peak_et0 = max(wet.et0_mm_day, dry.et0_mm_day)
    et0_status = "good" if peak_et0 < 4.5 else ("warning" if peak_et0 < 6.0 else "danger")

    rain_status = "good" if dry.rain_mm >= 600.0 else ("warning" if dry.rain_mm >= 300.0 else "danger")

    slope = terrain.slope_pct
    slope_status = "danger" if slope > STEEP_SLOPE_PCT else ("warning" if slope >= ROLLING_SLOPE_PCT else "good")

    bare = ndvi.historical_bare_months
    bare_names = ", ".join(date(2000, m, 1).strftime("%b") for m in bare)
    green_display = f"NDVI {ndvi.mean_ndvi:.2f}" + (f" · bare in {bare_names}" if bare else " · green year-round")

    return [
        BannerMetric(
            id="soil_thirst",
            scientific_term=f"GWETROOT ({dry.gwetroot:.2f} Dry / {wet.gwetroot:.2f} Wet)",
            farmer_label="Soil Thirst Level",
            value_display=f"{thirst_label} in Dry Season",
            status=thirst_status,  # type: ignore[arg-type]
            source="NASA POWER (MERRA-2)",
            tooltip=TOOLTIPS["soil_thirst"],
        ),
        BannerMetric(
            id="daily_water_use",
            scientific_term=f"ET0 Hargreaves ({dry.et0_mm_day:.2f} Dry / {wet.et0_mm_day:.2f} Wet mm/day)",
            farmer_label="Daily Water Use",
            value_display=f"{peak_et0:.1f} mm/day (~{peak_et0 * 10000:,.0f} L/ha)",
            status=et0_status,  # type: ignore[arg-type]
            source="NASA POWER (T2M + ALLSKY_SFC_SW_DWN)",
            tooltip=TOOLTIPS["daily_water_use"],
        ),
        BannerMetric(
            id="seasonal_rain",
            scientific_term=f"PRECTOTCORR ({wet.rain_mm:.0f} mm Wet / {dry.rain_mm:.0f} mm Dry)",
            farmer_label="Rain You Can Count On",
            value_display=f"{wet.rain_mm:.0f} mm Wet · {dry.rain_mm:.0f} mm Dry",
            status=rain_status,  # type: ignore[arg-type]
            source="NASA POWER (2015–2024)",
            tooltip=TOOLTIPS["seasonal_rain"],
        ),
        BannerMetric(
            id="erosion_slope",
            scientific_term=f"SRTM 30m Slope ({slope:.1f}%)",
            farmer_label="Erosion Slope Risk",
            value_display=f"{slope:.1f}% slope · {terrain.erosion_risk_label}",
            status=slope_status,  # type: ignore[arg-type]
            source="NASA SRTM 30m (OpenTopoData)",
            tooltip=TOOLTIPS["erosion_slope"],
        ),
        BannerMetric(
            id="green_cover",
            scientific_term=f"MODIS MOD13Q1 NDVI (mean {ndvi.mean_ndvi:.2f})",
            farmer_label="Green Cover Score",
            value_display=green_display,
            status="warning" if bare else "good",
            source="NASA MODIS MOD13Q1 (ORNL DAAC, 2015–2024)",
            tooltip=TOOLTIPS["green_cover"],
        ),
    ]
