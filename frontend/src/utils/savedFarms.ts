import type { PlanRequest, Preset, Scenario } from "../types";

export const SAVED_FARMS_KEY = "mf-saved-farms";
export const MAX_SAVED_FARMS = 8;

export interface SavedCoord {
  lat: number;
  lon: number;
}

export interface SavedFarm {
  id: string;
  label: string;
  target: Preset;
  req: PlanRequest;
  boundary: SavedCoord[];
  scenario: Scenario;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

let seq = 0;

function resolveStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage !== undefined) return storage;
  try {
    return typeof globalThis !== "undefined" && "localStorage" in globalThis
      ? (globalThis.localStorage as StorageLike)
      : null;
  } catch {
    return null;
  }
}

function writeSavedFarms(farms: SavedFarm[], storage?: StorageLike | null): SavedFarm[] {
  const capped = farms.slice(-MAX_SAVED_FARMS);
  const store = resolveStorage(storage);
  if (store) {
    try {
      store.setItem(SAVED_FARMS_KEY, JSON.stringify(capped));
    } catch {
      // Ignore quota / private-mode storage errors so UI state still works cleanly.
    }
  }
  return capped;
}

function isCoord(p: unknown): p is SavedCoord {
  if (!p || typeof p !== "object") return false;
  const c = p as { lat?: unknown; lon?: unknown };
  return typeof c.lat === "number" && Number.isFinite(c.lat) && typeof c.lon === "number" && Number.isFinite(c.lon);
}

function isSavedFarm(v: unknown): v is SavedFarm {
  if (!v || typeof v !== "object") return false;
  const x = v as Partial<SavedFarm>;
  return (
    typeof x.id === "string" &&
    x.id.length > 0 &&
    typeof x.label === "string" &&
    x.label.length > 0 &&
    typeof x.target?.id === "string" &&
    Boolean(x.target.seasons?.dry) &&
    Boolean(x.req?.weights)
  );
}

export function loadSavedFarms(storage?: StorageLike | null): SavedFarm[] {
  const store = resolveStorage(storage);
  if (!store) return [];
  try {
    const raw = JSON.parse(store.getItem(SAVED_FARMS_KEY) ?? "null") as unknown;
    if (!Array.isArray(raw)) return [];
    const valid: SavedFarm[] = [];
    for (const item of raw) {
      if (!isSavedFarm(item)) continue;
      valid.push({
        id: item.id,
        label: item.label.trim() || "Farm",
        target: item.target,
        req: { ...item.req, landSizeHa: item.req.landSizeHa ?? 1 },
        boundary: Array.isArray(item.boundary)
          ? item.boundary.filter(isCoord).map((p) => ({ lat: p.lat, lon: p.lon }))
          : [],
        scenario: item.scenario === "elnino" ? "elnino" : "normal",
      });
    }
    return valid.slice(-MAX_SAVED_FARMS);
  } catch {
    return [];
  }
}

export function nextFarmLabel(farms: readonly Pick<SavedFarm, "label">[]): string {
  const used = new Set(farms.map((f) => f.label.trim().toLowerCase()));
  let n = 1;
  while (used.has(`farm ${n}`)) n++;
  return `Farm ${n}`;
}

export function saveFarmPlot(
  input: Omit<SavedFarm, "id" | "label"> & { label?: string },
  storage?: StorageLike | null,
): { farms: SavedFarm[]; saved: SavedFarm } {
  const existing = loadSavedFarms(storage);
  const label = input.label?.trim() || nextFarmLabel(existing);
  const saved: SavedFarm = {
    id: `farm-${Date.now().toString(36)}-${(++seq).toString(36)}`,
    label,
    target: input.target,
    req: { ...input.req, weights: { ...input.req.weights }, overrides: { ...input.req.overrides } },
    boundary: input.boundary.map((p) => ({ lat: p.lat, lon: p.lon })),
    scenario: input.scenario === "elnino" ? "elnino" : "normal",
  };
  const farms = writeSavedFarms([...existing, saved], storage);
  return { farms, saved };
}

