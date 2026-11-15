# Mikazuki Fields (by Team Tekkadan)
**2026 NASA Space Apps Challenge — Field Shift: Adapting Farms with NASA Data**

**Mikazuki Fields** is a farmer-centered decision-support web application that works like a 3-route GPS navigation planner, but for a farmer's next **6 planting seasons (3 years)**. Powered by fused NASA Earth observation datasets (**NASA POWER**, **SRTM 30m**, and **MODIS MOD13Q1 NDVI**), it helps Philippine farmers transition away from soil-depleting monoculture by comparing **Status Quo**, **Balanced Optimal**, and **Drought-Safe** crop rotations side-by-side.

---

## Core Features & NASA Judging Alignment

1. **Multi-Dataset NASA Fusion:** Harmonizes 10-year monthly agroclimatology from **NASA POWER** (`T2M`, `T2M_MAX`, `PRECTOTCORR`, `GWETROOT`, `ALLSKY_SFC_SW_DWN`), terrain slope from **SRTM 30m**, and bare-ground vegetation profiles from **MODIS MOD13Q1 NDVI (250m)**.
2. **Plain-English Jargon Translator:** Translates scientific satellite indices into farmer-friendly indicators with interactive tooltips (e.g., `GWETROOT` → *Soil Thirst Level*, `ET0` → *Daily Water Use*, `SRTM Slope` → *Erosion Slope Risk*).
3. **Bare-Field & Pest-Cycle Interrupt Badges:** Automatically flags **Bare-Soil Erosion Months** (>200 mm rain on uncovered soil) and awards **Pest Cycle Broken** badges when adjacent seasons switch botanical families (e.g., *Poaceae* grass to *Fabaceae* legume).
4. **Farmer Constraints & Ground-Truth Overrides:** Incorporates Soil Texture (`Clay`, `Loam`, `Sandy`), Irrigation Access (`Rainfed` vs. `Irrigated`), Farm Goal (`Cash Crop` vs. `Livestock Forage`), 3 priority sliders, and a field-observation override drawer where local farmer knowledge supersedes satellite estimates.
5. **Instant El Niño Stress-Test & Transparent Limitations:** A zero-latency **"Simulate El Niño (-25% Rain, +1.5°C)"** toggle shows how monoculture collapses under drought while diversified plans hold steady, paired with a transparent disclosure on satellite pixel resolution and Department of Agriculture (DA) soil testing.

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
├── docs/                                # Architecture & dataset reference specs
│   ├── data_api_contract.md             # Lorenzo Sulit: NASA APIs, JSON schemas, FastAPI endpoints
│   ├── data_infras_execution_checklist.md # Lorenzo Sulit: Data pipeline & backend gate checklist
│   ├── challenge_data_api_links.md      # Lorenzo Sulit: Official NASA & agronomic dataset URLs
│   ├── agronomic_model_vectorized_optimizer_spec.md # Micku Lamsin: 8-crop table, NumPy math, sanity suite
│   ├── frontend_spec.md                 # Ezekiel Corpuz: 4 UI regions, jargon copy, pitch assets
│   └── UI_STYLE_GUIDE.md                # Ezekiel Corpuz: palette, type, components, motion, accessibility
├── data-prep/                           # NASA data ingestion, fusion & offline fallback scripts
│   ├── presets_config.py                # 3 Philippine farm preset coordinates & metadata
│   ├── fetch_power.py                   # NASA POWER 2015–2024 monthly cleaner & El Niño validator
│   ├── fetch_srtm_ndvi.py               # SRTM 30m slope + MODIS MOD13Q1 NDVI fusion builder
│   ├── export_fallback.py               # Exports frontend/public/fallback_plans.json via TestClient
│   └── presets/
│       ├── bukidnon.json                # Valencia City, Bukidnon FarmContext preset
│       ├── davao_del_sur.json           # Digos, Davao del Sur FarmContext preset
│       └── isabela.json                 # Ilagan, Isabela FarmContext preset
├── backend/                             # Python 3.12 + FastAPI + NumPy Vectorized Engine
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                      # FastAPI endpoints, preset loader, live pin cache & Vercel fallback
│   │   ├── power_client.py              # Shared NASA POWER processor & plain-English banner builder
│   │   ├── schemas.py                   # Locked Pydantic v2 API contract models
│   │   ├── crop_library.json            # 8 Philippine crops calibrated with FAO-56, FAO-33 & PSA OpenSTAT
│   │   ├── simulator.py                 # Vectorized 6-season agronomic & profit simulator
│   │   └── optimizer.py                 # Exhaustive 8^6 = 262,144 rotation optimizer (Plans A, B, C)
│   ├── tests/
│   │   ├── test_api_contract.py         # Preset integrity, endpoint contracts, cache & deployment tests
│   │   └── test_sanity.py               # Mandatory agronomic sanity & <1s performance tests
│   └── requirements.txt
└── frontend/                            # React + Vite + TypeScript + Tailwind + Three.js
    └── public/
        └── fallback_plans.json          # Offline safety net bundle for live judging demo
