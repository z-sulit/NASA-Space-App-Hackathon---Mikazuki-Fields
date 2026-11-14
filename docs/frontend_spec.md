# Frontend Architecture, Copy Deck & 48-Hour Schedule (`F` & `U` Lanes)
**Owners:** Person 3 (Frontend Lead) & Person 1 (Copy/Pitch Assets)

---

## 1. Four-Region UI Component Breakdown

| Region | Layout Position | Components to Build | Judging Requirements Covered |
| :--- | :--- | :--- | :--- |
| **1. Your Farm** | Left Sidebar (`w-80`) | `PresetSelect`, `FarmMap` (Leaflet pin picker), `BaselineCropSelect`, `SoilTextureToggle` (Clay/Loam/Sandy), `IrrigationToggle` (Rainfed/Irrigated), `GoalToggle` (Cash/Forage), 3 `PrioritySlider` controls, `GroundTruthDrawer` | Requirement 4 (Farmer constraints & ground-truth overrides) |
| **2. What NASA Sees** | Top Banner | 5 `MetricChip` cards with `JargonTooltip` popovers, NASA dataset source pills (`POWER`, `SRTM`, `MODIS 2015-2024`), `GroundTruthAppliedChip` | Requirement 1 (Multi-dataset fusion) & Requirement 2 (Plain-English translator) |
| **3. Compare 3 Routes** | Main Canvas | Instant `ElNinoToggle` switch; 3 `PlanColumn` cards (Plan A Status Quo, Plan B Balanced Recommended, Plan C Drought-Safe), each containing 6 `SeasonCell` blocks, `PestBrokenBadge` connectors, `BareMonthFlag` pills, KPI summary strip with El Niño `%` delta, deterministic *"Why this route"* bullets, and `ComparisonCharts` (Soil N line chart + Seasonal Profit bar chart with El Niño ghost bars) | Requirement 3 (Bare-soil & pest badges) & Requirement 5 (El Niño climate stress test) |
| **4. Limitations Box** | Bottom Footer | `LimitationsBox` displaying spatial resolution caveats and DA / Municipal Agriculturist review reminder | Requirement 5 (Information gaps & human-in-the-loop disclosure) |

---

## 2. Copy-Paste Ready UI Text Deck

### A. Plain-English Jargon Translator Table (`JargonTooltip`)
| NASA Metric | Farmer Label | Tooltip Explanation |
| :--- | :--- | :--- |
| `GWETROOT` | **Soil Thirst Level** | Water left where roots drink, top ~1 m. 0 is bone dry, 1 is soaked. |
| `ET0` / Crop Water Use | **Daily Water Use** | Water that sun and heat pull from soil and leaves. 5 mm a day is 50,000 litres per hectare. |
| `PRECTOTCORR` | **Rain You Can Count On** | Average rain for this season from 10 years of NASA records (2015–2024). |
| `T2M_MAX` | **Afternoon Heat** | The usual daily high. Corn and rice flowers get damaged above about 35°C. |
| `ALLSKY_SFC_SW_DWN` | **Sunshine Energy** | Sunlight reaching your field; it drives crop growth and daily water use. |
| `SRTM Slope` | **Erosion Slope Risk** | How steep your field is. Steep + bare + heavy rain washes topsoil away. |
| `MODIS NDVI` | **Green Cover Score** | How green your land looks from space. Below 0.3 is mostly bare soil. |
| `Crop Family` | **Pest Family** | Corn, rice, and sorghum are grasses and share pests such as fall armyworm. A bean crop breaks their cycle. |

### B. Limitations & Local Review Box Copy (`LimitationsBox`)
> **Know the Limits & Confirm Locally:** NASA POWER weather is averaged over a regional grid cell roughly 50–70 km across. MODIS greenness is 250 m per pixel and mixes several small farms. SRTM terrain elevation dates from 2000. Soil Thirst comes from a land-surface model (MERRA-2), not an in-ground sensor. Crop numbers are general regional baselines, not variety-specific, and farmgate prices change. **Next Step:** Test your field's soil pH and nutrients at a Department of Agriculture (DA) regional soils laboratory, and review any rotation plan with your Municipal Agriculturist before switching crops. *Mikazuki Fields supports farmer judgment—it does not replace it.*

---

## 3. Hour-by-Hour Execution Schedule & 6 Gates

| Gate / Window | Person 1 (Data + API + Pitch) | Person 2 (Model + Optimizer) | Person 3 (Frontend + UI) |
| :--- | :--- | :--- | :--- |
| **H0 – H4 (`Gate 1: Contract Frozen`)** | Pull NASA POWER for Bukidnon, Davao, Isabela; commit `FarmContext` JSON schema. | Commit `crop_library.json`; write Hargreaves $ET_0$ & single-season step math. | Scaffold React/Vite/Tailwind repo; commit mock API JSON; wireframe 4 regions. |
| **H4 – H12 (`Gate 2: Thin Slice`)** | Pull SRTM slope + MODIS NDVI windows; serve Bukidnon preset from FastAPI. | Vectorize simulator across `(262144, 6)` NumPy array; return Plans A, B, C. | Build Left Sidebar, Leaflet map, Top Banner with tooltips; render 3 columns from API. |
| **H12 – H18 (Pre-Sleep Push)** | Validate El Niño shock against 2015–16 / 2023–24 data; wire ground-truth overrides. | Add hard feasibility filters, sub-score scaling, and pass all 6 `pytest` sanity checks. | Build `PlanColumn` season cells, `PestBrokenBadge` connectors, and `BareMonthFlag` UI. |
| **H18 – H24 (`Gate 3: MVP` + Staggered Sleep)** | Sleep window + finish custom map pin live POWER fetch with disk cache. | Sleep window + build deterministic *"Why this route"* template generator & 8-window stability check. | Sleep window + wire instant `ElNinoToggle` state switch and `LimitationsBox`. |
| **H24 – H36 (`Gate 4: Feature Freeze`)** | Deploy FastAPI to Render/Railway; export `fallback_plans.json` to frontend; draft slide deck. | Calibrate crop/urea parameters so Bukidnon, Davao, and Isabela tell distinct stories. | Add `Recharts` (Soil N line + Profit bars with El Niño ghost bars), mobile tabs, and UI polish. |
| **H36 – H46 (`Gates 5 & 6: Video & Submit`)** | Record 30-sec demo video / finalize 7-slide deck; write NASA data credits & submit portal page. | Run final QA bug bash on slider/override edge cases; keep API warm. | Freeze UI code; deploy to Vercel/Netlify; verify offline static JSON fallback works. |

---

## 4. Strict Cut List (If Behind at Hour 24)
Apply cuts in this exact order if any lane slips past Gate 3:
1. **Cut live NASA POWER fetching for custom map pins** (restrict map selection to the 3 pre-cached Philippine farm regions).
2. **Cut the 8-window historical stability replay** (report single 3-year total profit and worst-season profit instead).
3. **Cut the bottom Recharts graphs** (rely on the KPI summary strips and El Niño `%` delta chips at the top of each Plan column).
* **NEVER CUT:** `ElNinoToggle`, `PestBrokenBadge`, `BareMonthFlag`, `JargonTooltip`, `GroundTruthDrawer`, or `LimitationsBox`.