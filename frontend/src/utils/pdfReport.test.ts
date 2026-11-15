import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

// Node ESM requires explicit extensions; resolve extensionless local TS imports for pdfReport.ts.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z0-9]+$/i.test(specifier) && context.parentURL?.startsWith("file:")) {
      const tsUrl = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(tsUrl))) return nextResolve(tsUrl.href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { seasonWindows } = await import("../data/calendar.ts");
const { buildFieldReportPdf } = await import("./pdfReport.ts");
const { seasonAlerts } = await import("./seasonAlerts.ts");
import type { PlanRequest, PlanResult, Preset, SeasonResult } from "../types.ts";

function makeSeason(index: number, overrides: Partial<SeasonResult> = {}): SeasonResult {
  return {
    index,
    kind: index % 2 === 0 ? "wet" : "dry",
    label: `S${index + 1}`,
    crop: index % 2 === 0 ? "corn" : "mungbean",
    nStart: 42,
    nEnd: 38,
    demandMm: 450,
    gapMm: 0,
    pumpedMm: 0,
    waterLoss: 0,
    heatLoss: 0,
    pest: 0.05,
    pestBroken: index > 0,
    erosion: 0.1,
    bareMonths: [],
    coveredMonths: 4,
    yieldT: 4.5,
    ureaCost: 3500,
    pumpCost: 0,
    profit: 42000,
    ...overrides,
  };
}

test("seasonAlerts classifies net loss and unmet drought wilt without false-positiving on irrigated fields", () => {
  assert.deepEqual(seasonAlerts({ profit: 25000, gapMm: 40, pumpedMm: 0, waterLoss: 0.1 }), {
    netLoss: false,
    wiltRisk: false,
    unmetGapMm: 40,
    severe: false,
  });
  assert.deepEqual(seasonAlerts({ profit: -14500, gapMm: 165, pumpedMm: 0, waterLoss: 0.42 }), {
    netLoss: true,
    wiltRisk: true,
    unmetGapMm: 165,
    severe: true,
  });
  assert.deepEqual(seasonAlerts({ profit: 30000, gapMm: 180, pumpedMm: 180, waterLoss: 0 }), {
    netLoss: false,
    wiltRisk: false,
    unmetGapMm: 0,
    severe: false,
  });
});

test("buildFieldReportPdf wraps long names/metadata and highlights wilt and net-loss seasons", () => {
  const climateSeason = {
    label: "Season",
    rain_mm: 920,
    monthly_rain_mm: [140, 160, 180, 160, 150, 130],
    t2m_c: 27.5,
    tmax_c: 32.8,
    allsky_mj: 18.2,
    gwetroot: 0.62,
    et0_mm_day: 4.3,
  };
  const target: Preset = {
    id: "pin-16.95,121.88",
    name: "Barangay San Antonio de Padua North Extension, Municipality of Ilagan, Isabela Province",
    lat: 16.95,
    lon: 121.88,
    seasons: { wet: climateSeason, dry: { ...climateSeason, rain_mm: 240, tmax_c: 35.1 } },
    elnino_basis: "synthetic",
    elnino_2016_dry_rain_pct: -25,
    slope_pct: 3.4,
    elevation_m: 125,
    ndvi_dry_min: 0.44,
    placeholders: [],
    source: "Live NASA POWER",
  };
  const req: PlanRequest = {
    presetId: target.id,
    baselineCrop: "corn",
    soil: "clay_loam",
    irrigation: "rainfed",
    goal: "cash",
    landSizeHa: 2.5,
    weights: { water: 0.34, soil: 0.33, econ: 0.33 },
    overrides: { soilTestN: "medium", soilPh: 6.1, pestLastSeason: false, floods: "never" },
  };
  const seasons = [
    makeSeason(0),
    makeSeason(1, { crop: "corn", gapMm: 155, waterLoss: 0.48, yieldT: 1.1, profit: -18400 }),
    makeSeason(2),
    makeSeason(3, { gapMm: 130, waterLoss: 0.36, profit: -4200 }),
    makeSeason(4),
    makeSeason(5),
  ];
  const plan: PlanResult = {
    id: "B",
    name: "Resilient Corn-Legume Diversification Rotation",
    promise: "Balances drought resilience and nitrogen.",
    rotation: ["corn", "corn", "corn", "mungbean", "corn", "mungbean"],
    seasons,
    kpis: {
      totalProfit: 145400,
      worstSeasonProfit: -18400,
      nStart: 42,
      nFinal: 44,
      waterMm: 285,
      avgErosion: 0.1,
      erosionLevel: "Low",
      ureaTotal: 14000,
      pestBreaks: 4,
      bareMonthCount: 0,
    },
    why: ["Legumes replenish soil nitrogen between corn seasons."],
  };

  const doc = buildFieldReportPdf({
    farmName: "Upper Cagayan Valley Experimental Terrace Plot 4B",
    target,
    req,
    scenario: "elnino",
    plan,
    normalPlan: plan,
    why: plan.why,
    notes: ["Dry-season rainfed corn faces severe moisture stress under El Nino conditions."],
    windows: seasonWindows(2026),
    startYear: 2026,
    farmSource: "api",
    pinVia: "api",
    planSource: "demo",
    altitude: { m: 125, from: "SRTM 30 m DEM" },
  });

  assert.equal(doc.getNumberOfPages(), 2);
  const pdfOutput = doc.output("datauristring");
  assert.ok(pdfOutput.startsWith("data:application/pdf"));
  const page2Ops = (doc.internal as unknown as { pages: string[][] }).pages[2].join("\n");
  assert.match(page2Ops, /NET LOSS/);
  assert.match(page2Ops, /CROP WILT \/ DROUGHT RISK/);
  assert.match(page2Ops, /-PHP 18,400/);
  assert.match(page2Ops, /Severe deficit/);
});