export function updateSavedFarm(
  id: string,
  input: Omit<SavedFarm, "id" | "label"> & { label?: string },
  storage?: StorageLike | null,
): { farms: SavedFarm[]; saved: SavedFarm | null } {
  const existing = loadSavedFarms(storage);
  const current = existing.find((f) => f.id === id);
  if (!current) return { farms: existing, saved: null };
  const saved: SavedFarm = {
    id,
    label: input.label?.trim() || current.label,
    target: input.target,
    req: { ...input.req, weights: { ...input.req.weights }, overrides: { ...input.req.overrides } },
    boundary: input.boundary.map((p) => ({ lat: p.lat, lon: p.lon })),
    scenario: input.scenario === "elnino" ? "elnino" : "normal",
  };
  const farms = writeSavedFarms(
    existing.map((f) => (f.id === id ? saved : f)),
    storage,
  );
  return { farms, saved };
}

export function renameSavedFarm(id: string, label: string, storage?: StorageLike | null): SavedFarm[] {
  const clean = label.trim();
  const existing = loadSavedFarms(storage);
  if (!clean) return existing;
  const next = existing.map((f) => (f.id === id ? { ...f, label: clean } : f));
  return writeSavedFarms(next, storage);
}

export function deleteSavedFarm(id: string, storage?: StorageLike | null): SavedFarm[] {
  const existing = loadSavedFarms(storage);
  return writeSavedFarms(
    existing.filter((f) => f.id !== id),
    storage,
  );
}

function samePlanRequest(a: PlanRequest, b: PlanRequest): boolean {
  const ao = a.overrides;
  const bo = b.overrides;
  const aExcl = ao.excludedCrops ?? [];
  const bExcl = bo.excludedCrops ?? [];
  return (
    a.baselineCrop === b.baselineCrop &&
    a.soil === b.soil &&
    a.irrigation === b.irrigation &&
    a.goal === b.goal &&
    Math.abs(a.landSizeHa - b.landSizeHa) < 1e-6 &&
    a.weights.water === b.weights.water &&
    a.weights.soil === b.weights.soil &&
    a.weights.econ === b.weights.econ &&
    ao.soilTestN === bo.soilTestN &&
    ao.soilPh === bo.soilPh &&
    ao.pestLastSeason === bo.pestLastSeason &&
    ao.floods === bo.floods &&
    (ao.maxBudgetPhp ?? null) === (bo.maxBudgetPhp ?? null) &&
    Boolean(ao.mustIncludeStaple) === Boolean(bo.mustIncludeStaple) &&
    (ao.lastHarvestYieldTHa ?? null) === (bo.lastHarvestYieldTHa ?? null) &&
    aExcl.length === bExcl.length &&
    aExcl.every((c, i) => c === bExcl[i])
  );
}

export interface FarmDraft {
  target: Preset;
  req: PlanRequest;
  boundary: readonly SavedCoord[];
  scenario: Scenario;
  label: string;
}

/** True when the active workspace has unsaved edits or diverges from its active saved farm record. */
export function isFarmDirty(draft: FarmDraft, activeSaved: SavedFarm | null, dirtyEdits: boolean): boolean {
  const cleanLabel = draft.label.trim();
  if (!activeSaved) {
    return dirtyEdits || draft.boundary.length >= 3 || cleanLabel.length > 0;
  }
  if (cleanLabel !== activeSaved.label || draft.scenario !== activeSaved.scenario) return true;
  if (
    draft.target.id !== activeSaved.target.id ||
    Math.abs(draft.target.lat - activeSaved.target.lat) > 1e-6 ||
    Math.abs(draft.target.lon - activeSaved.target.lon) > 1e-6
  ) {
    return true;
  }
  if (draft.boundary.length !== activeSaved.boundary.length) return true;
  for (let i = 0; i < draft.boundary.length; i++) {
    if (
      Math.abs(draft.boundary[i].lat - activeSaved.boundary[i].lat) > 1e-6 ||
      Math.abs(draft.boundary[i].lon - activeSaved.boundary[i].lon) > 1e-6
    ) {
      return true;
    }
  }
  return !samePlanRequest(draft.req, activeSaved.req);
}
