import type { PlanRequest, PlanResult, Preset, Scenario } from "../../types";
import type { DataSource } from "../../api/client";
import { planSpan, type SeasonWindow } from "../../data/calendar";
import { CROP } from "../../data/crops";
import { climate } from "../../engine/simulate";
import { formatPhpUsd } from "../ui";

const SOIL_LABEL: Record<PlanRequest["soil"], string> = {
  clay: "Clay",
  loam: "Loam",
  sandy: "Sandy",
};

const NITROGEN_LABEL: Record<PlanRequest["overrides"]["soilTestN"], string> = {
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

export interface FieldReportPrintProps {
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
}

export function FieldReportPrint({
  target,
  req,
  scenario,
  plan,
  normalPlan,
  why,
  notes,
  windows,
  startYear,
  farmSource,
  pinVia,
  planSource,
}: FieldReportPrintProps) {
  const landHa = Number.isFinite(req.landSizeHa) && req.landSizeHa > 0 ? req.landSizeHa : 1;
  const landLabel = landHa === 1 ? "1.0 ha (per-hectare baseline)" : `${landHa} ha`;
  const lat = `${Math.abs(target.lat).toFixed(2)}° ${target.lat >= 0 ? "N" : "S"}`;
  const lon = `${Math.abs(target.lon).toFixed(2)}° ${target.lon >= 0 ? "E" : "W"}`;

  const wet = climate(target, "wet", scenario);
  const dry = climate(target, "dry", scenario);

  const isPin = target.id.startsWith("pin-");
  const isLivePin = pinVia === "api" || pinVia === "browser" || (pinVia === null && /live|Mikazuki API/i.test(target.source));
  const provenanceNote = isPin
    ? isLivePin
      ? "Live NASA POWER monthly climatology (2015–2024) for pinned coordinates; SRTM 30m terrain and MODIS NDVI anchored to nearest Philippine reference site."
      : "Live NASA POWER unavailable during lookup; climate, SRTM 30m terrain, and MODIS NDVI anchored to nearest Philippine reference site."
    : `Cached Philippine reference site (${farmSource === "api" ? "API-verified" : farmSource === "bundle" ? "offline bundle" : "bundled"}): NASA POWER monthly climatology (2015–2024, incl. Jun 2015–May 2016 El Niño), SRTM 30m terrain, and MODIS MOD13Q1 NDVI.`;

  const scenarioLabel =
    scenario === "elnino"
      ? target.elnino_basis === "observed_2015_2016"
        ? "El Niño 2015–16 (Observed Replay)"
        : "El Niño 2015–16 (Dry-Spell Simulation: −25% rain, +1.5 °C)"
      : "Normal Climate (10-Year Baseline 2015–2024)";

  const routeBadge = plan.custom ? "Custom Rotation" : `Route ${plan.id} · ${plan.name}`;
  const totalHarvestT = plan.seasons.reduce((acc, s) => acc + s.yieldT, 0);
  const nDelta = plan.kpis.nFinal - plan.kpis.nStart;
  const elninoProfitDiff = plan.kpis.totalProfit - normalPlan.kpis.totalProfit;
  const generatedDate = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });

  return (
    <article
      aria-label="Printable Field Report"
      className="field-report-print hidden bg-white text-[11px] leading-[1.45] text-gray-900 print:block"
    >
      <header className="flex items-start justify-between gap-4 border-b-2 border-[#404f1d] pb-3">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.14em] text-[#404f1d] uppercase">Mikazuki Fields · Crop Rotation &amp; Climate Report</p>
          <h1 className="mt-0.5 font-display text-[20px] leading-tight font-semibold text-gray-900">
            {target.name} — {routeBadge}
          </h1>
          <p className="mt-0.5 text-[11px] text-gray-600">{plan.promise}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-gray-600">
          <p className="font-semibold text-gray-900">{planSpan(startYear)} (6 Seasons)</p>
          <p>Generated {generatedDate}</p>
          <p>{plan.custom ? "In-Browser Simulation" : PLAN_SOURCE_LABEL[planSource]}</p>
        </div>
      </header>

      <section className="mt-3 grid grid-cols-2 gap-3 break-inside-avoid">
        <div className="rounded border border-gray-300 bg-gray-50/70 p-2.5">
          <h2 className="text-[10px] font-semibold tracking-[0.1em] text-[#404f1d] uppercase">Farm Profile &amp; Settings</h2>
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[10.5px]">
            <dt className="text-gray-600">Location</dt>
            <dd className="font-medium text-gray-900">{target.name}</dd>
            <dt className="text-gray-600">Coordinates</dt>
            <dd className="font-medium text-gray-900 tabular">{lat}, {lon}</dd>
            <dt className="text-gray-600">Land size</dt>
            <dd className="font-medium text-gray-900 tabular">{landLabel}</dd>
            <dt className="text-gray-600">Soil &amp; pH</dt>
            <dd className="font-medium text-gray-900">
              {SOIL_LABEL[req.soil]} · pH {req.overrides.soilPh !== null ? req.overrides.soilPh.toFixed(1) : "Untested"} · N {NITROGEN_LABEL[req.overrides.soilTestN]}
            </dd>
            <dt className="text-gray-600">Water &amp; flood</dt>
            <dd className="font-medium text-gray-900">
              {req.irrigation === "irrigated" ? "Irrigated" : "Rainfed (rain only)"} · Floods: {FLOOD_LABEL[req.overrides.floods]}
            </dd>
            <dt className="text-gray-600">Goal &amp; baseline</dt>
            <dd className="font-medium text-gray-900">
              {req.goal === "cash" ? "Cash crop" : "Animal feed (forage)"} · Baseline: {CROP[req.baselineCrop].name}
            </dd>
            <dt className="text-gray-600">Climate scenario</dt>
            <dd className="font-semibold text-gray-900">{scenarioLabel}</dd>
          </dl>
        </div>

        <div className="rounded border border-gray-300 bg-gray-50/70 p-2.5">
          <h2 className="text-[10px] font-semibold tracking-[0.1em] text-[#404f1d] uppercase">NASA &amp; Ground-Truth Telemetry</h2>
          <table className="mt-1.5 w-full border-collapse text-[10.5px]">
            <thead>
              <tr className="border-b border-gray-300 text-left text-[9.5px] text-gray-600 uppercase">
                <th className="py-0.5 font-medium">Metric</th>
                <th className="py-0.5 text-right font-medium">Wet (Jun–Nov)</th>
                <th className="py-0.5 text-right font-medium">Dry (Dec–May)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 tabular">
              <tr>
                <td className="py-0.5 text-gray-700">NASA POWER rainfall</td>
                <td className="py-0.5 text-right font-medium">{Math.round(wet.rain_mm)} mm</td>
                <td className="py-0.5 text-right font-medium">{Math.round(dry.rain_mm)} mm</td>
              </tr>
              <tr>
                <td className="py-0.5 text-gray-700">Afternoon heat (Tmax)</td>
                <td className="py-0.5 text-right font-medium">{wet.tmax_c.toFixed(1)} °C</td>
                <td className="py-0.5 text-right font-medium">{dry.tmax_c.toFixed(1)} °C</td>
              </tr>
              <tr>
                <td className="py-0.5 text-gray-700">Soil thirst (GWETROOT)</td>
                <td className="py-0.5 text-right font-medium">{wet.gwetroot.toFixed(2)}</td>
                <td className="py-0.5 text-right font-medium">{dry.gwetroot.toFixed(2)}</td>
              </tr>
              <tr>
                <td className="py-0.5 text-gray-700">Daily water use (ET0)</td>
                <td className="py-0.5 text-right font-medium">{wet.et0_mm_day.toFixed(1)} mm/d</td>
                <td className="py-0.5 text-right font-medium">{dry.et0_mm_day.toFixed(1)} mm/d</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 border-t border-gray-200 pt-1 text-[10.5px] tabular">
            {target.elevation_m !== undefined && (
              <span>
                <span className="text-gray-600">SRTM 30m elevation:</span> <strong>{Math.round(target.elevation_m)} m</strong>
              </span>
            )}
            <span>
              <span className="text-gray-600">Slope:</span> <strong>{target.slope_pct.toFixed(1)}%</strong>
            </span>
            <span>
              <span className="text-gray-600">MODIS NDVI (dry min):</span> <strong>{target.ndvi_dry_min.toFixed(2)}</strong>
            </span>
          </div>
          <p className="mt-1 text-[9.5px] leading-snug text-gray-600">{provenanceNote}</p>
        </div>
      </section>

      <section className="mt-3 break-inside-avoid">
        <h2 className="text-[10px] font-semibold tracking-[0.1em] text-[#404f1d] uppercase">
          3-Year (6-Season) Crop Rotation Schedule · {planSpan(startYear)}
        </h2>
        <table className="mt-1.5 w-full border-collapse border border-gray-300 text-[10.5px]">
          <thead>
            <tr className="bg-[#eef2ea] text-left text-[9.5px] font-semibold text-gray-800 uppercase">
              <th className="border-b border-gray-300 px-2 py-1.5">Season</th>
              <th className="border-b border-gray-300 px-2 py-1.5">Window</th>
              <th className="border-b border-gray-300 px-2 py-1.5">Crop</th>
              <th className="border-b border-gray-300 px-2 py-1.5 text-right">Yield</th>
              <th className="border-b border-gray-300 px-2 py-1.5 text-right">
                {req.irrigation === "irrigated" ? "Pumped / Gap" : "Water Shortfall"}
              </th>
              <th className="border-b border-gray-300 px-2 py-1.5 text-right">Soil N (kg/ha)</th>
              <th className="border-b border-gray-300 px-2 py-1.5">Pest Cycle</th>
              <th className="border-b border-gray-300 px-2 py-1.5">Bare-Soil Months</th>
              <th className="border-b border-gray-300 px-2 py-1.5 text-right">Season Profit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 tabular">
            {plan.seasons.map((s, i) => {
              const w = windows[i];
              const crop = CROP[s.crop];
              const yieldPerHa = s.yieldT / landHa;
              return (
                <tr key={s.index} className={i % 2 === 1 ? "bg-gray-50/70" : "bg-white"}>
                  <td className="px-2 py-1.5 font-semibold text-gray-900">
                    S{s.index + 1} · {s.kind === "wet" ? "Wet" : "Dry"}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-gray-700">{w ? w.range : s.label}</td>
                  <td className="px-2 py-1.5 font-medium text-gray-900">
                    {crop.name}
                    <span className="ml-1 text-[9.5px] font-normal text-gray-500">({crop.family})</span>
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <span className="font-medium">{yieldPerHa.toFixed(1)} t/ha</span>
                    {landHa !== 1 && <span className="block text-[9.5px] text-gray-500">{s.yieldT.toFixed(1)} t total</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    {req.irrigation === "irrigated"
                      ? `${Math.round(s.pumpedMm)} mm${s.gapMm > 0 ? ` (${Math.round(s.gapMm)} gap)` : ""}`
                      : `${Math.round(s.gapMm)} mm`}
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    {Math.round(s.nStart)} → {Math.round(s.nEnd)}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {s.pestBroken ? (
                      <span className="font-semibold text-[#2f4a12]">Broken</span>
                    ) : i === 0 ? (
                      <span className="text-gray-600">Baseline</span>
                    ) : (
                      <span className="text-amber-800">Continues</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-gray-700">
                    {s.bareMonths.length > 0 ? `${s.bareMonths.length} mo (${s.bareMonths.join(", ")})` : "0 mo"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap text-gray-900">{formatPhpUsd(s.profit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="mt-3 break-inside-avoid">
        <h2 className="text-[10px] font-semibold tracking-[0.1em] text-[#404f1d] uppercase">
          3-Year Financial &amp; Agronomic KPI Summary
        </h2>
        <dl className="mt-1.5 grid grid-cols-4 gap-2 tabular">
          <div className="rounded border border-gray-300 bg-[#eef2ea]/60 p-2">
            <dt className="text-[9.5px] font-medium text-gray-600 uppercase">Total 3-Year Profit ({landHa} ha)</dt>
            <dd className="mt-0.5 font-display text-[13px] font-bold text-gray-900">{formatPhpUsd(plan.kpis.totalProfit)}</dd>
            {scenario === "elnino" && Math.abs(elninoProfitDiff) >= 1 && (
              <dd className="text-[9.5px] text-amber-900">
                {elninoProfitDiff < 0 ? "−" : "+"}
                {formatPhpUsd(Math.abs(elninoProfitDiff))} vs normal year
              </dd>
            )}
          </div>
          <div className="rounded border border-gray-300 bg-gray-50 p-2">
            <dt className="text-[9.5px] font-medium text-gray-600 uppercase">Urea Top-Up Cost</dt>
            <dd className="mt-0.5 font-display text-[13px] font-semibold text-gray-900">{formatPhpUsd(plan.kpis.ureaTotal)}</dd>
            <dd className="text-[9.5px] text-gray-600">Total harvest: {totalHarvestT.toFixed(1)} t</dd>
          </div>
          <div className="rounded border border-gray-300 bg-gray-50 p-2">
            <dt className="text-[9.5px] font-medium text-gray-600 uppercase">Soil Nitrogen Delta</dt>
            <dd className="mt-0.5 font-display text-[13px] font-semibold text-gray-900">
              {Math.round(plan.kpis.nStart)} → {Math.round(plan.kpis.nFinal)} kg/ha
            </dd>
            <dd className="text-[9.5px] text-gray-600">
              Net {nDelta >= 0 ? "+" : ""}
              {Math.round(nDelta)} kg/ha
            </dd>
          </div>
          <div className="rounded border border-gray-300 bg-gray-50 p-2">
            <dt className="text-[9.5px] font-medium text-gray-600 uppercase">
              {req.irrigation === "irrigated" ? "Water Pumped" : "Water Shortfall"}
            </dt>
            <dd className="mt-0.5 font-display text-[13px] font-semibold text-gray-900">
              {Math.round(plan.kpis.waterMm)} mm
            </dd>
            <dd className="text-[9.5px] text-gray-600">{Math.round(plan.kpis.waterMm * 10 * landHa).toLocaleString("en-PH")} m³ total</dd>
          </div>
          <div className="rounded border border-gray-300 bg-gray-50 p-2">
            <dt className="text-[9.5px] font-medium text-gray-600 uppercase">Erosion Risk</dt>
            <dd className="mt-0.5 font-display text-[13px] font-semibold text-gray-900">{plan.kpis.erosionLevel}</dd>
            <dd className="text-[9.5px] text-gray-600">Mean index {plan.kpis.avgErosion.toFixed(1)}</dd>
          </div>
          <div className="rounded border border-gray-300 bg-gray-50 p-2">
            <dt className="text-[9.5px] font-medium text-gray-600 uppercase">Pest Cycles Broken</dt>
            <dd className="mt-0.5 font-display text-[13px] font-semibold text-gray-900">{plan.kpis.pestBreaks} / 5</dd>
            <dd className="text-[9.5px] text-gray-600">Family transitions</dd>
          </div>
          <div className="rounded border border-gray-300 bg-gray-50 p-2">
            <dt className="text-[9.5px] font-medium text-gray-600 uppercase">Bare Months in Rain</dt>
            <dd className="mt-0.5 font-display text-[13px] font-semibold text-gray-900">{plan.kpis.bareMonthCount}</dd>
            <dd className="text-[9.5px] text-gray-600">Across 36 months</dd>
          </div>
          <div className="rounded border border-gray-300 bg-gray-50 p-2">
            <dt className="text-[9.5px] font-medium text-gray-600 uppercase">Worst Season Profit</dt>
            <dd className="mt-0.5 font-display text-[13px] font-semibold text-gray-900">{formatPhpUsd(plan.kpis.worstSeasonProfit)}</dd>
            <dd className="text-[9.5px] text-gray-600">Downside floor</dd>
          </div>
        </dl>
      </section>

      {(why.length > 0 || notes.length > 0) && (
        <section className="mt-3 rounded border border-gray-300 p-2.5 break-inside-avoid">
          <h2 className="text-[10px] font-semibold tracking-[0.1em] text-[#404f1d] uppercase">Top Agronomic Advisory</h2>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10.5px] text-gray-800">
            {why.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-3 border-t border-gray-300 pt-2 text-[9.5px] text-gray-600 break-inside-avoid">
        Note: NASA POWER weather is averaged over a ~50–70 km grid cell, and root-zone soil wetness is model-derived. Validate soil fertility at a
        Department of Agriculture (DA) regional soils laboratory and consult your Municipal Agriculturist before changing crops.
      </footer>
    </article>
  );
}
