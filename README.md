# Mikazuki Fields (by Team Tekkadan)
**2026 NASA Space Apps Challenge — Field Shift: Adapting Farms with NASA Data**

**Mikazuki Fields** is a farmer-centered decision-support web application that works like a 3-route GPS navigation planner for a farmer's next **6 planting seasons (3 years)**. Powered by fused NASA Earth observation datasets (**NASA POWER**, **SRTM 30m**, **MODIS MOD13Q1 NDVI**, and **NASA GIBS WMTS** imagery layers), it helps Philippine farmers transition away from soil-depleting monoculture by comparing **Route A (Status Quo)**, **Route B (Balanced Optimal)**, **Route C (Drought-Safe)**, and a **Custom 6-Season Rotation** side-by-side in an interactive map + 3D field cockpit.

---

## Core Features & NASA Judging Alignment

1. **Multi-Dataset NASA Fusion & Live Overlay Layers:**
   - Combines 10-year (2015–2024) monthly agroclimatology from **NASA POWER** (`T2M`, `T2M_MAX`, `PRECTOTCORR`, `GWETROOT`, `ALLSKY_SFC_SW_DWN`), terrain elevation & slope from **SRTM 30m**, and dry-season greenness / bare-ground baselines from **MODIS MOD13Q1 NDVI (250m)**.
   - Adds interactive **NASA GIBS WMTS** satellite overlay toggles (**None | NDVI | Rain**) over an **Esri World Imagery** + place-labels base map, plus live **Open-Meteo** current weather and an inspectable **Data Feeds** status drawer.
2. **Interactive Map Picker, Polygon Tracing & Multi-Farm Workspace:**
   - Explore 3 pre-verified Philippine reference farms (**Isabela**, **Bukidnon**, **Davao del Sur**), search towns via **OSM Nominatim**, drop a custom pin (with an ocean/water tile guard), or zoom in (`>= 14`) to trace field polygon vertices (`<= 5 km` span) with automatic geodesic hectare sizing.
   - Save, name, rename, switch, and delete multiple farms in `localStorage`, protected by an **Unsaved-Farm Guard** confirmation modal before switching locations.
3. **Observed 2015–16 El Niño Replay & Instant Stress-Test:**
   - Replays the location's **actual NASA POWER Jun 2015–May 2016 El Niño months** (`observed_2015_2016`, falling back to synthetic `-25% rain, +1.5 °C` only where 2015–16 months are missing) alongside atmospheric heat/dust cues and a per-route El Niño impact breakdown.
4. **Plain-English Jargon, Farmer Overrides & Seasonal Wilt/Loss Alerts:**
   - Translates satellite metrics into plain English (`GWETROOT` → *Soil Thirst Level*, `ET0` → *Daily Water Use*, `SRTM Slope` → *Erosion Slope Risk*) and flags **Bare-Soil Erosion Months**, **Pest Cycle Broken** switches, **`CROP WILT / DROUGHT RISK`** seasons, and **`NET LOSS`** seasons.
   - Incorporates farmer soil texture (`Clay`, `Loam`, `Sandy`), irrigation (`Rainfed` / `Irrigated`), goal (`Cash Crop` / `Livestock Forage`), priority sliders, dual **PHP / USD** currency display, and lab soil overrides (`pH`, `N`, `floods`, `prior pest`).
5. **Interactive 3D Crop Field (8 Distinct Models) & 2-Page Per-Farm PDF Report:**
   - Step 05 renders a Three.js 3D field (rectangular or matching the drawn polygon) with **8 distinct crop models** (`corn`, `paddy_rice`, `upland_rice`, `sorghum`, `mungbean`, `peanut`, `cowpea`, `sweet_potato`), per-plot focus-fading (`100%` active vs `18%` surrounding), hover/selection plot labels, and a 6-season playback scrubber.
   - Exports a **2-page PDF Field Report** (`jsPDF`) tagged with the active farm's custom name, location, coordinates, hectares, wilt/net-loss callouts, and DA soil-lab disclaimers.
