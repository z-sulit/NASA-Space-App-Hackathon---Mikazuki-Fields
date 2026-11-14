import { useMemo } from "react";
import { CloudSun, Droplets, Thermometer } from "lucide-react";
import type { CropId, PlanRequest, PlanResult, Preset } from "../../types";
import { CROP } from "../../data/crops";
import { customPlan } from "../../engine/plans";
import { peso } from "../ui";

const pct = (now: number, base: number) => (base ? Math.round(((now - base) / Math.abs(base)) * 100) : 0);

export interface ElNinoFinding {
  season: number;
  crop: CropId;
  yieldDrop: number; // 0..1
  water?: { months: { month: string; rain: number; need: number }[] };
  heat?: { tmax: number; limit: number };
  pumpExtra?: number;
}

/**
 * What El Niño changes for a route, and why. The numbers (profit, yield) are the plan's own
 * (from the API or the in-browser planner). The reasons come from re-running the same
 * monthly water balance in the browser, which keeps each month's rain, soil water and need.
 */
export function explainElNino(req: PlanRequest, preset: Preset, now: PlanResult, normal: PlanResult) {
  const sim = customPlan(req, preset, now.rotation);
  const findings: ElNinoFinding[] = [];
  now.seasons.forEach((s, i) => {
    const base = normal.seasons[i];
    const drop = base.yieldT > 0 ? 1 - s.yieldT / base.yieldT : 0;
    const e = sim.elnino.seasons[i];
    const crop = CROP[s.crop];
    const f: ElNinoFinding = { season: i, crop: s.crop, yieldDrop: Math.max(0, drop) };
    if (s.waterLoss > base.waterLoss + 1e-6 || (drop > 0.001 && e.gapMm > 0.5)) {
      f.water = { months: (e.months ?? []).filter((m) => m.short > 0.5).map((m) => ({ month: m.month, rain: m.rain, need: m.need })) };
    }
    if (s.heatLoss > base.heatLoss + 1e-6) f.heat = { tmax: e.cropTmax ?? 0, limit: crop.heat_limit_c };
    if (s.pumpCost > base.pumpCost + 1) f.pumpExtra = s.pumpCost - base.pumpCost;
    if (f.yieldDrop > 0.001 || f.pumpExtra) findings.push(f);
  });

  // If nothing changed: the tightest month and the hottest crop period, as evidence.
  type Tight = { month: string; rain: number; inSoil: number; need: number; crop: CropId; margin: number };
  type Hot = { tmax: number; limit: number; crop: CropId };
  let tight: Tight | null = null as Tight | null;
  let hottest: Hot | null = null as Hot | null;
  for (const s of sim.elnino.seasons) {
    for (const m of s.months ?? []) {
      const margin = 0.8 * m.rain + m.inSoil - m.need;
      if (tight === null || margin < tight.margin) tight = { month: m.month, rain: m.rain, inSoil: m.inSoil, need: m.need, crop: s.crop, margin };
    }
    const limit = CROP[s.crop].heat_limit_c;
    if (s.cropTmax !== undefined && (hottest === null || limit - s.cropTmax < hottest.limit - hottest.tmax)) hottest = { tmax: s.cropTmax, limit, crop: s.crop };
  }
  return { findings, tight, hottest };
}

