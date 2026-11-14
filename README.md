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
│   └── frontend_spec.md                 # Ezekiel Corpuz: 4 UI regions, jargon copy, pitch assets
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

## Team Tekkadan Roster

- **Lorenzo Sulit (Data Engineer & API Infrastructure):** NASA multi-dataset ingestion pipeline (`NASA POWER`, `SRTM 30m`, `MODIS MOD13Q1`), Philippine farm preset JSONs, FastAPI backend endpoints, live custom map-pin caching, historical El Niño anomaly validation, and cloud/serverless deployment infrastructure.
- **Micku Lamsin (Agronomic Modeler, Vectorized Optimizer, QA & Data Verification):** 8-crop library calibration (`FAO-56`, `FAO-33`, `PSA OpenSTAT`), vectorized NumPy 6-season simulation engine ($8^6 = 262,144$ rotations), deterministic explanations, automated `pytest` verification suite, and end-to-end QA & data verification.
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
Artificial intelligence / LLM coding assistants (Super Intelligence tools) were used by Team Tekkadan to assist with software engineering, data pipeline scaffolding, UI styling, and automated verification testing. All NASA Earth observation datasets, agronomic calibration parameters, and simulation formulas were grounded in verified NASA, FAO, and PSA OpenSTAT references, with zero NASA branding or logos generated or modified.

### NASA Data
- `NASA POWER Agroclimatology API (MERRA-2)` — https://power.larc.nasa.gov/
- `NASA Shuttle Radar Topography Mission (SRTM 30m)` — https://www.earthdata.nasa.gov/data/instruments/srtm
- `NASA MODIS MOD13Q1 v061 16-Day 250m NDVI (LP DAAC)` — https://lpdaac.usgs.gov/products/mod13q1v061/
- `ORNL DAAC MODIS Global Subset REST API` — https://modis.ornl.gov/globalsubset/

### Space Agency Partner & Other Data
- `Philippine Statistics Authority (PSA OpenSTAT)` — https://openstat.psa.gov.ph/
- `FAO Irrigation and Drainage Paper No. 56 (Crop Evapotranspiration) & No. 33 (Yield Response to Water)` — https://www.fao.org/land-water/databases-and-software/crop-information/en/
- `OpenTopoData SRTM 30m Public REST API` — https://www.opentopodata.org/datasets/srtm/

### Project Submission Verification
- Team Tekkadan confirms agreement to the **NASA Space Apps Challenge Terms & Conditions** and declares that this project is our original work built for the 2026 NASA Space Apps Challenge.
