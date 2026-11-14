/// <reference lib="webworker" />
/**
 * Runs the demo planner (exhaustive search over 8^6 rotations) off the main
 * thread, so the tiles, the cockpit and the descent never freeze while it works.
 */
import type { PlanRequest, Preset } from "../types";
import { planRoutes } from "./plans";

const ctx = self as unknown as DedicatedWorkerGlobalScope;
ctx.onmessage = (e: MessageEvent<{ id: number; req: PlanRequest; preset: Preset }>) => {
  const { id, req, preset } = e.data;
  try {
    ctx.postMessage({ id, result: planRoutes(req, preset) });
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