export function ElNinoReport({ req, preset, now, normal }: { req: PlanRequest; preset: Preset; now: PlanResult; normal: PlanResult }) {
  const { findings, tight, hottest } = useMemo(() => explainElNino(req, preset, now, normal), [req, preset, now, normal]);
  const observed = preset.elnino_basis === "observed_2015_2016" && preset.elnino;
  const dP = now.kpis.totalProfit - normal.kpis.totalProfit;
  // Under half a percent with no season losing yield is noise, not an El Niño effect.
  const changed = findings.length > 0 || Math.abs(dP) >= Math.abs(normal.kpis.totalProfit) * 0.005;
  const signed = (v: number) => `${v > 0 ? "+" : ""}${v}%`;
  const n = preset.seasons.dry.rain_mm;
  const e = observed ? preset.elnino!.dry.rain_mm : n * 0.75;

  return (
    <div className="elnino-report mt-3 rounded-md border border-[#e0896f]/45 bg-[#a9452c]/15 px-3 py-2.5 text-xs" aria-live="polite">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-[#f3b49f]">
        <CloudSun className="size-3.5" aria-hidden />
        {observed ? "Replaying the 2015–16 El Niño" : "Simulated dry spell"}
      </p>
      <p className="mt-1 text-ink/80">
        {observed
          ? e >= n
            ? `Real NASA POWER months for this farm: El Niño missed this spot. Its 2015–16 dry season got ${Math.round(e)} mm of rain vs ${Math.round(n)} mm normally (${signed(pct(e, n))}).`
            : `Real NASA POWER months for this farm: dry-season rain ${Math.round(e)} mm vs ${Math.round(n)} mm in a normal year (${signed(pct(e, n))}).`
          : "No 2015–16 record here, so rain is cut 25% and afternoons are 1.5 °C hotter."}
      </p>

      {changed ? (
        <>
          <p className="mt-2 text-sm font-semibold">
            3-year profit {dP < 0 ? "−" : "+"}
            {peso(Math.abs(dP))} ({pct(now.kpis.totalProfit, normal.kpis.totalProfit)}%)
          </p>
          <ul className="mt-1 space-y-1.5">
            {findings.map((f) => (
              <li key={f.season} className="text-ink/80">
                <span className="font-semibold">
                  S{f.season + 1} {CROP[f.crop].short}
                  {f.yieldDrop > 0.001 ? `: yield −${f.yieldDrop < 0.01 ? "<1" : Math.round(f.yieldDrop * 100)}%` : ""}
                </span>
                {f.water && f.water.months.length > 0 && (
                  <span className="block text-ink/70">
                    <Droplets className="mr-1 inline size-3 align-[-2px]" aria-hidden />
                    {f.water.months.map((m) => `${m.month} ${Math.round(m.rain)} mm`).join(", ")} of rain, when it needed about{" "}
                    {Math.round(Math.max(...f.water.months.map((m) => m.need)))} mm a month: more than rain and stored soil water could supply.
                  </span>
                )}
                {f.heat && (
                  <span className="block text-ink/70">
                    <Thermometer className="mr-1 inline size-3 align-[-2px]" aria-hidden />
                    Afternoons averaged {f.heat.tmax.toFixed(1)} °C, above its {f.heat.limit} °C limit.
                  </span>
                )}
                {f.pumpExtra !== undefined && (
                  <span className="block text-ink/70">Irrigation kept the yield, but pumping cost {peso(f.pumpExtra)} more.</span>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm font-semibold">No change for this route, and why</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-ink/80">
            {tight && (
              <li>
                Even in the driest crop month ({tight.month}: {Math.round(tight.rain)} mm of rain plus {Math.round(tight.inSoil)} mm already in the soil),{" "}
                {CROP[tight.crop].short.toLowerCase()} needed only {Math.round(tight.need)} mm, so no crop ran short of water.
              </li>
            )}
            {hottest && (
              <li>
                The closest call on heat ({hottest.tmax.toFixed(1)} °C afternoons for {CROP[hottest.crop].short.toLowerCase()}) stayed under its {hottest.limit} °C limit.
              </li>
            )}
            {!tight && <li>This farm's rain still covered what these crops drink in every season.</li>}
          </ul>
        </>
      )}
      {Math.abs(now.kpis.avgErosion - normal.kpis.avgErosion) > 0.5 && (
        <p className="mt-2 text-ink/70">
          Erosion index with El Niño rain: {Math.round(normal.kpis.avgErosion)} → {Math.round(now.kpis.avgErosion)}.
        </p>
      )}
    </div>
  );
}
