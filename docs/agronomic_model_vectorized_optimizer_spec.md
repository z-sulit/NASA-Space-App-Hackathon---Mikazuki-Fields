# Agronomic Simulation Engine & Vectorized Optimizer (`M` Lane)
**Owner:** Person 2 (Agronomic Modeler + Vectorized Optimizer)

This document specifies the 8-crop library, the 6-step seasonal simulation physics, the vectorized NumPy search across all $8^6 = 262,144$ rotations, and the mandatory `pytest` sanity suite.

---

## 1. Starter Crop Library (`backend/app/crop_library.json`)

Calibrated using FAO-56 ($K_c$), FAO-33 ($K_y$), and Philippine Statistics Authority (PSA OpenSTAT) baseline yields and farmgate prices per hectare.

```json
[
  {
    "id": "corn",
    "name": "Yellow/White Corn",
    "family": "Poaceae",
    "days": 110,
    "kc": 0.85,
    "ky": 1.25,
    "heat_limit_c": 35.0,
    "soil_n_delta": -18,
    "cover_c": 0.45,
    "fits_goal": ["cash", "forage"],
    "base_yield_t_ha": 4.8,
    "price_php_per_t": 17500,
    "base_cost_php": 36000,
    "flood_tolerant": false,
    "high_water": false
  },
  {
    "id": "paddy_rice",
    "name": "Paddy Rice",
    "family": "Poaceae",
    "days": 120,
    "kc": 1.20,
    "ky": 1.20,
    "heat_limit_c": 35.0,
    "soil_n_delta": -14,
    "cover_c": 0.10,
    "fits_goal": ["cash"],
    "base_yield_t_ha": 4.5,
    "price_php_per_t": 20000,
    "base_cost_php": 42000,
    "flood_tolerant": true,
    "high_water": true
  },
  {
    "id": "upland_rice",
    "name": "Upland Rice",
    "family": "Poaceae",
    "days": 110,
    "kc": 0.95,
    "ky": 1.15,
    "heat_limit_c": 35.0,
    "soil_n_delta": -12,
    "cover_c": 0.40,
    "fits_goal": ["cash"],
    "base_yield_t_ha": 3.0,
    "price_php_per_t": 21000,
    "base_cost_php": 28000,
    "flood_tolerant": false,
    "high_water": true
  },
  {
    "id": "sorghum",
    "name": "Sorghum",
    "family": "Poaceae",
    "days": 100,
    "kc": 0.75,
    "ky": 0.90,
    "heat_limit_c": 40.0,
    "soil_n_delta": -12,
    "cover_c": 0.45,
    "fits_goal": ["forage", "cash"],
    "base_yield_t_ha": 4.2,
    "price_php_per_t": 15500,
    "base_cost_php": 24000,
    "flood_tolerant": false,
    "high_water": false
  },
  {
    "id": "mungbean",
    "name": "Mungbean (Monggo)",
    "family": "Fabaceae",
    "days": 65,
    "kc": 0.75,
    "ky": 1.15,
    "heat_limit_c": 40.0,
    "soil_n_delta": 12,
    "cover_c": 0.35,
    "fits_goal": ["cash"],
    "base_yield_t_ha": 1.2,
    "price_php_per_t": 62000,
    "base_cost_php": 22000,
    "flood_tolerant": false,
    "high_water": false
  },
  {
    "id": "peanut",
    "name": "Peanut",
    "family": "Fabaceae",
    "days": 100,
    "kc": 0.80,
    "ky": 0.70,
    "heat_limit_c": 38.0,
    "soil_n_delta": 10,
    "cover_c": 0.30,
    "fits_goal": ["cash"],
    "base_yield_t_ha": 1.8,
    "price_php_per_t": 48000,
    "base_cost_php": 30000,
    "flood_tolerant": false,
    "high_water": false
  },
  {
    "id": "cowpea",
    "name": "Cowpea (Paayap)",
    "family": "Fabaceae",
    "days": 75,
    "kc": 0.75,
    "ky": 1.10,
    "heat_limit_c": 40.0,
    "soil_n_delta": 12,
    "cover_c": 0.30,
    "fits_goal": ["forage", "cash"],
    "base_yield_t_ha": 1.5,
    "price_php_per_t": 45000,
    "base_cost_php": 20000,
    "flood_tolerant": false,
    "high_water": false
  },
  {
    "id": "sweet_potato",
    "name": "Sweet Potato (Camote)",
    "family": "Convolvulaceae",
    "days": 100,
    "kc": 0.80,
    "ky": 0.85,
    "heat_limit_c": 38.0,
    "soil_n_delta": -6,
    "cover_c": 0.20,
    "fits_goal": ["cash"],
    "base_yield_t_ha": 11.0,
    "price_php_per_t": 8500,
    "base_cost_php": 32000,
    "flood_tolerant": false,
    "high_water": false
  }
]
```