6. **Three-Tier Offline/Live Resilience & Guided Walkthrough:**
   - Falls back smoothly from the FastAPI backend (`/api/farm`, `/api/plans`) to a precomputed offline bundle (`fallback_plans.json`) + direct browser NASA POWER queries + a Web Worker 6-season simulator (`planWorker.ts`).
   - Includes a step-gated **Pause-and-Explore Walkthrough Tour** with quick-pick reference farm buttons and mobile/tablet responsive HUD drawers.

---

## Repository Structure

```text
NASA-Space-App-Hackathon---Mikazuki-Fields/
├── README.md
├── .python-version                      # Python 3.12 runtime pin
├── requirements.txt                     # Root Python dependencies for Vercel Serverless
├── vercel.json                          # Vercel /api/* rewrite to Python ASGI entrypoint
├── render.yaml                          # Render Web Service deployment config
├── railway.json                         # Railway NIXPACKS deployment config
├── Procfile                             # Cloud process entrypoint (uvicorn)
├── api/
│   └── index.py                         # Vercel Python ASGI entrypoint exposing FastAPI app
├── docs/                                # Architecture, API & UI specifications
│   ├── data_api_contract.md             # NASA APIs, JSON schemas & FastAPI endpoint contract
│   ├── data_infras_execution_checklist.md # Data pipeline & backend verification checklist
│   ├── challenge_data_api_links.md      # Official NASA & agronomic dataset references
│   └── UI_STYLE_GUIDE.md                # Palette, typography, HUD components & motion rules
├── data-prep/                           # NASA data ingestion, fusion & offline fallback scripts
│   ├── presets_config.py                # 3 Philippine farm preset coordinates & metadata
│   ├── fetch_power.py                   # NASA POWER 2015–2024 monthly cleaner & El Niño builder
│   ├── fetch_srtm_ndvi.py               # SRTM 30m slope + MODIS MOD13Q1 NDVI fusion builder
│   ├── export_fallback.py               # Exports frontend/public/fallback_plans.json via TestClient
│   ├── cache/                           # Pre-fetched MODIS MOD13Q1 NDVI time-series caches
│   └── presets/                         # Pre-built FarmContext + POWER JSON presets (3 regions)
├── backend/                             # Python 3.12 + FastAPI + NumPy Vectorized Engine
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                      # FastAPI endpoints, preset loader, live pin & SRTM lookup/cache
│   │   ├── power_client.py              # NASA POWER processor, ET0, 2015–16 El Niño & banner metrics
│   │   ├── schemas.py                   # Locked Pydantic v2 API contract models
│   │   ├── crop_library.json            # 8 Philippine crops calibrated with FAO-56, FAO-33 & PSA OpenSTAT
│   │   ├── simulator.py                 # Vectorized 6-season agronomic & profit simulator
│   │   └── optimizer.py                 # Exhaustive 8^6 = 262,144 rotation optimizer (Plans A, B, C)
│   ├── tests/
│   │   ├── test_api_contract.py         # Preset integrity, endpoint contracts, cache & deployment tests
│   │   └── test_sanity.py               # Mandatory agronomic sanity & performance tests
│   └── requirements.txt
└── frontend/                            # React 19 + Vite + TypeScript + Tailwind v4 + Leaflet + Three.js
    ├── public/
    │   ├── fallback_plans.json          # Offline safety-net bundle for live demo / API fallback
    │   └── og-image.png
    └── src/
        ├── api/                         # client.ts fallback orchestrator, backend, power, weather, geocode, landcheck
        ├── components/mission/          # Mission HUD, TargetMap, PlaceSearch, DataFeedsPanel, PickPlants, PlantField, Tour, ElNino*
        ├── data/                        # crops.ts, calendar.ts, presets.json
        ├── engine/                      # In-browser TypeScript simulator, optimizer & planWorker.ts
        ├── three/                       # tileField.ts, plantScene.ts & cropModels.ts (8 crop 3D geometries)
        ├── styles/                      # tokens.css & mission.css (responsive HUD + coarse touch targets)
        └── utils/                       # geo, savedFarms, pdfReport, seasonAlerts, plantFocus, currency, tour, locationName, telemetryStatus
```

