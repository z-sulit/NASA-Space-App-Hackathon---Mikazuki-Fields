import { jsPDF } from "jspdf";
import type { DataSource } from "../api/client";
import { planSpan, type SeasonWindow } from "../data/calendar";
import { CROP } from "../data/crops";
import { climate } from "../engine/simulate";
import type { PlanRequest, PlanResult, Preset, Scenario } from "../types";
import { PHP_PER_USD } from "./currency";

export interface FieldReportInput {
  target: Preset;
  req: PlanRequest;
  scenario: Scenario;
  plan: PlanResult;
  normalPlan: PlanResult;
  why: string[];
  notes: string[];
  windows: SeasonWindow[];
  startYear: number;
  farmSource: DataSource;
  pinVia: "api" | "browser" | "nearest" | null;
  planSource: DataSource;
  altitude: { m: number; from: string } | null;
}

type Rgb = readonly [number, number, number];

const OLIVE: Rgb = [64, 79, 29];
const INK: Rgb = [24, 30, 15];
const MUTED: Rgb = [90, 94, 69];
const CARD_BG: Rgb = [247, 245, 241];
const ROW_ALT: Rgb = [242, 245, 236];
const BORDER: Rgb = [212, 214, 202];
const GOOD_INK: Rgb = [47, 74, 18];
const WARN_INK: Rgb = [143, 58, 36];

const SOIL_LABEL: Record<PlanRequest["soil"], string> = { clay: "Clay", loam: "Loam", sandy: "Sandy" };
const N_LABEL: Record<PlanRequest["overrides"]["soilTestN"], string> = {
  untested: "Untested",
  low: "Low",
  medium: "Medium",
  high: "High",
};
const FLOOD_LABEL: Record<PlanRequest["overrides"]["floods"], string> = {
  never: "Never",
  wet: "Wet season",
  dry: "Dry season",
};
const PLAN_SOURCE_LABEL: Record<DataSource, string> = {
  api: "Mikazuki Optimization API",
  bundle: "Offline Precomputed Bundle",
  demo: "In-Browser Simulation Engine",
};

const M = 14;
const PAGE_W = 210;
const W = PAGE_W - M * 2;

/** Replaces glyphs outside jsPDF's built-in WinAnsi Helvetica encoding. */
function pdfText(text: string): string {
  return text
    .replace(/\u2212/g, "-")
    .replace(/\u2192/g, "->")
    .replace(/\u2014/g, "--")
    .replace(/\u2013/g, "-")
    .replace(/\u20B1/g, "PHP ")
    .replace(/\u00B3/g, "3");
}

function setText(doc: jsPDF, size: number, color: Rgb, style: "normal" | "bold" = "normal") {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  doc.setTextColor(color[0], color[1], color[2]);
}

function splitMoneyLines(phpAmount: number): [string, string] {
  const php = Math.round(phpAmount) || 0;
  const usd = Math.round(phpAmount / PHP_PER_USD) || 0;
  return [`PHP ${php.toLocaleString("en-PH")}`, `USD ${usd.toLocaleString("en-US")}`];
}

function safeSegment(raw: string, fallback: string): string {
  return raw.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || fallback;
}

export function fieldReportFilename(target: Preset, plan: PlanResult): string {
  const shortLoc = target.id.startsWith("pin-") ? "Your-Farm" : target.name.split(" (")[0];
  const safeLocation = safeSegment(shortLoc, "Farm");
  const routeLabel = plan.custom ? "Custom" : `Route${plan.id}`;
  return `Mikazuki-Fields-Report-${safeLocation}-${routeLabel}.pdf`;
}

function drawFooter(doc: jsPDF, pageNum: number, totalPages: number) {
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  doc.setLineWidth(0.25);
  doc.line(M, 281, PAGE_W - M, 281);
  setText(doc, 8, MUTED);
  doc.text("Mikazuki Fields  |  NASA POWER + SRTM + MODIS Field Report", M, 286);
  doc.text(`Page ${pageNum} of ${totalPages}`, PAGE_W - M, 286, { align: "right" });
}

