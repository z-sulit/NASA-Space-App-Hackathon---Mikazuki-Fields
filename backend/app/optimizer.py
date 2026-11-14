from __future__ import annotations

from itertools import product
from typing import Literal

import numpy as np

from backend.app.schemas import (
    FarmContext,
    PlanCard,
    PlanKPIs,
    PlanRequest,
    PlanResponse,
    ScenarioPlans,
    SeasonStep,
)
from backend.app.simulator import (
    CROP_ARRAYS,
    DRY_MONTHS,
    WET_MONTHS,
    BatchSimResult,
    simulate_batch_vectorized,
    simulate_single_detailed,
)

# Precompute all 8^6 = 262,144 crop sequences once at module load
ALL_SEQS: np.ndarray = np.array(list(product(range(8), repeat=6)), dtype=np.int8)
ALL_FAMS: np.ndarray = CROP_ARRAYS.family_id[ALL_SEQS]
THREE_SAME_FAM_ROW: np.ndarray = np.any(
    (ALL_FAMS[:, :-2] == ALL_FAMS[:, 1:-1]) & (ALL_FAMS[:, 1:-1] == ALL_FAMS[:, 2:]),
    axis=1,
)
NO_HIGH_WATER_MASK: np.ndarray = ~np.any(CROP_ARRAYS.high_water[ALL_SEQS], axis=1)
NO_PADDY_MASK: np.ndarray = ~np.any(CROP_ARRAYS.is_paddy[ALL_SEQS], axis=1)
FORAGE_COUNT: np.ndarray = np.sum(CROP_ARRAYS.is_forage[ALL_SEQS], axis=1)


def _minmax_norm(arr: np.ndarray, mask: np.ndarray, invert: bool = False) -> np.ndarray:
    """Min-max normalize arr to [0, 100] using bounds from the feasible mask."""
    vals = arr[mask]
    lo = float(np.min(vals))
    hi = float(np.max(vals))
    out = np.zeros_like(arr, dtype=np.float64)
    if hi - lo < 1e-9:
        out[mask] = 100.0
        return out
    scaled = (arr - lo) / (hi - lo) * 100.0
    if invert:
        scaled = 100.0 - scaled
    return np.clip(scaled, 0.0, 100.0)


def _build_feasibility_mask(
    sim: BatchSimResult,
    farm: FarmContext,
    req: PlanRequest,
) -> np.ndarray:
    ca = CROP_ARRAYS
    mask = np.ones(ALL_SEQS.shape[0], dtype=bool)

    if req.irrigation == "rainfed":
        mask &= ~sim.paddy_rainfed_infeasible

    if farm.terrain.slope_pct > 8.0:
        mask &= NO_PADDY_MASK

    if req.goal == "forage":
        mask &= FORAGE_COUNT >= 2

    if req.overrides.flooded_months:
        flooded = set(req.overrides.flooded_months)
        wet_flooded = any(m in WET_MONTHS for m in flooded)
        dry_flooded = any(m in DRY_MONTHS for m in flooded)
        for t in range(6):
            is_wet = t % 2 == 0
            if (is_wet and wet_flooded) or ((not is_wet) and dry_flooded):
                mask &= ca.flood_tolerant[ALL_SEQS[:, t]]

    if not np.any(mask):
        mask = np.ones(ALL_SEQS.shape[0], dtype=bool)
        if req.goal == "forage":
            mask &= FORAGE_COUNT >= 2
    return mask


