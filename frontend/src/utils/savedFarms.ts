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
