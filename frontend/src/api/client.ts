import type { PlanRequest, PlansResponse, Preset } from "../types";
import { planRoutes } from "../engine/plans";

/**
 * Asks the FastAPI backend first (POST /api/plans, proxied to :8000 by Vite).
 * If it is not running, falls back to the in-browser demo planner, which follows
 * the engine spec, so the UI always has numbers to show.
 * The backend should answer with the PlansResponse shape in src/types.ts.
 */
let apiDown = false; // after one failed call, stop asking for the rest of the session

// The demo planner runs in a Web Worker so animations keep running while it searches.
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
  return demoPlan(req, preset);
}
