"""Export static offline fallback bundle for frontend/public/fallback_plans.json."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.app.main import app  # noqa: E402
from backend.app.schemas import FarmContext, PlanResponse, PresetSummary  # noqa: E402

OUTPUT_PATH = REPO_ROOT / "frontend" / "public" / "fallback_plans.json"


def export_fallback(output_path: Path = OUTPUT_PATH) -> dict[str, Any]:
    """Call /api/presets, /api/farm, and /api/plans via TestClient and export validated JSON."""
    with TestClient(app) as client:
        presets_resp = client.get("/api/presets")
        presets_resp.raise_for_status()
        presets = [PresetSummary.model_validate(item) for item in presets_resp.json()]

        farms: dict[str, dict[str, Any]] = {}
        plans: dict[str, dict[str, Any]] = {}

        for preset in presets:
            pid = preset.preset_id
            farm_resp = client.get("/api/farm", params={"preset_id": pid})
            farm_resp.raise_for_status()
            farm_ctx = FarmContext.model_validate(farm_resp.json())
            farms[pid] = farm_ctx.model_dump(mode="json")

            plan_req = {
                "preset_id": pid,
                "lat": preset.lat,
                "lon": preset.lon,
                "baseline_crop": "corn",
                "soil_texture": "loam",
                "irrigation": "rainfed",
                "goal": "cash",
                "sliders": {"water": 40, "soil": 35, "economy": 25},
            }
            plan_resp = client.post("/api/plans", json=plan_req)
            plan_resp.raise_for_status()
            plan_obj = PlanResponse.model_validate(plan_resp.json())
            plans[pid] = plan_obj.model_dump(mode="json")

    bundle = {
        "presets": [p.model_dump(mode="json") for p in presets],
        "farms": farms,
        "plans": plans,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(bundle, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[exported] {output_path} ({len(presets)} presets, {len(farms)} farms, {len(plans)} plans)")
    return bundle


if __name__ == "__main__":
    export_fallback()