def _compute_subscores(
    sim: BatchSimResult,
    mask: np.ndarray,
    irrigation: Literal["rainfed", "irrigated"],
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    water_metric = sim.total_pumped if irrigation == "irrigated" else sim.total_water_deficit
    w_score = _minmax_norm(water_metric, mask, invert=True)
    s_score = (
        0.5 * sim.final_soil_n
        + 0.3 * (100.0 - sim.mean_erosion)
        + 0.2 * (100.0 - 100.0 * sim.mean_pest)
    )
    econ_raw = 0.7 * sim.total_profit + 0.3 * sim.worst_profit
    e_score = _minmax_norm(econ_raw, mask, invert=False)
    return w_score, s_score, e_score


def _why_bullets_for_plan(
    plan_id: Literal["plan_a", "plan_b", "plan_c"],
    kpis: PlanKPIs,
    plan_a_kpis: PlanKPIs,
    seasons: list[SeasonStep],
    el_nino_delta_pct: float,
) -> list[str]:
    legume_count = sum(1 for s in seasons if s.family == "Fabaceae")
    urea_total = sum(s.urea_cost_php for s in seasons)
    if plan_id == "plan_a":
        return [
            f"Repeats {seasons[0].crop_name} for all 6 seasons, ending with Soil N at {kpis.final_soil_n:.0f} kg/ha ({kpis.soil_n_delta:+.1f}).",
            f"Requires PHP {urea_total:,.0f} in extra urea top-up to offset nitrogen depletion.",
            f"Zero botanical family breaks: pest pressure compounds across seasons ({el_nino_delta_pct:+.1f}% profit change under El Niño).",
        ]

    profit_diff = kpis.total_profit_php - plan_a_kpis.total_profit_php
    bullets = [
        f"Breaks pest cycles {kpis.pest_break_count} times across 3 years using {legume_count} nitrogen-fixing legume season(s).",
        f"Ends with Soil N at {kpis.final_soil_n:.0f} kg/ha (vs {plan_a_kpis.final_soil_n:.0f} in Plan A) and urea cost PHP {urea_total:,.0f}.",
    ]
    if plan_id == "plan_b":
        bullets.append(
            f"Net 3-year profit is PHP {kpis.total_profit_php:,.0f} ({profit_diff:+,.0f} vs Status Quo) with {el_nino_delta_pct:+.1f}% El Niño shift."
        )
    else:
        bullets.append(
            f"Excludes high-water crops to protect against drought: El Niño profit change is {el_nino_delta_pct:+.1f}% (vs {plan_a_kpis.profit_elnino_delta_pct:+.1f}% in Plan A)."
        )
    return bullets


def _ground_truth_summary(req: PlanRequest) -> tuple[list[str], bool]:
    applied: list[str] = []
    ov = req.overrides
    if ov.soil_n_level is not None:
        applied.append(f"Soil N set to {ov.soil_n_level}")
    if ov.soil_ph is not None:
        applied.append(f"Soil pH {ov.soil_ph:.1f}")
    if ov.last_crop_family:
        applied.append(f"Prior family: {ov.last_crop_family}")
    if ov.last_outcome_pests:
        applied.append("Elevated starting pest pressure")
    if ov.flooded_months:
        applied.append(f"Flooded months excluded: {ov.flooded_months}")
    if ov.clear_bare_months:
        applied.append(f"Cleared bare-soil flags: {ov.clear_bare_months}")
    liming = ov.soil_ph is not None and ov.soil_ph < 5.5
    return applied, liming


def optimize_plans(req: PlanRequest, farm: FarmContext) -> PlanResponse:
    """Run vectorized optimization across all 262,144 rotations for Normal and El Nino scenarios."""
    ca = CROP_ARRAYS

    sim_norm = simulate_batch_vectorized(ALL_SEQS, farm, req, "normal")
    sim_eln = simulate_batch_vectorized(ALL_SEQS, farm, req, "elnino")

    mask_norm = _build_feasibility_mask(sim_norm, farm, req)
    mask_eln = _build_feasibility_mask(sim_eln, farm, req)
    mask_both = mask_norm & mask_eln
    if not np.any(mask_both):
        mask_both = mask_norm

    w_norm, s_norm, e_norm = _compute_subscores(sim_norm, mask_norm, req.irrigation)
    w_eln, s_eln, e_eln = _compute_subscores(sim_eln, mask_eln, req.irrigation)

    # Plan A: Status Quo
    base_idx = ca.id_to_idx.get(req.baseline_crop, 0)
    seq_a = np.full(6, base_idx, dtype=np.int8)
    idx_a = sum(base_idx * (8 ** (5 - k)) for k in range(6))

    # Plan B: Balanced Optimal
    w_sum = req.sliders.water + req.sliders.soil + req.sliders.economy
    if w_sum <= 1e-6:
        ww, ws, we = 1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0
    else:
        ww = req.sliders.water / w_sum
        ws = req.sliders.soil / w_sum
        we = req.sliders.economy / w_sum

    score_b = ww * w_norm + ws * s_norm + we * e_norm
    mask_b = mask_norm & (~THREE_SAME_FAM_ROW)
    if not np.any(mask_b):
        mask_b = mask_norm
    idx_b = int(np.argmax(np.where(mask_b, score_b, -1e9)))
    seq_b = ALL_SEQS[idx_b]

    # Plan C: Drought-Safe (no high-water crops, minimax across Normal & El Nino, >=2 seasons diff from B)
    score_c_norm = 0.60 * w_norm + 0.25 * s_norm + 0.15 * e_norm
    score_c_eln = 0.60 * w_eln + 0.25 * s_eln + 0.15 * e_eln
    worst_case_c = np.minimum(score_c_norm, score_c_eln)

    diff_from_b = np.sum(ALL_SEQS != seq_b, axis=1) >= 2
    mask_c = mask_both & NO_HIGH_WATER_MASK & (~THREE_SAME_FAM_ROW) & diff_from_b
    if not np.any(mask_c):
        mask_c = mask_both & NO_HIGH_WATER_MASK & diff_from_b
    if not np.any(mask_c):
        mask_c = mask_both & diff_from_b
    idx_c = int(np.argmax(np.where(mask_c, worst_case_c, -1e9)))
    seq_c = ALL_SEQS[idx_c]

    def _eval_seq(seq: np.ndarray, idx_in_all: int, scenario: Literal["normal", "elnino"]):
        seasons, kpis = simulate_single_detailed(seq, farm, req, scenario)
        if scenario == "normal":
            ws_v, ss_v, es_v = float(w_norm[idx_in_all]), float(s_norm[idx_in_all]), float(e_norm[idx_in_all])
        else:
            ws_v, ss_v, es_v = float(w_eln[idx_in_all]), float(s_eln[idx_in_all]), float(e_eln[idx_in_all])
        kpis.water_score = round(ws_v, 1)
        kpis.soil_score = round(ss_v, 1)
        kpis.economy_score = round(es_v, 1)
        return seasons, kpis

    a_norm_s, a_norm_k = _eval_seq(seq_a, idx_a, "normal")
    a_eln_s, a_eln_k = _eval_seq(seq_a, idx_a, "elnino")
    b_norm_s, b_norm_k = _eval_seq(seq_b, idx_b, "normal")
    b_eln_s, b_eln_k = _eval_seq(seq_b, idx_b, "elnino")
    c_norm_s, c_norm_k = _eval_seq(seq_c, idx_c, "normal")
    c_eln_s, c_eln_k = _eval_seq(seq_c, idx_c, "elnino")

    def _delta_pct(norm_p: float, eln_p: float) -> float:
        denom = abs(norm_p) if abs(norm_p) > 1.0 else 1.0
        return round((eln_p - norm_p) / denom * 100.0, 1)

    for nk, ek in ((a_norm_k, a_eln_k), (b_norm_k, b_eln_k), (c_norm_k, c_eln_k)):
        d = _delta_pct(nk.total_profit_php, ek.total_profit_php)
        nk.profit_elnino_delta_pct = d
        ek.profit_elnino_delta_pct = d

    gt_applied, liming = _ground_truth_summary(req)

    return PlanResponse(
        ground_truth_applied=gt_applied,
        liming_advisory=liming,
        scenarios={
            "normal": ScenarioPlans(
                plan_a=PlanCard(
                    id="plan_a",
                    title="Plan A: Status Quo",
                    subtitle="Continuous Monoculture",
                    kpis=a_norm_k,
                    seasons=a_norm_s,
                    why_bullets=_why_bullets_for_plan("plan_a", a_norm_k, a_norm_k, a_norm_s, a_norm_k.profit_elnino_delta_pct),
                ),
                plan_b=PlanCard(
                    id="plan_b",
                    title="Plan B: Balanced Optimal",
                    subtitle="Recommended Route",
                    kpis=b_norm_k,
                    seasons=b_norm_s,
                    why_bullets=_why_bullets_for_plan("plan_b", b_norm_k, a_norm_k, b_norm_s, b_norm_k.profit_elnino_delta_pct),
                ),
                plan_c=PlanCard(
                    id="plan_c",
                    title="Plan C: Drought-Safe",
                    subtitle="Max Water & Soil Protection",
                    kpis=c_norm_k,
                    seasons=c_norm_s,
                    why_bullets=_why_bullets_for_plan("plan_c", c_norm_k, a_norm_k, c_norm_s, c_norm_k.profit_elnino_delta_pct),
                ),
            ),
            "elnino": ScenarioPlans(
                plan_a=PlanCard(
                    id="plan_a",
                    title="Plan A: Status Quo",
                    subtitle="Continuous Monoculture (El Niño)",
                    kpis=a_eln_k,
                    seasons=a_eln_s,
                    why_bullets=_why_bullets_for_plan("plan_a", a_eln_k, a_eln_k, a_eln_s, a_eln_k.profit_elnino_delta_pct),
                ),
                plan_b=PlanCard(
                    id="plan_b",
                    title="Plan B: Balanced Optimal",
                    subtitle="Recommended Route (El Niño)",
                    kpis=b_eln_k,
                    seasons=b_eln_s,
                    why_bullets=_why_bullets_for_plan("plan_b", b_eln_k, a_eln_k, b_eln_s, b_eln_k.profit_elnino_delta_pct),
                ),
                plan_c=PlanCard(
                    id="plan_c",
                    title="Plan C: Drought-Safe",
                    subtitle="Max Water & Soil Protection (El Niño)",
                    kpis=c_eln_k,
                    seasons=c_eln_s,
                    why_bullets=_why_bullets_for_plan("plan_c", c_eln_k, a_eln_k, c_eln_s, c_eln_k.profit_elnino_delta_pct),
                ),
            ),
        },
    )