---

## 2. Season-Step Equations (Executed per Season $t \in \{0..5\}$)

Initial state at $t=0$:
* `N_0` $= 65.0$ (or overridden by soil test: Low $= 35$, Medium $= 65$, High $= 85$).
* `store_0` $= \text{GWETROOT}_{t=0} \times \text{WHC}(\text{soil\_texture})$, where $\text{WHC} = 60\text{ mm}$ (`sandy`), $120\text{ mm}$ (`loam`), $150\text{ mm}$ (`clay`).
* `pest_0` $= 0.15$ (or $0.45$ if override indicates pest issue last season).

For each season $t$:

1. **Water Balance:**
   * $\text{Demand} = K_c \times ET_0 \times \text{days}$ (plus $200\text{ mm}$ ponding requirement if `paddy_rice`).
   * $\text{Supply} = 0.80 \times \text{rain\_mm} + \text{store}_t$.
   * $\text{Gap} = \max(0, \text{Demand} - \text{Supply})$.
   * If `irrigation == "irrigated"`: $\text{Pumped\_mm} = \text{Gap}$, $\text{Pump\_Cost} = \text{Pumped\_mm} \times 35\text{ PHP/mm}$, $\text{Water\_Yield\_Loss} = 0$.
   * If `irrigation == "rainfed"`: $\text{Pumped\_mm} = 0$, $\text{Water\_Yield\_Loss} = \min\left(0.85, K_y \times \frac{\text{Gap}}{\text{Demand}}\right)$.
   * End-of-season soil store carryover:
     $$\text{leftover} = \max(0, \text{Supply} - \text{Demand})$$
     $$\text{store}_{t+1} = 0.5 \times \min(\text{WHC}, \text{leftover}) + 0.5 \times (\text{GWETROOT}_{t+1} \times \text{WHC})$$

2. **Heat Penalty:**
   * $\text{Heat\_Loss} = \min\left(0.70, 0.10 \times \max(0, \text{tmax\_c} - \text{heat\_limit\_c})\right)$.

3. **Soil Nitrogen & Urea Top-Up:**
   * $\text{Same\_Family} = (\text{family}_t == \text{family}_{t-1})$.
   * $\Delta N = \text{soil\_n\_delta} - (3 \text{ if sandy and wet season else } 0) - (3 \text{ if Same\_Family else } 0)$.
   * If `soil_ph < 5.5` and crop is `Fabaceae`: $\Delta N = 0.5 \times \Delta N$ (poor nodulation).
   * If non-legume and $N_t < 60$:
     * Need top-up $\text{Deficit\_N} = 60 - N_t$.
     * $\text{Urea\_Cost} = \text{Deficit\_N} \times 180\text{ PHP}$.
     * $\text{N\_Yield\_Factor} = \min(1.0, 0.70 + 0.30 \times (N_t / 60))$.
   * $N_{t+1} = \text{clip}(N_t + \Delta N, 10, 100)$.

4. **Pest Carryover & Badges:**
   * If $\text{Same\_Family}$: $\text{pest}_t = \min(1.0, \text{pest}_{t-1} + 0.25)$, `pest_broken_badge = False`.
   * If $\text{family}_t \neq \text{family}_{t-1}$: $\text{pest}_t = \text{pest}_{t-1} \times 0.30$, `pest_broken_badge = True` (for $t \ge 1$).
   * $\text{Pest\_Loss} = 0.15 \times \text{pest}_t$.