```

---

## Project Setup, Virtual Environments & Running Servers

### 1. Backend Virtual Environment Setup (Python 3.12)

Create the virtual environment inside `backend/venv`:

```bash
python -m venv backend/venv
```

Activate the virtual environment for your shell:

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

Or from inside `backend/`:

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

Key endpoints:
- **Root Metadata:** `http://localhost:8000/`
- **Health Check:** `http://localhost:8000/api/health`
- **Interactive Swagger UI:** `http://localhost:8000/docs`

### 4. Running Automated Verification & Sanity Tests (`pytest`)

Run all 17 tests covering API contracts, pre-cached presets, custom-pin NASA POWER caching, cloud/serverless configs, and agronomic sanity checks:

```bash
pytest backend/tests/test_api_contract.py backend/tests/test_sanity.py -v
```

### 5. Running the Frontend Server (React + Vite + TypeScript)

```bash
cd frontend
npm install
npm run dev
```

- Runs at `http://localhost:5173` (proxying `/api` requests to `http://localhost:8000` with automatic offline fallback to `frontend/public/fallback_plans.json`).

---

## Mathematical & Agronomic Models

Mikazuki Fields combines deterministic agro-climatic physics with exhaustive vectorized search across all $8^6 = 262{,}144$ possible 6-season rotations:

1. **Hargreaves Reference Evapotranspiration ($ET_0$):**

$$ET_0 = 0.0135 \times (T2M + 17.8) \times 0.408 \times \mathrm{ALLSKY\_SFC\_SW\_DWN}$$

2. **FAO-56 / FAO-33 Water Balance & Drought Yield Loss:**
   - $\mathrm{Demand} = K_c \times ET_0 \times \text{days}$ (plus $200\text{ mm}$ ponding for `paddy_rice`)
   - $\mathrm{Supply} = 0.80 \times \mathrm{rain\_mm} + \mathrm{store}_t$, $\mathrm{Gap} = \max(0, \mathrm{Demand} - \mathrm{Supply})$
   - Rainfed yield loss: $\min\left(0.85, K_y \times \frac{\mathrm{Gap}}{\mathrm{Demand}}\right)$

3. **Heat, Nitrogen & Pest Carryover:**
   - Heat loss: $\min\left(0.70, 0.10 \times \max(0, T_{\max} - T_{\mathrm{heat\_limit}})\right)$
   - Soil Nitrogen ($N_{t+1} = \mathrm{clip}(N_t + \Delta N, 10, 100)$) with *Fabaceae* fixation ($0.5\times$ penalty if $\text{pH} < 5.5$) and urea top-up cost ($\mathrm{Deficit\_N} \times 180\text{ PHP}$)
   - Pest carryover: $+0.25$ on same-family monoculture vs. $\times 0.30$ decay on family switch (`Pest Cycle Broken`)

4. **RUSLE-Style Bare-Soil Erosion Index ($0\text{--}100$):**

$$\mathrm{Erosion\_Index}_t = \mathrm{clip}\left(\frac{\mathrm{rain\_mm}}{1200} \times K_{\mathrm{soil}} \times \left(1 + \frac{\mathrm{slope\_pct}}{10}\right) \times C_{\mathrm{eff}} \times 50,\ 0,\ 100\right)$$

5. **Multi-Objective Vectorized Optimization:**
   - Evaluates all $262{,}144$ sequences in NumPy using min-max normalized **Water ($W$)**, **Soil ($S$)**, and **Economy ($E$)** sub-scores: $\arg\max(w_{\mathrm{water}}W + w_{\mathrm{soil}}S + w_{\mathrm{econ}}E)$ for **Plan B**, and worst-case **Normal vs. El Niño** maximin selection for **Plan C**.

---

## Team Tekkadan Roster

