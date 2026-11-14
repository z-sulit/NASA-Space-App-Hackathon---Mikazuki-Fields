import type { PlanRequest, PlansResponse, Preset } from "../types";
import { planRoutes } from "../engine/plans";
import { apiFarm, apiPlans, fallbackBundle, farmToPreset, fromBackendPlans, toBackendRequest } from "./backend";
import { fetchPointPreset } from "./power";

/**
 * Where the numbers come from, in order:
 *  1. The Mikazuki FastAPI backend (POST /api/plans, GET /api/farm). See ./backend.ts.
 *  2. Its offline bundle, frontend/public/fallback_plans.json, for a preset farm with
 *     the default settings it was exported with.
 *  3. The in-browser planner (src/engine, same engine spec) in a Web Worker, so the
 *     app still works on a static host such as GitHub Pages.
 * Every call tries the API first; a failure only falls back for that one call.
 */

export type DataSource = PlansResponse["source"];

// ---------- In-browser planner (Web Worker) ----------

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 0;
const waiting = new Map<number, { resolve: (r: PlansResponse) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker || workerBroken) return worker;
  try {
    worker = new Worker(new URL("../engine/planWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; result?: PlansResponse; error?: string }>) => {
      const job = waiting.get(e.data.id);
      if (!job) return;
      waiting.delete(e.data.id);
      if (e.data.result) job.resolve(e.data.result);
      else job.reject(new Error(e.data.error ?? "Planning failed."));
    };
    worker.onerror = () => {
      // Could not start (old browser, blocked): plan on the main thread instead.
      workerBroken = true;
      worker = null;
      waiting.forEach((job) => job.reject(new Error("worker failed")));
      waiting.clear();
    };
  } catch {
    workerBroken = true;
    worker = null;
  }
  return worker;
}

function demoPlan(req: PlanRequest, preset: Preset): Promise<PlansResponse> {
  const w = getWorker();
  if (!w) return new Promise((r) => setTimeout(() => r(planRoutes(req, preset)), 30));
  const id = ++nextId;
  return new Promise<PlansResponse>((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    w.postMessage({ id, req, preset });
  }).catch(() => planRoutes(req, preset));
}

// ---------- Offline bundle ----------

/** The settings data-prep/export_fallback.py used, so bundled plans only answer the same question. */
function matchesBundle(req: PlanRequest) {
  const o = req.overrides;
  return (
    req.soil === "loam" &&
    req.irrigation === "rainfed" &&
    req.goal === "cash" &&
    req.baselineCrop === "corn" &&
    req.weights.water === 40 &&
    req.weights.soil === 35 &&
    req.weights.econ === 25 &&
    o.soilTestN === "untested" &&
    o.soilPh === null &&
    !o.pestLastSeason &&
    o.floods === "never"
  );
}

// ---------- Public ----------

export async function fetchPlans(req: PlanRequest, preset: Preset): Promise<PlansResponse> {
  try {
    return fromBackendPlans(await apiPlans(toBackendRequest(req, preset)), req, "api");
  } catch {
    // Not running, a static host, or a transient timeout: fall back for this call only.
  }
  if (!preset.id.startsWith("pin-") && matchesBundle(req)) {
    const plans = (await fallbackBundle())?.plans[preset.id];
    if (plans) return fromBackendPlans(plans, req, "bundle");
  }
  return demoPlan(req, preset);
}

/**
 * The preset farms with the backend's measured data (SRTM slope, MODIS NDVI, NASA POWER),
 * from the API or else the offline bundle. Falls back to the presets bundled in the app.
 */
export async function loadFarms(presets: Preset[]): Promise<{ presets: Preset[]; source: DataSource }> {
  try {
    const farms = await Promise.all(presets.map((p) => apiFarm({ presetId: p.id })));
    return { presets: farms.map((f, i) => farmToPreset(f, presets[i])), source: "api" };
  } catch {
    // fall through to the bundle for this call
  }
  const b = await fallbackBundle();
  if (b && presets.every((p) => b.farms[p.id])) return { presets: presets.map((p) => farmToPreset(b.farms[p.id], p)), source: "bundle" };
  return { presets, source: "demo" };
}

/**
 * Climate for any tapped point: the backend's live NASA POWER lookup (cached server-side),
 * or a direct POWER request from the browser, or the nearest preset as a last resort.
 */
export async function fetchPinFarm(lat: number, lon: number, presets: Preset[]): Promise<{ preset: Preset; live: boolean; via: "api" | "browser" | "nearest" }> {
  try {
    // The backend waits up to 10 s on NASA POWER itself.
    return { preset: farmToPreset(await apiFarm({ lat, lon }, 14000)), live: true, via: "api" };
  } catch {
    // fall through to the browser lookup for this pin only
  }
  const { preset, live } = await fetchPointPreset(lat, lon, presets);
  return { preset, live, via: live ? "browser" : "nearest" };
}