---

## Project Setup, Virtual Environments & Running Servers

### 1. Backend Virtual Environment Setup (Python 3.12)

Create the virtual environment inside `backend/venv`:

```bash
python -m venv backend/venv
```

Activate the virtual environment:

- **Windows PowerShell:**
  ```powershell
  .\backend\venv\Scripts\Activate.ps1
  ```
- **Windows Command Prompt (CMD):**
  ```cmd
  .\backend\venv\Scripts\activate.bat
  ```
- **macOS / Linux:**
  ```bash
  source backend/venv/bin/activate
  ```

Install backend dependencies:

```bash
pip install -r backend/requirements.txt
```

### 2. Running the NASA Data Pipeline & Offline Fallback Exporter (Optional — Presets Pre-Cached)

The three Philippine farm presets (`bukidnon`, `davao_del_sur`, `isabela`) and offline fallback bundle are already pre-cached in the repository. To regenerate them from live NASA POWER, OpenTopoData SRTM 30m, and ORNL DAAC MODIS APIs:

```bash
python data-prep/fetch_power.py
python data-prep/fetch_srtm_ndvi.py
python data-prep/export_fallback.py
```

### 3. Running the Backend Server (FastAPI + Uvicorn)

From the repository root:

```bash
uvicorn backend.app.main:app --reload --port 8000
```

Key endpoints:
- **Root Metadata:** `http://localhost:8000/`
- **Health Check:** `http://localhost:8000/api/health`
- **Farm Presets & Context:** `GET http://localhost:8000/api/presets`, `GET http://localhost:8000/api/farm`
- **Rotation Optimizer:** `POST http://localhost:8000/api/plans`
- **Interactive Swagger UI:** `http://localhost:8000/docs`

### 4. Running Automated Verification (`pytest` & Frontend Checks)

Backend contract, cache, and agronomic sanity tests:

```bash
pytest backend/tests/test_api_contract.py backend/tests/test_sanity.py -v
```

Frontend typecheck, Node unit tests, and production build:

```bash
npm --prefix frontend run typecheck
npm --prefix frontend test
npm --prefix frontend run build
```

### 5. Running the Frontend Dev Server (React + Vite + TypeScript)

```bash
cd frontend
npm install
npm run dev
```

- Runs at `http://localhost:5173` (proxying `/api` requests to `http://localhost:8000` with automatic fallback to `frontend/public/fallback_plans.json`, direct NASA POWER queries, and the browser Web Worker simulator).

---

## Mathematical & Agronomic Models

Mikazuki Fields combines deterministic agro-climatic physics with exhaustive vectorized search across all $8^6 = 262{,}144$ possible 6-season rotations:

1. **Hargreaves Reference Evapotranspiration ($ET_0$):**

$$ET_0 = 0.0135 \times (T2M + 17.8) \times 0.408 \times \mathrm{ALLSKY\_SFC\_SW\_DWN}$$

2. **FAO-56 / FAO-33 Water Balance & Drought Yield Loss:**
   - $\mathrm{Demand} = K_c \times ET_0 \times \text{days}$ (plus $200\text{ mm}$ ponding for `paddy_rice`)
   - $\mathrm{Supply} = 0.80 \times \mathrm{rain\_mm} + \mathrm{store}_t$, $\mathrm{Gap} = \max(0, \mathrm{Demand} - \mathrm{Supply})$
   - Rainfed yield loss: $\min\left(0.85, K_y \times \frac{\mathrm{Gap}}{\mathrm{Demand}}\right)$
   - Severe water-deficit seasons (`waterLoss >= 0.35` or unmet `gapMm >= 120`) and negative seasonal profit trigger **`CROP WILT / DROUGHT RISK`** and **`NET LOSS`** flags in the UI and 2-page PDF report.

