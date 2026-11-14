import type { PlanRequest, PlansResponse, Preset } from "../types";
import { planRoutes } from "../engine/plans";

/**
 * Asks the FastAPI backend first (POST /api/plans, proxied to :8000 by Vite).
 * If it is not running, falls back to the in-browser demo planner, which follows
 * the engine spec, so the UI always has numbers to show.
 * The backend should answer with the PlansResponse shape in src/types.ts.
 */
let apiDown = false; // after one failed call, stop asking for the rest of the session

export async function fetchPlans(req: PlanRequest, preset: Preset): Promise<PlansResponse> {
  if (!apiDown) try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 2500);
    const res = await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: ctl.signal,
    });
    clearTimeout(timer);
    if (res.ok) return { ...(await res.json()), source: "api" } as PlansResponse;
    apiDown = true;
  } catch {
    // Backend not running yet: use the demo planner below.
    apiDown = true;
  }
  // Let the "Planning…" state paint before the ~0.5 s search blocks the thread.
  await new Promise((r) => setTimeout(r, 30));
  return planRoutes(req, preset);
}