- **Lorenzo Sulit (Data Engineer & API Infrastructure):** NASA multi-dataset ingestion pipeline (`NASA POWER`, `SRTM 30m`, `MODIS MOD13Q1`), Philippine farm preset JSONs, FastAPI backend endpoints, live custom map-pin caching, historical El Niño anomaly validation, and cloud/serverless deployment infrastructure.
- **Micku Lamsin (Agronomic Modeler, Vectorized Optimizer, QA & Data Science):** 8-crop library calibration (`FAO-56`, `FAO-33`, `PSA OpenSTAT`), vectorized NumPy 6-season simulation engine ($8^6 = 262,144$ rotations), deterministic explanations, automated `pytest` verification suite, and end-to-end QA & data verification.
- **Ezekiel Corpuz (Frontend Lead, UI/UX & Pitching):** 4-region React + Vite + TypeScript + Three.js interface, interactive map picker, 3-plan comparison cards, Recharts graphs, plain-English jargon translator UI, and project pitch & live demo presentation.

---

## NASA Space Apps Challenge Submission Package (`Project Tekkadan`)

### Project Name
`Project Tekkadan — Mikazuki Fields`

### Project Summary
**Mikazuki Fields** is a 3-route GPS crop-rotation planner designed for a Philippine farmer's next **6 planting seasons (3 years)**. Rather than showing raw satellite charts, the platform fuses 10 years of **NASA POWER** agroclimatology, **SRTM 30m** elevation and slope, and **MODIS MOD13Q1 250m NDVI** greenness into plain-English indicators such as *Soil Thirst Level*, *Daily Water Use*, and *Erosion Slope Risk*. Using farmer-supplied constraints (soil texture, rainfed vs. irrigated access, cash vs. forage goals, priority sliders, and field-level ground-truth overrides), a vectorized **NumPy** optimizer evaluates all **$8^6 = 262,144$** possible 6-season crop sequences in under one second to recommend **Plan A (Status Quo)**, **Plan B (Balanced Optimal)**, and **Plan C (Drought-Safe)**. An instant **El Niño stress-test toggle (-25% rain, +1.5°C)** reveals how continuous monoculture collapses under drought while legume-rotated plans break pest cycles, rebuild soil nitrogen, protect bare slopes from erosion, and stabilize farm income.

### Project Links
- **Project Demonstration (7-Slide Deck / <=30s Video):** `[Insert Public Demo Link — e.g., https://youtu.be/...]`
- **Project (Live App & Repository):**
  - GitHub Repository: `https://github.com/z-sulit/NASA-Space-App-Hackathon---Mikazuki-Fields`
  - Live Deployment: `[Insert Live Vercel URL — e.g., https://mikazuki-fields.vercel.app]`

### Project Details
- **What It Does & How It Works:** Farmers select a Philippine agricultural preset (`Bukidnon`, `Davao del Sur`, or `Isabela`) or drop a custom map pin to inspect fused NASA climate, slope, and bare-soil profiles. The FastAPI backend feeds these parameters plus farmer constraints and ground-truth overrides (`soil_ph`, `soil_n_level`, `flooded_months`, prior pests) into a vectorized NumPy agronomic simulator that scores all 262,144 6-season rotations across Normal and El Niño scenarios, highlighting pest-cycle breaks (`Fabaceae` rotations) and bare-soil erosion flags.
- **Benefits & Intended Impact:** Helps smallholder farmers escape nitrogen depletion, compounding *Poaceae* pest pressure (e.g., fall armyworm), and urea cost spikes caused by continuous monoculture—while quantifying drought resilience before an El Niño season hits.
- **Tools, Languages & Software Used:** `Python 3.12`, `FastAPI`, `NumPy`, `Pandas`, `Pydantic v2`, `Pytest`, `React`, `Vite`, `TypeScript`, `Tailwind CSS`, `Three.js`, `Vercel`.
- **Creativity:** Reimagines agronomic crop modeling as a familiar 3-route navigation screen (`Status Quo`, `Balanced`, `Drought-Safe`) paired with a plain-English satellite jargon translator and instant zero-latency El Niño ghost-bar comparisons.
- **Agronomic & Regional Factors Considered:** Calibrated for Philippine Wet (Jun–Nov) and Dry (Dec–May) cropping calendars, regional farmgate prices and yields (`PSA OpenSTAT`), slope feasibility (`>8%` blocking paddy rice in steep Bukidnon uplands), acid-soil nodulation penalties (`soil_ph < 5.5` triggering a liming advisory), and clear disclosures on satellite spatial resolution (`50–70 km` POWER cells, `250 m` MODIS pixels) recommending local Department of Agriculture (DA) soil lab verification.

### Use of Super Intelligence (SI) Disclosure
Team Tekkadan used SI tools to build faster. The team chose the problem, the data, the agronomic model and the design, and reviewed and tested everything the tools produced.