3. **Heat, Nitrogen & Pest Carryover:**
   - Heat loss: $\min\left(0.70, 0.10 \times \max(0, T_{\max} - T_{\mathrm{heat\_limit}})\right)$
   - Soil Nitrogen ($N_{t+1} = \mathrm{clip}(N_t + \Delta N, 10, 100)$) with *Fabaceae* fixation ($0.5\times$ penalty if $\text{pH} < 5.5$) and urea top-up cost ($\mathrm{Deficit\_N} \times 180\text{ PHP}$)
   - Pest carryover: $+0.25$ on same-family monoculture vs. $\times 0.30$ decay on family switch (`Pest Cycle Broken`)

4. **RUSLE-Style Bare-Soil Erosion Index ($0\text{--}100$):**

$$\mathrm{Erosion\_Index}_t = \mathrm{clip}\left(\frac{\mathrm{rain\_mm}}{1200} \times K_{\mathrm{soil}} \times \left(1 + \frac{\mathrm{slope\_pct}}{10}\right) \times C_{\mathrm{eff}} \times 50,\ 0,\ 100\right)$$

5. **Multi-Objective Vectorized Optimization & Custom Rotation:**
   - Evaluates all $262{,}144$ sequences using min-max normalized **Water ($W$)**, **Soil ($S$)**, and **Economy ($E$)** sub-scores: $\arg\max(w_{\mathrm{water}}W + w_{\mathrm{soil}}S + w_{\mathrm{econ}}E)$ for **Plan B (Balanced)**, and worst-case **Normal vs. El Niño** maximin selection for **Plan C (Drought-Safe)**, plus user-editable **Custom 6-Season Rotations**.

---

## Team Tekkadan Roster
*4th-Year BS Data Science Students*

- **Lorenzo Sulit (Data Engineer & API Infrastructure):** NASA multi-dataset ingestion pipeline (`NASA POWER`, `SRTM 30m`, `MODIS MOD13Q1`), Philippine farm preset JSONs, FastAPI backend endpoints, live custom map-pin & terrain caching, historical 2015–16 El Niño anomaly validation, and cloud/serverless deployment infrastructure.
- **Micku Lamsin (Agronomic Modeler, Vectorized Optimizer, QA & Data Science):** 8-crop library calibration (`FAO-56`, `FAO-33`, `PSA OpenSTAT`), vectorized NumPy 6-season simulation engine ($8^6 = 262,144$ rotations), deterministic explanations, automated `pytest` verification suite, and end-to-end QA & data verification.
- **Ezekiel Corpuz (Frontend Lead, UI/UX & Pitching):** Interactive cockpit HUD (`TargetMap`, `PickPlants`, `PlantField`, `Tour`), Leaflet satellite & NASA GIBS overlays, 8 custom Three.js 3D crop models, browser Web Worker fallback engine, per-farm PDF export, plain-English jargon translator UI, and project pitch & demo assets.

---

## NASA Space Apps Challenge Submission Package (`Project Tekkadan`)

### Project Name
`Project Tekkadan — Mikazuki Fields`

### Project Summary
**Mikazuki Fields** is a 3-route GPS crop-rotation planner designed for a Philippine farmer's next **6 planting seasons (3 years)**. The platform fuses 10 years (2015–2024) of **NASA POWER** agroclimatology, **SRTM 30m** elevation and slope, **MODIS MOD13Q1 250m NDVI** greenness, and **NASA GIBS** satellite overlay tiles (`MODIS_Terra_NDVI_8Day`, `IMERG_Precipitation_Rate`) with live **Open-Meteo** weather into plain-English indicators such as *Soil Thirst Level*, *Daily Water Use*, and *Erosion Slope Risk*. Farmers can select a Philippine reference farm, trace a field boundary polygon, save multiple farms locally, and compare **Status Quo**, **Balanced Optimal**, **Drought-Safe**, and **Custom** 6-season rotations in a Three.js 3D plot with 8 distinct crop models. An **El Niño toggle** replays the site's actual **2015–16 NASA POWER** drought months to highlight crop wilt risk and net financial losses—and exports a farm-specific 2-page PDF Field Report.

