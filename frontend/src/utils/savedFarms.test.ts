import { test } from "node:test";
import assert from "node:assert/strict";
import type { PlanRequest, Preset } from "../types";
import {
  MAX_SAVED_FARMS,
  SAVED_FARMS_KEY,
  deleteSavedFarm,
  isFarmDirty,
  loadSavedFarms,
  nextFarmLabel,
  renameSavedFarm,
  saveFarmPlot,
  updateSavedFarm,
  type StorageLike,
} from "./savedFarms.ts";

function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

const SAMPLE_PRESET: Preset = {
  id: "ilocos-1",
  name: "Ilocos Norte",
  region: "Region I",
  lat: 18.2,
  lon: 120.6,
  elevation_m: 18,
  slope_deg: 3.1,
  slope_pct: 5.4,
  soil_texture: "loam",
  ndvi_dry: 0.42,
  ndvi_wet: 0.68,
  placeholders: [],
  seasons: {
    dry: { rain_mm: 240, et0_mm: 760, tmean_c: 28, tmax_c: 32, wet_months: 1, rain_total_mm: 240 },
    wet: { rain_mm: 1620, et0_mm: 590, tmean_c: 27, tmax_c: 31, wet_months: 5, rain_total_mm: 1620 },
  },
};

const SAMPLE_REQ: PlanRequest = {
  presetId: "ilocos-1",
  landSizeHa: 2.5,
  irrigation: "rainfed",
  weights: { water: 30, soil: 35, econ: 35 },
  overrides: { soilN: null, soilPh: null, soilTexture: null, lastYieldTha: null, fertilizerBudget: null, excludedCrops: [] },
};

test("savedFarms saves, loads, renames, deletes, and auto-numbers plots", () => {
  const store = memoryStorage();
  assert.deepEqual(loadSavedFarms(store), []);
  assert.equal(nextFarmLabel([]), "Farm 1");

  const first = saveFarmPlot(
    { target: SAMPLE_PRESET, req: SAMPLE_REQ, boundary: [{ lat: 18.2, lon: 120.6 }], scenario: "normal" },
    store,
  );
  assert.equal(first.saved.label, "Farm 1");

  const second = saveFarmPlot(
    { label: "  North Plot  ", target: SAMPLE_PRESET, req: SAMPLE_REQ, boundary: [], scenario: "elnino" },
    store,
  );
  assert.equal(second.saved.label, "North Plot");
  assert.equal(second.farms.length, 2);

  const third = saveFarmPlot(
    { target: SAMPLE_PRESET, req: SAMPLE_REQ, boundary: [], scenario: "normal" },
    store,
  );
  assert.equal(third.saved.label, "Farm 2");

  const renamed = renameSavedFarm(first.saved.id, "Riverbed", store);
  assert.equal(renamed.find((f) => f.id === first.saved.id)?.label, "Riverbed");

  const emptyRename = renameSavedFarm(first.saved.id, "   ", store);
  assert.equal(emptyRename.find((f) => f.id === first.saved.id)?.label, "Riverbed");

  const updated = updateSavedFarm(
    first.saved.id,
    { label: "North Paddy", target: SAMPLE_PRESET, req: { ...SAMPLE_REQ, landSizeHa: 4 }, boundary: [], scenario: "elnino" },
    store,
  );
  assert.equal(updated.saved?.label, "North Paddy");
  assert.equal(updated.saved?.req.landSizeHa, 4);
  assert.equal(updated.saved?.scenario, "elnino");

  const afterDelete = deleteSavedFarm(second.saved.id, store);
  assert.equal(afterDelete.length, 2);
  assert.equal(loadSavedFarms(store).length, 2);
});

test("savedFarms enforces MAX_SAVED_FARMS cap of 8", () => {
  const store = memoryStorage();
  for (let i = 1; i <= MAX_SAVED_FARMS + 3; i++) {
    saveFarmPlot(
      { label: `Plot ${i}`, target: SAMPLE_PRESET, req: SAMPLE_REQ, boundary: [], scenario: "normal" },
      store,
    );
  }
  const loaded = loadSavedFarms(store);
  assert.equal(loaded.length, MAX_SAVED_FARMS);
  assert.equal(loaded[0].label, "Plot 4");
  assert.equal(loaded[loaded.length - 1].label, `Plot ${MAX_SAVED_FARMS + 3}`);
});

test("savedFarms recovers cleanly from corrupt JSON and throwing storage", () => {
  const corrupt = memoryStorage({ [SAVED_FARMS_KEY]: "{not-valid-json" });
  assert.deepEqual(loadSavedFarms(corrupt), []);

  const throwing: StorageLike = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("quota exceeded");
    },
  };
  assert.deepEqual(loadSavedFarms(throwing), []);
  const res = saveFarmPlot(
    { target: SAMPLE_PRESET, req: SAMPLE_REQ, boundary: [], scenario: "normal" },
    throwing,
  );
  assert.equal(res.saved.label, "Farm 1");
  assert.equal(res.farms.length, 1);
});

test("multi-farm updates keep sibling plots intact and isFarmDirty detects divergence", () => {
  const store = memoryStorage();
  const plotA = saveFarmPlot(
    { label: "North Paddy", target: SAMPLE_PRESET, req: SAMPLE_REQ, boundary: [], scenario: "normal" },
    store,
  );
  const plotB = saveFarmPlot(
    { label: "South Corn", target: { ...SAMPLE_PRESET, id: "pin-18.3,120.7", lat: 18.3, lon: 120.7 }, req: SAMPLE_REQ, boundary: [], scenario: "elnino" },
    store,
  );
  const renamed = renameSavedFarm(plotA.saved.id, "East Paddy", store);
  assert.equal(renamed.find((f) => f.id === plotB.saved.id)?.label, "South Corn");
  assert.equal(renamed.find((f) => f.id === plotB.saved.id)?.scenario, "elnino");

  const active = renamed.find((f) => f.id === plotA.saved.id)!;
  assert.equal(isFarmDirty({ target: active.target, req: active.req, boundary: [], scenario: "normal", label: "East Paddy" }, active, false), false);
  assert.equal(isFarmDirty({ target: active.target, req: active.req, boundary: [], scenario: "normal", label: "Renamed Draft" }, active, false), true);
  assert.equal(isFarmDirty({ target: active.target, req: { ...active.req, landSizeHa: 4 }, boundary: [], scenario: "normal", label: "East Paddy" }, active, false), true);
  assert.equal(isFarmDirty({ target: SAMPLE_PRESET, req: SAMPLE_REQ, boundary: [], scenario: "normal", label: "" }, null, false), false);
  assert.equal(isFarmDirty({ target: SAMPLE_PRESET, req: SAMPLE_REQ, boundary: [], scenario: "normal", label: "" }, null, true), true);
  assert.equal(isFarmDirty({ target: SAMPLE_PRESET, req: SAMPLE_REQ, boundary: [{ lat: 1, lon: 1 }, { lat: 1, lon: 2 }, { lat: 2, lon: 1 }], scenario: "normal", label: "" }, null, false), true);
});
