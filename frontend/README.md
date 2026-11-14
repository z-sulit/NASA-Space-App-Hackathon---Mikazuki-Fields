# Mikazuki Fields — frontend (UI draft)

React + Vite + TypeScript + Tailwind v4, built from [`docs/UI_STYLE_GUIDE.md`](../docs/UI_STYLE_GUIDE.md) and [`docs/frontend_spec.md`](../docs/frontend_spec.md).

**Live preview:** https://z-sulit.github.io/NASA-Space-App-Hackathon---Mikazuki-Fields/ (served from the `gh-pages` branch; add `?lang=en` to skip the language picker).

To redeploy the preview: `npx vite build --base=./`, then push the contents of `dist/` to the `gh-pages` branch.

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

## What works

One screen, no page scroll: the app is a 5-step mission (`src/components/mission/`, from the team sketch). A step rail at the bottom shows where you are.

1. **Start**: an interactive WebGL field of green tiles (`src/three/tileField.ts`). Tiles light up, rise and send out a ripple under the pointer; tap to plant a patch. The loading bar becomes START.
2. **Target**: you sit in the cockpit. The canopy frame, heading tape and altitude ladder move against the map for depth, the suit idles in the air, and the data panels are angled on the glass. **Tap anywhere in the Philippines**: the backend fetches live NASA POWER data for that point (or, without the backend, the browser asks NASA POWER directly), with the nearest preset as a last resort. The 3 preset farms are still on the map.
3. **Descend**: lock the target and the suit flies down to it (speed streaks, faster instruments) while the routes are computed.
4. **Plants**: the only part that scrolls. Pick route A, B or C, or **build your own** 6-season rotation (pest-break markers between seasons). Farm settings (soil, water, goal, soil test, pests, priorities) re-plan the routes.
5. **Field**: a WebGL field (`src/three/plantScene.ts`) plants itself season by season with 3D corn, legumes and sweet potato while a drone hovers over each plot; then the field-data panel slides in. The dry-spell switch wilts the crops it hurts. Drag to look around; change plants or pick a new farm.

- First-run language picker (English only for now; other languages fall back to English).
- Phone layout: HUD panels stack at the bottom, the field data sits under the 3D view, no horizontal scroll at 390 px.

## Where the numbers come from

The app talks to the FastAPI backend in `backend/` (contract: `backend/app/schemas.py`) through one adapter, `src/api/backend.ts`. `src/api/client.ts` picks the source, in this order:

1. **Mikazuki API.** `GET /api/farm?preset_id=…` gives each preset farm its measured data (NASA POWER, SRTM 30 m slope, MODIS NDVI). `GET /api/farm?lat=…&lon=…` gives a tapped point live NASA POWER climate (the backend caches it). `POST /api/plans` returns Plans A, B and C for normal and El Niño years.
2. **Offline bundle.** If the API cannot be reached, a preset farm with the default settings uses `public/fallback_plans.json` (made by `data-prep/export_fallback.py`). The preset farms' measured data also comes from this file.
3. **In-browser planner.** Anything else (a tapped point, other settings, a hand-built rotation) runs `src/engine/`, a TypeScript port of the same engine spec, in a Web Worker. A tapped point then gets NASA POWER straight from the browser (`src/api/power.ts`).

The field panel says which source made the plans you are looking at. A hand-built rotation is always simulated in the browser, because the API only returns Plans A, B and C.

**Where the API is:**

- Local: run the backend on `:8000` (`uvicorn backend.app.main:app --reload --port 8000` from the repo root). `npm run dev` proxies `/api` to it.
- Vercel: `vercel.json` sends `/api/*` to `api/index.py` on the same domain, so no setting is needed.
- Anywhere else (Render, Railway): build with `VITE_API_BASE=https://your-api.example.com npm run build`. The API already allows cross-origin requests.
- GitHub Pages has no backend, so the preview runs on the offline bundle and the in-browser planner.

`src/data/presets.json` is the app's own copy of the 3 preset farms (NASA POWER monthly averages, from `scripts/fetch_mock_climate.py`). It shows until the API or the bundle answers, and supplies the monthly rain and 2015–16 El Niño figure the API does not send.

## Known gaps

- three.js loads in separate chunks only when WebGL is available; without WebGL (or with reduced motion) the tiles fall back to a flat grid and the field shows its data only.
- shadcn/ui is not initialised yet; components are hand-built on the same token names, so `npx shadcn@latest init` can be added later.