### Project Links
- **Project Demonstration (7-Slide Deck / <=30s Video):** `[Insert Public Demo Link — e.g., https://youtu.be/...]`
- **Project (Live App & Repository):**
  - GitHub Repository: `https://github.com/z-sulit/NASA-Space-App-Hackathon---Mikazuki-Fields`
  - Live Deployment: `[Insert Live Vercel URL — e.g., https://mikazuki-fields.vercel.app]`

### Project Details
- **What It Does & How It Works:** Farmers select a Philippine reference farm (`Bukidnon`, `Davao del Sur`, or `Isabela`), search any municipality, drop a custom map pin, or trace a field polygon (`<= 5 km` span) to compute hectares and inspect fused NASA climate, terrain, MODIS NDVI, NASA GIBS overlays, and Open-Meteo live weather. The backend (or in-browser Web Worker fallback engine) evaluates $8^6 = 262,144$ 6-season rotations across farmer constraints and ground-truth overrides (`soil_ph`, `soil_n_level`, `floods`, `prior_pest`) under both 10-year Normal and observed 2015–16 El Niño conditions, outputting 3D season visualizations and a downloadable 2-page PDF Field Report per farm.
- **Benefits & Intended Impact:** Helps smallholder farmers avoid nitrogen depletion, compounding *Poaceae* pest pressure, steep-slope erosion, and drought-driven crop wilt/financial losses before planting.
- **Tools, Languages & Software Used:** `Python 3.12`, `FastAPI`, `NumPy`, `Pandas`, `Pydantic v2`, `Pytest`, `React 19`, `Vite`, `TypeScript`, `Tailwind CSS v4`, `Leaflet`, `Three.js`, `jsPDF`, `Vercel`.
- **Creativity:** Frames multi-year agronomic optimization as a familiar 3-route GPS navigation planner paired with a step-gated walkthrough, polygon-shaped 3D crop fields, plain-English telemetry, and farm-specific printable PDF reports.
- **Agronomic & Regional Factors Considered:** Calibrated for Philippine Wet (Jun–Nov) and Dry (Dec–May) cropping calendars, regional farmgate prices and yields (`PSA OpenSTAT`), slope feasibility (`>8%` blocking paddy rice in steep uplands), acid-soil nodulation penalties (`soil_ph < 5.5`), and explicit disclosures on satellite spatial resolution (`~50–70 km` POWER cells, `250 m` MODIS pixels) recommending Department of Agriculture (DA) lab verification.

### Use of Super Intelligence (SI) Disclosure
Artificial intelligence / LLM coding assistants (Super Intelligence tools) were used by Team Tekkadan to assist with code checking, UI styling, and video generation. All NASA Earth observation datasets, agronomic calibration parameters, and simulation formulas were grounded in verified NASA, FAO, and PSA OpenSTAT references, with zero NASA branding or logos generated or modified.

### NASA Data & How It Was Used
- **NASA POWER Agroclimatology API (`MERRA-2`, `community=AG`)** — https://power.larc.nasa.gov/
  - **How It Was Used:** Queried 10-year (2015–2024) monthly agroclimatology (`T2M`, `T2M_MAX`, `PRECTOTCORR`, `GWETROOT`, `ALLSKY_SFC_SW_DWN`) both during preset generation (`data-prep/fetch_power.py`) and dynamically for custom map pins (`backend/app/power_client.py` + `frontend/src/api/power.ts` fallback). Drives Wet/Dry seasonal rainfall, heat-stress yield penalties, root-zone *Soil Thirst Level*, Hargreaves reference evapotranspiration ($ET_0$), and historical **2015–16 El Niño replay (`observed_2015_2016`)**.
