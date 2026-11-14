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
2. **Target**: you sit in the cockpit. The canopy frame, heading tape and altitude ladder move against the map for depth, the suit idles in the air, and the data panels are angled on the glass. **Tap anywhere in the Philippines**: `src/api/power.ts` fetches live NASA POWER monthly data for that point (2015–2024) and falls back to the nearest preset if the request fails. The 3 preset farms are still on the map.
3. **Descend**: lock the target and the suit flies down to it (speed streaks, faster instruments) while the routes are computed.
4. **Plants**: the only part that scrolls. Pick route A, B or C, or **build your own** 6-season rotation (pest-break markers between seasons). Farm settings (soil, water, goal, soil test, pests, priorities) re-plan the routes.
5. **Field**: a WebGL field (`src/three/plantScene.ts`) plants itself season by season with 3D corn, legumes and sweet potato while a drone hovers over each plot; then the field-data panel slides in. The dry-spell switch wilts the crops it hurts. Drag to look around; change plants or pick a new farm.

- First-run language picker (English only for now; other languages fall back to English).
- Phone layout: HUD panels stack at the bottom, the field data sits under the 3D view, no horizontal scroll at 390 px.

## Where the numbers come from

- `src/api/client.ts` calls `POST /api/plans` (proxied to the FastAPI backend on `:8000`). It expects the `PlansResponse` shape in `src/types.ts`.
- Until the backend runs, it falls back to `src/engine/`, a TypeScript port of `docs/agronomic_model_vectorized_optimizer_spec.md` (season step + exhaustive search over 262,144 rotations, about 0.4 s in the browser). The header shows a **Demo planner** badge when this is in use. The backend stays the source of truth.
- A tapped point gets live NASA POWER data in the browser (POWER allows cross-origin requests). Its slope and NDVI are borrowed from the nearest preset and marked as samples.
- `src/data/presets.json` holds real NASA POWER monthly averages (2015–2024) for the 3 preset farms, made by `scripts/fetch_mock_climate.py`. **Slope and NDVI are sample values** (marked in the UI) until Person 1's SRTM and MODIS pulls land; replace the file with the data-prep presets then.

## Known gaps

- three.js loads in separate chunks only when WebGL is available; without WebGL (or with reduced motion) the tiles fall back to a flat grid and the field shows its data only.
- shadcn/ui is not initialised yet; components are hand-built on the same token names, so `npx shadcn@latest init` can be added later.
