# Mikazuki Fields — frontend (UI draft)

React + Vite + TypeScript + Tailwind v4, built from [`docs/UI_STYLE_GUIDE.md`](../docs/UI_STYLE_GUIDE.md) and [`docs/frontend_spec.md`](../docs/frontend_spec.md).

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

## What works

- All 4 regions: **Your farm** sidebar (Leaflet map, presets, soil, water, goal, 3 priority sliders, ground-truth drawer), **What NASA sees** banner with tap-to-open plain-English tooltips, **Compare 3 routes** with the El Niño toggle, Pest Cycle Broken and Bare-Soil badges, KPI strips, "Why this route" bullets and charts, and the **limitations** box.
- Phone layout: the farm card collapses after planning, NASA chips scroll sideways, plans become A / B / C tabs (no horizontal page scroll at 375 px).
- First-run language picker (English only for now; other languages fall back to English).

## Where the numbers come from

- `src/api/client.ts` calls `POST /api/plans` (proxied to the FastAPI backend on `:8000`). It expects the `PlansResponse` shape in `src/types.ts`.
- Until the backend runs, it falls back to `src/engine/`, a TypeScript port of `docs/agronomic_model_vectorized_optimizer_spec.md` (season step + exhaustive search over 262,144 rotations, about 0.4 s in the browser). The header shows a **Demo planner** badge when this is in use. The backend stays the source of truth.
- `src/data/presets.json` holds real NASA POWER monthly averages (2015–2024) for the 3 preset farms, made by `scripts/fetch_mock_climate.py`. **Slope and NDVI are sample values** (marked in the UI) until Person 1's SRTM and MODIS pulls land; replace the file with the data-prep presets then.

## Known gaps

- The bundle is about 850 kB (Recharts + Leaflet); code-split the charts before deploying.
- Recharts 2.15 is used for its stable API; it is out of active support, so plan a move to v3 after the hackathon.
- shadcn/ui is not initialised yet; components are hand-built on the same token names, so `npx shadcn@latest init` can be added later.
