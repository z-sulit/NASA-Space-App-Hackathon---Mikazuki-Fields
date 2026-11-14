# Mikazuki Fields — frontend (UI draft)

React + Vite + TypeScript + Tailwind v4, built from [`docs/UI_STYLE_GUIDE.md`](../docs/UI_STYLE_GUIDE.md) and [`docs/frontend_spec.md`](../docs/frontend_spec.md).

**Live preview:** https://z-sulit.github.io/NASA-Space-App-Hackathon---Mikazuki-Fields/ (served from the `gh-pages` branch; add `?lang=en` to skip the language picker).

To redeploy the preview: `npx vite build --base=./`, then push the contents of `dist/` to the `gh-pages` branch.

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm test           # money-text parser (Node's built-in test runner)
```

## What works

One screen, no page scroll: the app is a 5-step mission (`src/components/mission/`, from the team sketch). A step rail at the bottom shows where you are.

1. **Load**: an interactive WebGL field of green tiles (`src/three/tileField.ts`) with a loading bar while the first map tiles and routes load, then the app goes straight into the map (no start button).
2. **Target**: you sit in the cockpit. The canopy frame, heading tape and altitude ladder move against the map for depth, the suit idles in the air, and the data panels are angled on the glass. **Search a place by name, or tap anywhere in the Philippines**: search uses OpenStreetMap Nominatim (`src/api/geocode.ts`; on Enter, at most one request a second, per its usage policy) and feeds the point into the same tap flow. The backend fetches live NASA POWER data for that point (or, without the backend, the browser asks NASA POWER directly), with the nearest preset as a last resort. The 3 preset farms are still on the map.
3. **Descend**: lock the target and the suit flies down to it (speed streaks, faster instruments) while the routes are computed.
4. **Plants**: the only part that scrolls. Pick route A, B or C, or **build your own** 6-season rotation (pest-break markers between seasons). Farm settings (soil, water, goal, soil test, pests, priorities) re-plan the routes.
5. **Field**: a WebGL field (`src/three/plantScene.ts`) plants itself season by season with 3D corn, legumes and sweet potato while a drone hovers over each plot; then the field-data panel slides in. Route A / B / C / Yours tabs switch the plan in one tap and the beds regrow in place. The dry-spell switch wilts the crops it hurts. Drag to turn and tilt, pinch or scroll to zoom, double-click to reset; change plants or pick a new farm.

- Keyboard: Enter does each screen's main action (lock the farm, plant the route), Esc goes back a step, 1–4 pick a route (also on the field), E toggles El Niño. The last farm and settings are remembered in this browser.
- HUD panels (`src/components/mission/FloatPanel.tsx`): drag the bar to move (kept on screen), corner grip to resize (with minimum sizes), chevron to fold; double-click the bar to put it back. Arrow keys work on the grip and corner. On phones and tablets the field data is a bottom sheet: drag its handle to resize it.
- A tap just off the coast (within about 500 m) moves onto the nearest land; further out it is refused with "Try again".
- Phone and tablet layout: HUD panels stack above the step rail (target data starts folded on phones), the field data is a bottom sheet, every control is at least 44 px on touch screens, and nothing overflows at 360–430 px or 768–1024 px.

## Where the numbers come from

The app talks to the FastAPI backend in `backend/` (contract: `backend/app/schemas.py`) through one adapter, `src/api/backend.ts`. `src/api/client.ts` picks the source, in this order:

1. **Mikazuki API.** `GET /api/farm?preset_id=…` gives each preset farm its measured data (NASA POWER, SRTM 30 m slope, MODIS NDVI). `GET /api/farm?lat=…&lon=…` gives a tapped point live NASA POWER climate (the backend caches it). `POST /api/plans` returns Plans A, B and C for normal and El Niño years.
2. **Offline bundle.** If the API cannot be reached, a preset farm with the default settings uses `public/fallback_plans.json` (made by `data-prep/export_fallback.py`). The preset farms' measured data also comes from this file.
3. **In-browser planner.** Anything else (a tapped point, other settings, a hand-built rotation) runs `src/engine/`, a TypeScript port of the same engine spec, in a Web Worker. A tapped point then gets NASA POWER straight from the browser (`src/api/power.ts`).

The field panel says which source made the plans you are looking at. **El Niño** replays each farm's real Jun 2015–May 2016 NASA POWER months (`climate.elnino`, `elnino_basis: "observed_2015_2016"`), and water is balanced month by month while a crop is in the ground, so an in-season dry spell counts. With El Niño on, the field panel lists what changed for the route (profit, which seasons lost yield, the short months) or, when nothing changed, the tightest month and closest heat call that show why. A hand-built rotation is always simulated in the browser, because the API only returns Plans A, B and C.

**Where the API is:**

- Local: run the backend on `:8000` (`uvicorn backend.app.main:app --reload --port 8000` from the repo root). `npm run dev` proxies `/api` to it.
- Vercel: `vercel.json` sends `/api/*` to `api/index.py` on the same domain, so no setting is needed.
- Anywhere else (Render, Railway): build with `VITE_API_BASE=https://your-api.example.com npm run build`. The API already allows cross-origin requests.
- GitHub Pages has no backend, so the preview runs on the offline bundle and the in-browser planner.

`src/data/presets.json` is the app's own copy of the 3 preset farms (NASA POWER monthly averages, from `scripts/fetch_mock_climate.py`). It shows until the API or the bundle answers, and supplies the monthly rain and 2015–16 El Niño figure the API does not send.

## Known gaps

- three.js loads in separate chunks only when WebGL is available; without WebGL (or with reduced motion) the tiles fall back to a flat grid and the field shows its data only.
- shadcn/ui is not initialised yet; components are hand-built on the same token names, so `npx shadcn@latest init` can be added later.
