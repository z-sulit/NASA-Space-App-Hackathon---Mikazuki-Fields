"""Fetch and process 2015-2024 NASA POWER monthly climate data for preset farms."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.app.power_client import (  # noqa: E402
    build_climate_bundle_from_df,
    clean_power_monthly,
    fetch_power_raw,
)
from presets_config import PRESETS  # noqa: E402

OUTPUT_DIR = Path(__file__).resolve().parent / "presets"


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
    raw = fetch_power_raw(float(meta["lat"]), float(meta["lon"]), timeout_s=60.0)
    df = clean_power_monthly(raw)
    climate_bundle = build_climate_bundle_from_df(df)
    climate = climate_bundle.model_dump(mode="json")

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