| Area | SI tool | Where and how |
|---|---|---|
| Code | Claude Code (Anthropic), an AI coding assistant; other LLM assistants | Helped write and review much of the React front end (mission flow, map search and farm-boundary drawing, 3D field and crop models, guided tour, phone and tablet layout), the live SRTM terrain lookup in `backend/app/main.py`, and their tests. The team also used LLM assistants for code checking and UI styling. |
| Audio | Microsoft neural text-to-speech (`en-PH-JamesNeural`) | The narration in the 30-second demo video is an SI-generated voice. The video's end card says so. |
| Video | None for imagery | The demo video is NASA Image and Video Library footage and screen recordings of the app, with captions. Its editing scripts were written with an AI coding assistant. |
| Images | None | No image generators were used. The emblem and the share image (`frontend/public/og-image.png`, a screenshot of the app) are drawn by the app's own code. |
| Text | LLM assistants | Helped draft the project write-ups, including this submission section. |
| Data and results | None | Every number comes from NASA POWER, SRTM, MODIS, NASA GIBS, PSA OpenSTAT, FAO references and the team's own optimizer. No data is SI-generated. |

No SI-generated content uses, contains or modifies NASA branding, logos or mission identifiers.

### NASA Data
- `NASA POWER Agroclimatology API (MERRA-2)` — https://power.larc.nasa.gov/
  - **How It Was Used:** Queried 10-year (2015–2024) monthly agroclimatology (`T2M`, `T2M_MAX`, `PRECTOTCORR`, `GWETROOT`, `ALLSKY_SFC_SW_DWN`, `community=AG`) to compute Wet (`Jun–Nov`) and Dry (`Dec–May`) seasonal rainfall, afternoon heat stress penalties, root-zone *Soil Thirst Level*, Hargreaves reference evapotranspiration ($ET_0$), and historical 2015–16 / 2023–24 El Niño drought anomalies.
- `NASA Shuttle Radar Topography Mission (SRTM 30m)` — https://www.earthdata.nasa.gov/data/instruments/srtm
  - **How It Was Used:** Extracted 30m elevation grids around Philippine farm coordinates to calculate terrain slope (`slope_pct`), classify *Erosion Slope Risk*, drive the RUSLE-style seasonal bare-soil erosion index, and enforce the hard feasibility mask blocking lowland paddy rice on steep uplands (`slope_pct > 8.0%`).
- `NASA MODIS MOD13Q1 v061 16-Day 250m NDVI (LP DAAC)` — https://lpdaac.usgs.gov/products/mod13q1v061/
  - **How It Was Used:** Analyzed 10 years (2015–2024) of 16-day 250m NDVI vegetation composites (`250m_16_days_NDVI`) to establish each farm's baseline *Green Cover Score* (`mean_ndvi`), flag historical post-harvest bare-soil months (`historical_bare_months`), and quantify historical El Niño vegetation greenness drops (`el_nino_ndvi_drop_pct`).
- `ORNL DAAC MODIS Global Subset REST API` — https://modis.ornl.gov/globalsubset/
  - **How It Was Used:** Used in `data-prep/fetch_srtm_ndvi.py` to programmatically fetch and cache 2015–2024 `MOD13Q1` pixel time-series subsets for our benchmark Philippine farm regions.

### Space Agency Partner & Other Data
- `Philippine Statistics Authority (PSA OpenSTAT)` — https://openstat.psa.gov.ph/
  - **How It Was Used:** Calibrated baseline regional crop yields (`base_yield_t_ha`), farmgate prices (`price_php_per_t`), and production costs (`base_cost_php`) in `backend/app/crop_library.json` across all 8 Philippine crops.
- `FAO Irrigation and Drainage Paper No. 56 (Crop Evapotranspiration) & No. 33 (Yield Response to Water)` — https://www.fao.org/land-water/databases-and-software/crop-information/en/
  - **How It Was Used:** Parameterized crop water requirement coefficients ($K_c$) and water-deficit yield sensitivity factors ($K_y$) in the 6-season water balance and drought yield-loss equations (`backend/app/simulator.py`).
- `OpenTopoData SRTM 30m Public REST API` — https://www.opentopodata.org/datasets/srtm/
  - **How It Was Used:** Queried in `data-prep/fetch_srtm_ndvi.py` to sample $3 \times 3$ and surrounding ring SRTM 30m elevation points for finite-difference terrain slope computation.

### Project Submission Verification
- Team Tekkadan confirms agreement to the **NASA Space Apps Challenge Terms & Conditions** and declares that this project is our original work built for the 2026 NASA Space Apps Challenge.