export function buildFieldReportPdf(input: FieldReportInput): jsPDF {
  const { target, req, scenario, plan, normalPlan, why, notes, windows, startYear, farmSource, pinVia, planSource, altitude } = input;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const landHa = Number.isFinite(req.landSizeHa) && req.landSizeHa > 0 ? req.landSizeHa : 1;
  const landLabel = landHa === 1 ? "1.0 ha (per-hectare baseline)" : `${landHa} ha`;
  const lat = `${Math.abs(target.lat).toFixed(2)}° ${target.lat >= 0 ? "N" : "S"}`;
  const lon = `${Math.abs(target.lon).toFixed(2)}° ${target.lon >= 0 ? "E" : "W"}`;
  const wet = climate(target, "wet", scenario);
  const dry = climate(target, "dry", scenario);
  const routeBadge = plan.custom ? "Custom Rotation" : `Route ${plan.id}`;
  const scenarioLabel =
    scenario === "elnino"
      ? target.elnino_basis === "observed_2015_2016"
        ? "El Niño 2015-16 (Observed Replay)"
        : "El Niño 2015-16 (Dry Spell: -25% rain, +1.5 °C)"
      : "Normal (2015-2024 Baseline)";
  const generatedDate = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
  const planSourceText = plan.custom ? "In-Browser Simulation Engine" : PLAN_SOURCE_LABEL[planSource];

  // ---------------- PAGE 1: PROFILE, TELEMETRY & 3-YEAR SUMMARY ----------------
  let y = 16;
  setText(doc, 15.5, INK, "bold");
  doc.text(pdfText("Mikazuki Fields - Field & Crop Rotation Report"), M, y);
  setText(doc, 8.5, MUTED);
  doc.text(pdfText(`Generated ${generatedDate}`), PAGE_W - M, y - 1, { align: "right" });

  y += 6;
  setText(doc, 9.5, MUTED);
  doc.text(pdfText(`${routeBadge}: ${plan.name}  |  ${target.name}  |  ${planSpan(startYear)} (6 Seasons)`), M, y);
  setText(doc, 8.5, MUTED);
  doc.text(pdfText(planSourceText), PAGE_W - M, y, { align: "right" });

  y += 4;
  doc.setDrawColor(OLIVE[0], OLIVE[1], OLIVE[2]);
  doc.setLineWidth(0.6);
  doc.line(M, y, PAGE_W - M, y);

  // Farm Profile & Settings
  y += 8;
  setText(doc, 9, OLIVE, "bold");
  doc.text("FARM PROFILE & SETTINGS", M, y);
  y += 3;

  const profileCardH = 42;
  doc.setFillColor(CARD_BG[0], CARD_BG[1], CARD_BG[2]);
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, W, profileCardH, 2, 2, "FD");

  const profileRows: [string, string, string, string][] = [
    ["Location", target.name, "Coordinates", `${lat}, ${lon}`],
    ["Land Size", landLabel, "Climate Scenario", scenarioLabel],
    [
      "Soil & pH",
      `${SOIL_LABEL[req.soil]} · pH ${req.overrides.soilPh !== null ? req.overrides.soilPh.toFixed(1) : "Untested"} · N ${N_LABEL[req.overrides.soilTestN]}`,
      "Irrigation & Flood",
      `${req.irrigation === "irrigated" ? "Irrigated" : "Rainfed"} · Floods: ${FLOOD_LABEL[req.overrides.floods]}`,
    ],
    ["Primary Goal", req.goal === "cash" ? "Cash crop" : "Animal feed (forage)", "Baseline Crop", CROP[req.baselineCrop].name],
  ];

  let py = y + 7;
  for (const [k1, v1, k2, v2] of profileRows) {
    setText(doc, 8, MUTED);
    doc.text(pdfText(k1), M + 4, py);
    setText(doc, 9, INK, "bold");
    const v1Text = doc.splitTextToSize(pdfText(v1), 60)[0] ?? "";
    doc.text(v1Text, M + 28, py);

    setText(doc, 8, MUTED);
    doc.text(pdfText(k2), M + 94, py);
    setText(doc, 9, INK, "bold");
    const v2Text = doc.splitTextToSize(pdfText(v2), 62)[0] ?? "";
    doc.text(v2Text, M + 124, py);
    py += 9.5;
  }

  // NASA & Ground-Truth Telemetry
  y += profileCardH + 8;
  setText(doc, 9, OLIVE, "bold");
  doc.text("NASA & GROUND-TRUTH TELEMETRY", M, y);
  y += 3;

  const isPin = target.id.startsWith("pin-");
  const isLivePin = pinVia === "api" || pinVia === "browser" || (pinVia === null && /live|Mikazuki API/i.test(target.source));
  const provenanceNote = isPin
    ? isLivePin
      ? "Provenance: Live NASA POWER 10-year monthly climatology (2015-2024) at pinned coordinates; slope/NDVI anchored to nearest reference site when unmeasured."
      : "Provenance: Live NASA POWER unavailable; climate, terrain, and MODIS NDVI anchored to nearest Philippine reference site."
    : `Provenance: Cached Philippine reference site (${farmSource === "api" ? "API-verified" : farmSource === "bundle" ? "offline bundle" : "bundled"}) - NASA POWER 2015-2024, SRTM 30 m, MODIS MOD13Q1.`;
  const provLines = doc.splitTextToSize(pdfText(provenanceNote), W - 8) as string[];
  const teleCardH = 44 + provLines.length * 4;

  doc.setFillColor(CARD_BG[0], CARD_BG[1], CARD_BG[2]);
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  doc.roundedRect(M, y, W, teleCardH, 2, 2, "FD");

  let ty = y + 6.5;
  setText(doc, 8, MUTED, "bold");
  doc.text("METRIC", M + 4, ty);
  doc.text("WET SEASON (JUN-NOV)", M + 126, ty, { align: "right" });
  doc.text("DRY SEASON (DEC-MAY)", M + W - 4, ty, { align: "right" });
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  doc.line(M + 4, ty + 2, M + W - 4, ty + 2);

  const teleMetrics: [string, string, string][] = [
    ["NASA POWER Rainfall", `${Math.round(wet.rain_mm)} mm`, `${Math.round(dry.rain_mm)} mm`],
    ["Afternoon Heat (Tmax)", `${wet.tmax_c.toFixed(1)} °C`, `${dry.tmax_c.toFixed(1)} °C`],
    ["Root-Zone Soil Moisture (GWETROOT)", wet.gwetroot.toFixed(2), dry.gwetroot.toFixed(2)],
    ["Reference Evapotranspiration (ET0)", `${wet.et0_mm_day.toFixed(1)} mm/day`, `${dry.et0_mm_day.toFixed(1)} mm/day`],
  ];
  ty += 7;
  for (const [metric, wVal, dVal] of teleMetrics) {
    setText(doc, 8.5, INK);
    doc.text(pdfText(metric), M + 4, ty);
    setText(doc, 8.5, INK, "bold");
    doc.text(pdfText(wVal), M + 126, ty, { align: "right" });
    doc.text(pdfText(dVal), M + W - 4, ty, { align: "right" });
    ty += 6;
  }

  doc.line(M + 4, ty - 2, M + W - 4, ty - 2);
  ty += 3;
  const elevVal = altitude ? `${Math.round(altitude.m)} m (${altitude.from})` : target.elevation_m !== undefined ? `${Math.round(target.elevation_m)} m` : "N/A";
  const elninoRain =
    target.elnino_2016_dry_rain_pct !== null
      ? `${target.elnino_2016_dry_rain_pct > 0 ? "+" : ""}${Math.round(target.elnino_2016_dry_rain_pct)}% dry rain`
      : "Synthetic (-25%)";
  setText(doc, 8.5, INK, "bold");
  doc.text(
    pdfText(`Elevation: ${elevVal}   |   Slope: ${target.slope_pct.toFixed(1)}%   |   MODIS NDVI: ${target.ndvi_dry_min.toFixed(2)}   |   2015-16 El Niño: ${elninoRain}`),
    M + 4,
    ty,
  );
  ty += 5.5;
  setText(doc, 8, MUTED);
  doc.text(provLines, M + 4, ty);

  // 3-Year Financial & Agronomic KPIs
  y += teleCardH + 8;
  setText(doc, 9, OLIVE, "bold");
  doc.text("3-YEAR FINANCIAL & AGRONOMIC KPIS", M, y);
  y += 3;

  const totalHarvestT = plan.seasons.reduce((acc, s) => acc + s.yieldT, 0);
  const nDelta = plan.kpis.nFinal - plan.kpis.nStart;
  const elninoDiff = plan.kpis.totalProfit - normalPlan.kpis.totalProfit;
  const [profitPhp, profitUsd] = splitMoneyLines(plan.kpis.totalProfit);
  const [ureaPhp, ureaUsd] = splitMoneyLines(plan.kpis.ureaTotal);
  const [worstPhp, worstUsd] = splitMoneyLines(plan.kpis.worstSeasonProfit);

  const kpiCards: { label: string; value: string; sub: string; highlight?: boolean; subWarn?: boolean }[] = [
    {
      label: `3-YEAR PROFIT (${landHa} HA)`,
      value: profitPhp,
      sub:
        scenario === "elnino" && Math.abs(elninoDiff) >= 1
          ? `${profitUsd} (${elninoDiff < 0 ? "-" : "+"}${Math.round(Math.abs(elninoDiff) / PHP_PER_USD).toLocaleString("en-US")} USD vs norm)`
          : profitUsd,
      highlight: true,
      subWarn: scenario === "elnino" && elninoDiff < 0,
    },
    { label: "UREA TOP-UP COST", value: ureaPhp, sub: `${ureaUsd} · ${totalHarvestT.toFixed(1)} t harvest` },
    { label: "SOIL NITROGEN", value: `${Math.round(plan.kpis.nStart)} -> ${Math.round(plan.kpis.nFinal)} kg/ha`, sub: `Net ${nDelta >= 0 ? "+" : ""}${Math.round(nDelta)} kg/ha` },
    {
      label: req.irrigation === "irrigated" ? "WATER PUMPED" : "WATER SHORTFALL",
      value: `${Math.round(plan.kpis.waterMm)} mm`,
      sub: `${Math.round(plan.kpis.waterMm * 10 * landHa).toLocaleString("en-PH")} m3 total`,
    },
    { label: "EROSION RISK", value: plan.kpis.erosionLevel, sub: `Mean index ${plan.kpis.avgErosion.toFixed(1)}` },
    { label: "PEST CYCLES BROKEN", value: `${plan.kpis.pestBreaks} / 5`, sub: "Crop-family switches" },
    { label: "BARE MONTHS IN RAIN", value: `${plan.kpis.bareMonthCount}`, sub: "Across 36 months" },
    { label: "WORST SEASON FLOOR", value: worstPhp, sub: worstUsd },
  ];

  const gap = 3;
  const cardW = (W - gap * 3) / 4;
  const cardH = 19;
  kpiCards.forEach((card, idx) => {
    const col = idx % 4;
    const row = Math.floor(idx / 4);
    const cx = M + col * (cardW + gap);
    const cy = y + row * (cardH + gap);
    const fill = card.highlight ? ROW_ALT : CARD_BG;
    const border = card.highlight ? OLIVE : BORDER;
    doc.setFillColor(fill[0], fill[1], fill[2]);
    doc.setDrawColor(border[0], border[1], border[2]);
    doc.setLineWidth(card.highlight ? 0.45 : 0.25);
    doc.roundedRect(cx, cy, cardW, cardH, 1.5, 1.5, "FD");

    setText(doc, 7, MUTED, "bold");
    doc.text(pdfText(card.label), cx + 3, cy + 5);
    setText(doc, 10, INK, "bold");
    doc.text(pdfText(card.value), cx + 3, cy + 11.2);
    setText(doc, 7.5, card.subWarn ? WARN_INK : MUTED);
    const subText = doc.splitTextToSize(pdfText(card.sub), cardW - 6)[0] ?? "";
    doc.text(subText, cx + 3, cy + 16);
  });

  // Top 2-3 Advisory Bullets
  y += cardH * 2 + gap + 7;
  const advisory = why.slice(0, 3);
  if (advisory.length > 0) {
    setText(doc, 9, OLIVE, "bold");
    doc.text("KEY AGRONOMIC TAKEAWAYS", M, y);
    y += 5;
    for (const bullet of advisory) {
      if (y > 272) break;
      const lines = doc.splitTextToSize(pdfText(bullet), W - 7) as string[];
      setText(doc, 9, INK);
      doc.text("-", M + 1.5, y);
      doc.text(lines, M + 5.5, y);
      y += lines.length * 4.4 + 1.5;
    }
  }

  drawFooter(doc, 1, 2);

  // ---------------- PAGE 2: 6-SEASON CROP ROTATION SCHEDULE ----------------
  doc.addPage();
  let y2 = 16;
  setText(doc, 14, INK, "bold");
  doc.text(pdfText(`3-Year (6-Season) Crop Rotation Schedule`), M, y2);
  y2 += 6;
  setText(doc, 9.5, MUTED);
  doc.text(pdfText(`${target.name}  |  ${routeBadge}: ${plan.name}  |  ${planSpan(startYear)}  |  ${landHa} ha  |  ${scenarioLabel}`), M, y2);
  y2 += 4;
  doc.setDrawColor(OLIVE[0], OLIVE[1], OLIVE[2]);
  doc.setLineWidth(0.6);
  doc.line(M, y2, PAGE_W - M, y2);

  y2 += 8;
  const cols = [
    { title: "SEASON", w: 16, align: "left" as const },
    { title: "CALENDAR", w: 24, align: "left" as const },
    { title: "CROP", w: 30, align: "left" as const },
    { title: "YIELD", w: 17, align: "right" as const },
    { title: req.irrigation === "irrigated" ? "PUMPED" : "SHORTFALL", w: 19, align: "right" as const },
    { title: "SOIL N", w: 17, align: "right" as const },
    { title: "PEST / EROSION", w: 28, align: "left" as const },
    { title: "PROFIT (PHP / USD)", w: 31, align: "right" as const },
  ];

  // Table Header
  const thH = 10;
  doc.setFillColor(OLIVE[0], OLIVE[1], OLIVE[2]);
  doc.rect(M, y2, W, thH, "F");
  setText(doc, 7.5, [246, 239, 235], "bold");
  let cx = M;
  for (const col of cols) {
    const tx = col.align === "right" ? cx + col.w - 2.5 : cx + 2.5;
    doc.text(col.title, tx, y2 + 6.3, { align: col.align });
    cx += col.w;
  }
  y2 += thH;

  // Season Rows (generous height for readable 2-line cells)
  const rowH = 17;
  plan.seasons.forEach((s, i) => {
    const w = windows[i];
    const crop = CROP[s.crop];
    const [pPhp, pUsd] = splitMoneyLines(s.profit);

    if (i % 2 === 1) {
      doc.setFillColor(ROW_ALT[0], ROW_ALT[1], ROW_ALT[2]);
      doc.rect(M, y2, W, rowH, "F");
    }
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setLineWidth(0.25);
    doc.line(M, y2 + rowH, M + W, y2 + rowH);

    let x = M;
    const topY = y2 + 6.5;
    const subY = y2 + 12;

    // 1. Season
    setText(doc, 8.5, INK, "bold");
    doc.text(`S${s.index + 1}`, x + 2.5, topY);
    setText(doc, 7.5, MUTED);
    doc.text(s.kind === "wet" ? "Wet" : "Dry", x + 2.5, subY);
    x += cols[0].w;

    // 2. Calendar
    setText(doc, 8, INK);
    const calLines = doc.splitTextToSize(pdfText(w ? w.range : s.label), cols[1].w - 4) as string[];
    doc.text(calLines[0] ?? "", x + 2.5, topY);
    if (calLines[1]) {
      setText(doc, 7.5, MUTED);
      doc.text(calLines[1], x + 2.5, subY);
    }
    x += cols[1].w;

    // 3. Crop
    setText(doc, 8.5, INK, "bold");
    doc.text(pdfText(crop.short), x + 2.5, topY);
    setText(doc, 7.5, MUTED);
    doc.text(pdfText(crop.family), x + 2.5, subY);
    x += cols[2].w;

    // 4. Yield
    setText(doc, 8.5, INK, "bold");
    doc.text(`${s.yieldT.toFixed(1)} t`, x + cols[3].w - 2.5, topY, { align: "right" });
    setText(doc, 7.5, MUTED);
    doc.text(`${(s.yieldT / landHa).toFixed(1)} t/ha`, x + cols[3].w - 2.5, subY, { align: "right" });
    x += cols[3].w;

    // 5. Water
    const waterVal = req.irrigation === "irrigated" ? s.pumpedMm : s.gapMm;
    setText(doc, 8.5, INK);
    doc.text(`${Math.round(waterVal)} mm`, x + cols[4].w - 2.5, topY, { align: "right" });
    if (req.irrigation === "irrigated" && s.gapMm > 0) {
      setText(doc, 7.5, WARN_INK);
      doc.text(`${Math.round(s.gapMm)} gap`, x + cols[4].w - 2.5, subY, { align: "right" });
    }
    x += cols[4].w;

    // 6. Soil N
    setText(doc, 8, INK);
    doc.text(pdfText(`${Math.round(s.nStart)} -> ${Math.round(s.nEnd)}`), x + cols[5].w - 2.5, topY, { align: "right" });
    setText(doc, 7.5, MUTED);
    doc.text("kg/ha", x + cols[5].w - 2.5, subY, { align: "right" });
    x += cols[5].w;

    // 7. Pest / Erosion
    setText(doc, 8, s.pestBroken ? GOOD_INK : i === 0 ? MUTED : WARN_INK, s.pestBroken ? "bold" : "normal");
    doc.text(s.pestBroken ? "Pest broken" : i === 0 ? "Baseline" : "Same family", x + 2.5, topY);
    setText(doc, 7.5, s.bareMonths.length > 0 ? WARN_INK : MUTED);
    const bareText = s.bareMonths.length > 0 ? `Bare: ${s.bareMonths.join(", ")}` : "0 bare months";
    doc.text(doc.splitTextToSize(pdfText(bareText), cols[6].w - 4)[0] ?? bareText, x + 2.5, subY);
    x += cols[6].w;

    // 8. Profit (PHP / USD)
    setText(doc, 8.5, s.profit < 0 ? WARN_INK : INK, "bold");
    doc.text(pPhp, x + cols[7].w - 2.5, topY, { align: "right" });
    setText(doc, 7.5, MUTED);
    doc.text(pUsd, x + cols[7].w - 2.5, subY, { align: "right" });

    y2 += rowH;
  });

  // Table Totals Row
  const totH = 14;
  doc.setFillColor(CARD_BG[0], CARD_BG[1], CARD_BG[2]);
  doc.setDrawColor(OLIVE[0], OLIVE[1], OLIVE[2]);
  doc.setLineWidth(0.4);
  doc.rect(M, y2, W, totH, "FD");
  setText(doc, 8.5, INK, "bold");
  doc.text("3-Year Total", M + 2.5, y2 + 6);
  doc.text(`${totalHarvestT.toFixed(1)} t`, M + cols[0].w + cols[1].w + cols[2].w + cols[3].w - 2.5, y2 + 6, { align: "right" });
  doc.text(`${Math.round(plan.kpis.waterMm)} mm`, M + cols[0].w + cols[1].w + cols[2].w + cols[3].w + cols[4].w - 2.5, y2 + 6, {
    align: "right",
  });
  doc.text(
    pdfText(`${Math.round(plan.kpis.nStart)} -> ${Math.round(plan.kpis.nFinal)}`),
    M + cols[0].w + cols[1].w + cols[2].w + cols[3].w + cols[4].w + cols[5].w - 2.5,
    y2 + 6,
    { align: "right" },
  );
  setText(doc, 8, MUTED);
  doc.text(
    `${plan.kpis.pestBreaks} breaks · ${plan.kpis.bareMonthCount} bare mo`,
    M + cols[0].w + cols[1].w + cols[2].w + cols[3].w + cols[4].w + cols[5].w + 2.5,
    y2 + 6,
  );
  setText(doc, 8.5, INK, "bold");
  doc.text(profitPhp, M + W - 2.5, y2 + 5.8, { align: "right" });
  setText(doc, 7.5, MUTED);
  doc.text(profitUsd, M + W - 2.5, y2 + 10.6, { align: "right" });
  y2 += totH + 10;

  // Site / Ground-Truth Notes (if any)
  if (notes.length > 0 && y2 < 232) {
    setText(doc, 9, OLIVE, "bold");
    doc.text("SITE & GROUND-TRUTH ADVISORIES", M, y2);
    y2 += 5;
    for (const note of notes.slice(0, 4)) {
      if (y2 > 246) break;
      const lines = doc.splitTextToSize(pdfText(note), W - 7) as string[];
      setText(doc, 8.5, INK);
      doc.text("-", M + 1.5, y2);
      doc.text(lines, M + 5.5, y2);
      y2 += lines.length * 4.2 + 1.5;
    }
  }

  // Model Limits Disclaimer Card
  const disclaimerText = pdfText(
    "Model & Data Limits: NASA POWER weather is averaged over a ~50-70 km grid cell, and root-zone soil wetness is model-derived rather than an in-field sensor. Crop prices and yields reflect baseline assumptions. Validate soil fertility at a Department of Agriculture (DA) regional soils laboratory and consult your Municipal Agriculturist before changing crops.",
  );
  const discLines = doc.splitTextToSize(disclaimerText, W - 8) as string[];
  const discH = 10 + discLines.length * 4;
  const discY = Math.max(y2 + 6, 274 - discH);
  doc.setFillColor(CARD_BG[0], CARD_BG[1], CARD_BG[2]);
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  doc.setLineWidth(0.25);
  doc.roundedRect(M, discY, W, discH, 1.5, 1.5, "FD");
  setText(doc, 8, OLIVE, "bold");
  doc.text("MODEL LIMITS & FIELD VERIFICATION", M + 4, discY + 5.5);
  setText(doc, 8, MUTED);
  doc.text(discLines, M + 4, discY + 10);

  drawFooter(doc, 2, 2);
  return doc;
}

export function downloadFieldReportPdf(input: FieldReportInput): void {
  const doc = buildFieldReportPdf(input);
  doc.save(fieldReportFilename(input.target, input.plan));
}
