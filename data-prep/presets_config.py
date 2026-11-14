"""Preset Philippine farm locations for Mikazuki Fields."""

from __future__ import annotations

PRESETS: dict[str, dict[str, object]] = {
    "bukidnon": {
        "preset_id": "bukidnon",
        "name": "Valencia City, Bukidnon",
        "lat": 7.90,
        "lon": 125.09,
        "baseline_crop": "corn",
        "typical_terrain": "Highland volcanic loam, sloping",
    },
    "davao_del_sur": {
        "preset_id": "davao_del_sur",
        "name": "Digos, Davao del Sur",
        "lat": 6.75,
        "lon": 125.36,
        "baseline_crop": "corn",
        "typical_terrain": "Rainfed lowland/foothill clay-loam",
    },
    "isabela": {
        "preset_id": "isabela",
        "name": "Ilagan, Isabela",
        "lat": 17.15,
        "lon": 121.89,
        "baseline_crop": "corn",
        "typical_terrain": "Broad river valley & rolling plains",
    },
}