5. **Bare-Soil Erosion Index (RUSLE-Style, 0–100):**
   * Uncovered fraction of the 180-day season: $f_{\text{bare}} = \frac{180 - \text{days}}{180}$.
   * Effective cover factor: $C_{\text{eff}} = \frac{\text{days}}{180} \times C_{\text{crop}} + f_{\text{bare}} \times 1.0$.
   * Soil erodibility $K_{\text{soil}}$: `sandy` $= 0.6$, `loam` $= 1.0$, `clay` $= 0.8$.
   * $\text{Erosion\_Index}_t = \text{clip}\left(\frac{\text{rain\_mm}}{1200} \times K_{\text{soil}} \times \left(1 + \frac{\text{slope\_pct}}{10}\right) \times C_{\text{eff}} \times 50, 0, 100\right)$.
   * Any uncovered season month with $>200\text{ mm}$ rain emits a `Bare-Soil Erosion Month` flag.

6. **Net Seasonal Profit:**
   * $\text{Effective\_Yield} = \text{base\_yield} \times (1 - \text{Water\_Yield\_Loss}) \times (1 - \text{Heat\_Loss}) \times (1 - \text{Pest\_Loss}) \times \text{N\_Yield\_Factor}$.
   * $\text{Profit}_t = (\text{Effective\_Yield} \times \text{price}) - \text{base\_cost} - \text{Urea\_Cost} - \text{Pump\_Cost}$.

---

## 3. Exhaustive Vectorized Search & 3-Strategy Selection

1. **Generate Candidate Matrix:** `seqs = np.array(list(product(range(8), repeat=6)))` $\rightarrow$ shape `(262144, 6)`.
2. **Apply Hard Feasibility Mask:**
   * Exclude `paddy_rice` in seasons where `rainfed` supply $< 0.80 \times \text{Demand}$.
   * Exclude `paddy_rice` if `slope_pct > 8.0`.
   * If `goal == "forage"`, require $\ge 2$ seasons of forage-compatible crops (`corn`, `sorghum`, `cowpea`).
   * Exclude flood-intolerant crops in seasons overlapping `overrides.flooded_months`.
3. **Normalize Sub-Scores (0 to 100 across feasible set):**
   * $W$ (**Water Score**): Min-max scaled inverse of total 6-season water deficit (rainfed) or pumped water (irrigated).
   * $S$ (**Soil Score**): $0.5 \times N_{\text{final}} + 0.3 \times (100 - \overline{\text{Erosion}}) + 0.2 \times (100 - 100 \times \overline{\text{Pest}})$.
   * $E$ (**Economy Score**): Min-max scaled $0.7 \times \text{Total\_Profit} + 0.3 \times \min_t(\text{Profit}_t)$.
4. **Select the 3 Routes:**
   * **Plan A (Status Quo):** `[baseline_crop] * 6` evaluated through the exact same simulator.
   * **Plan B (Balanced Optimal):** Guardrail mask removes sequences with 3 identical families in a row; pick $\arg\max (w_{\text{water}} W + w_{\text{soil}} S + w_{\text{econ}} E)$.
   * **Plan C (Drought-Safe):** Mask out `high_water` crops (`paddy_rice`, `upland_rice`), apply fixed weights $(0.60 W + 0.25 S + 0.15 E)$, and pick the sequence maximizing the **worst-case score across Normal and El Niño scenarios** (requiring at least 2 seasons difference from Plan B).

---

## 4. Mandatory Sanity Tests (`backend/tests/test_sanity.py`)

Write and pass these 6 tests before Hour 12:
1. `test_monoculture_depletes_nitrogen`: Continuous `corn` $\times 6$ ends with $N_6 < N_0$.
2. `test_plan_b_includes_legume`: Under default slider weights `(33, 33, 33)`, Plan B contains at least one `Fabaceae` crop.
3. `test_no_paddy_rice_in_rainfed_dry_season`: Neither Plan B nor Plan C places `paddy_rice` in a rainfed dry season.
4. `test_elnino_hurts_status_quo_more_than_plan_c`: Profit drop under El Niño (`Normal_Profit - ElNino_Profit`) is strictly larger for Plan A than for Plan C.
5. `test_water_slider_monotonicity`: Increasing `sliders.water` from `10` to `90` never increases Plan B's total water deficit/pumping.
6. `test_vectorized_speed_under_one_second`: Full `POST /api/plans` evaluation completes in $< 1.0\text{s}$ on a standard laptop.