- **NASA GIBS WMTS Earthdata Imagery (`MODIS_Terra_NDVI_8Day`, `IMERG_Precipitation_Rate`)** — https://gibs.earthdata.nasa.gov/
  - **How It Was Used:** Streamed live in `frontend/src/components/mission/TargetMap.tsx` as toggleable semi-transparent map overlays (**NDVI** vegetation greenness and **GPM IMERG** precipitation) so farmers can visually inspect regional vegetation health and rainfall across the Philippines.
- **NASA Shuttle Radar Topography Mission (`SRTM 30m`)** — https://www.earthdata.nasa.gov/data/instruments/srtm
  - **How It Was Used:** Sampled 30m elevation grids (`data-prep/fetch_srtm_ndvi.py` and live custom-pin lookups in `backend/app/main.py` with nearest-preset fallback when quota/holes occur) to compute elevation (`elevation_m`) and terrain slope (`slope_pct`), drive the RUSLE-style bare-soil erosion index, and enforce the steep-upland paddy-rice block (`slope_pct > 8.0%`).
- **NASA MODIS `MOD13Q1 v061` 16-Day 250m NDVI (LP DAAC via ORNL DAAC REST API)** — https://lpdaac.usgs.gov/products/mod13q1v061/ | https://modis.ornl.gov/globalsubset/
  - **How It Was Used:** Processed 10 years (2015–2024) of 250m NDVI composites in `data-prep/fetch_srtm_ndvi.py` to compute each preset's dry-season baseline greenness (`mean_ndvi` / `ndvi_dry_min`), post-harvest bare-soil months, and historical El Niño greenness drops (and used as fallback context for custom pins).

### Space Agency Partner, Map & Ground-Truth Data
- **Philippine Statistics Authority (`PSA OpenSTAT`)** — https://openstat.psa.gov.ph/
  - **How It Was Used:** Calibrated baseline regional crop yields, farmgate prices (`PHP/t`), and production costs in `backend/app/crop_library.json` and `frontend/src/data/crops.ts` across all 8 Philippine crops.
- **FAO Irrigation and Drainage Paper No. 56 & No. 33** — https://www.fao.org/land-water/databases-and-software/crop-information/en/
  - **How It Was Used:** Parameterized crop water coefficients ($K_c$) and deficit yield response factors ($K_y$) in `backend/app/simulator.py` and `frontend/src/engine/simulate.ts`.
- **OpenTopoData `SRTM 30m` Public REST API** — https://www.opentopodata.org/datasets/srtm/
  - **How It Was Used:** Queried by `data-prep/fetch_srtm_ndvi.py` and `backend/app/main.py` (`OPENTOPO_URL`) for 5-point/ring 30m elevation sampling to compute `slope_pct` and elevation.
- **Open-Meteo Current Weather API** — https://open-meteo.com/
  - **How It Was Used:** Fetched live in `frontend/src/api/weather.ts` for real-time local temperature, precipitation, and wind speed at the focused pin/preset (`Conditions` HUD & `DataFeedsPanel`).
- **Esri World Imagery & World Boundaries and Places** — https://server.arcgisonline.com/
  - **How It Was Used:** High-resolution satellite base map and reference place labels in `TargetMap.tsx` (used exclusively for interactive visual farm boundary tracing with visible Esri/Maxar/Earthstar attribution).
- **OpenStreetMap (`Nominatim` & OSM Tiles)** — https://nominatim.openstreetmap.org/
  - **How It Was Used:** Powers Philippine town/municipality search & reverse-geocoded farm location names (`frontend/src/api/geocode.ts`) and lightweight land-vs-water validation (`frontend/src/api/landcheck.ts`).

### Project Submission Verification
- Team Tekkadan confirms agreement to the **NASA Space Apps Challenge Terms & Conditions** and declares that this project is our original work built for the 2026 NASA Space Apps Challenge.
