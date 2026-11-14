# Mikazuki Fields (by Team Tekkadan)
**2026 NASA Space Apps Challenge — Field Shift: Adapting Farms with NASA Data**

**Mikazuki Fields** is a farmer-centered decision-support web application that works like a 3-route GPS navigation planner, but for a farmer's next **6 planting seasons (3 years)**. Powered by fused NASA Earth observation datasets (**NASA POWER**, **SRTM**, and **MODIS NDVI**), it helps Philippine farmers transition away from soil-depleting monoculture by comparing **Status Quo**, **Balanced Optimal**, and **Drought-Safe** crop rotations side-by-side.

---

## Core Features & NASA Judging Alignment

1. **Multi-Dataset NASA Fusion:** Harmonizes 10-year monthly agroclimatology from **NASA POWER** (`T2M`, `T2M_MAX`, `PRECTOTCORR`, `GWETROOT`, `ALLSKY_SFC_SW_DWN`), terrain slope from **SRTM 30m**, and bare-ground vegetation profiles from **MODIS MOD13Q1 NDVI (250m)**.
2. **Plain-English Jargon Translator:** Translates scientific satellite indices into farmer-friendly indicators with interactive tooltips (e.g., `GWETROOT` $\rightarrow$ *Soil Thirst Level*, `ET0` $\rightarrow$ *Daily Water Use*, `SRTM Slope` $\rightarrow$ *Erosion Slope Risk*).
3. **Bare-Field & Pest-Cycle Interrupt Badges:** Automatically flags **Bare-Soil Erosion Months** ($>200\text{ mm}$ rain on uncovered soil) and awards **Pest Cycle Broken** badges when adjacent seasons switch botanical families (e.g., *Poaceae* grass to *Fabaceae* legume).
4. **Farmer Constraints & Ground-Truth Overrides:** Incorporates Soil Texture (`Clay`, `Loam`, `Sandy`), Irrigation Access (`Rainfed` vs. `Irrigated`), Farm Goal (`Cash Crop` vs. `Livestock Forage`), 3 priority sliders, and a field-observation override drawer where local farmer knowledge supersedes satellite estimates.
5. **Instant El Niño Stress-Test & Transparent Limitations:** A zero-latency **"Simulate El Niño (-25% Rain, +1.5°C)"** toggle shows how monoculture collapses under drought while diversified plans hold steady, paired with a transparent disclosure on satellite pixel resolution and Department of Agriculture (DA) soil testing.

---

## Repository Structure

```text
mikazuki-fields/
├── README.md
├── docs/
│   ├── DATA_AND_API_CONTRACT.md    # Person 1: NASA APIs, JSON schemas, FastAPI endpoints
│   ├── ENGINE_AND_MODEL_SPEC.md    # Person 2: 8-crop table, vectorized NumPy math, pytest suite
│   └── FRONTEND_AND_TASKS.md       # Person 3: 4 UI regions, translator copy, 48h schedule
├── data-prep/                      # Offline Python scripts for preset generation
│   ├── fetch_power.py
│   ├── fetch_srtm_ndvi.py
│   └── presets/
│       ├── bukidnon.json
│       ├── davao_del_sur.json
│       └── isabela.json
├── backend/                        # Python 3.11 + FastAPI + NumPy Vectorized Engine
│   ├── app/
│   │   ├── main.py
│   │   ├── schemas.py
│   │   ├── crop_library.json
│   │   ├── simulator.py
│   │   └── optimizer.py
│   ├── tests/
│   │   └── test_sanity.py
│   └── requirements.txt
└── frontend/                       # React + Vite + TypeScript + Tailwind + shadcn/ui
    ├── public/
    │   └── fallback_plans.json     # Offline safety net for live judging demo
    ├── src/
    │   ├── components/
    │   ├── hooks/
    │   └── types/
    └── package.json
```

---

## Quickstart Guide

### 1. Backend Setup (Python 3.11 + FastAPI)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install fastapi uvicorn numpy pandas pydantic requests pytest
uvicorn app.main:app --reload --port 8000
```
* interactive Swagger API docs: `http://localhost:8000/docs`
* Run agronomic sanity tests: `pytest tests/test_sanity.py`

### 2. Frontend Setup (React + Vite + TypeScript)
```bash
cd frontend
npm install
npm run dev
```
* App runs at `http://localhost:5173` (configured to proxy `/api` to `localhost:8000` with automatic fallback to `public/fallback_plans.json`).

---

## Team Tekkadan Roster (3-Person Split)
* **Person 1 (Data Engineer + API + Pitch):** NASA data pipeline, preset JSONs, FastAPI endpoints, El Niño validation, and pitch deck/video.
* **Person 2 (Agronomic Modeler + Optimizer):** 8-crop library calibration, vectorized NumPy season-step engine ($8^6 = 262,144$ rotations), and deterministic explanations.
* **Person 3 (Frontend Lead + UI/UX):** 4-region React interface, Leaflet map picker, 3-plan comparison cards, Recharts graphs, and mobile tab layout.