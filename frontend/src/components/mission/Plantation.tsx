import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowDown, Crosshair } from "lucide-react";
import type { Family, PlanId, PlanResult, Preset, Scenario } from "../../types";
import { CROP } from "../../data/crops";
import { peso, prefersReducedMotion, Switch } from "../ui";

const FAMILY_VAR: Record<Family, string> = {
  Poaceae: "var(--family-poaceae)",
  Fabaceae: "var(--family-fabaceae)",
  Convolvulaceae: "var(--family-convolvulaceae)",
};
const STEP_MS = 430; // one season planted every 430 ms

/** Plant drawings, defined once and reused by every plant in the field. */
function PlantDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <symbol id="plant-Poaceae" viewBox="0 0 20 32">
          <path d="M10 32V7" stroke="currentColor" strokeWidth="1.6" fill="none" />
          <path d="M10 22C5 19 3 15 3 12M10 18c5-3 7-7 7-10" stroke="currentColor" strokeWidth="1.4" fill="none" />
          <ellipse cx="10" cy="6" rx="2.6" ry="6" fill="currentColor" />
        </symbol>
        <symbol id="plant-Fabaceae" viewBox="0 0 20 32">
          <path d="M10 32V16" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="6" cy="16" r="5" fill="currentColor" />
          <circle cx="14" cy="15" r="5" fill="currentColor" />
          <circle cx="10" cy="9" r="5.5" fill="currentColor" />
        </symbol>
        <symbol id="plant-Convolvulaceae" viewBox="0 0 20 32">
          <path d="M10 32V20" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10 22C3 22 1 14 6 11c2-1 4 0 4 2 0-2 2-3 4-2 5 3 3 11-4 11z" fill="currentColor" />
          <path d="M10 13C6 11 6 5 10 3c4 2 4 8 0 10z" fill="currentColor" opacity="0.8" />
        </symbol>
      </defs>
    </svg>
  );
}

/** Frames 3–4: the field plants itself season by season, then the stats panel slides in. */
export function Plantation({
  preset,
  plans,
  normal,
  planId,
  onPlan,
  scenario,
  onScenario,
  onBack,
  onOpenPlanner,
}: {
  preset: Preset;
  plans: PlanResult[];
  normal: PlanResult[];
  planId: PlanId;
  onPlan: (id: PlanId) => void;
  scenario: Scenario;
  onScenario: (on: boolean) => void;
  onBack: () => void;
  onOpenPlanner: () => void;
}) {
  const plan = plans.find((p) => p.id === planId)!;
  const base = normal.find((p) => p.id === planId)!;
  const reduced = prefersReducedMotion();
  const [grown, setGrown] = useState(reduced);
  const [season, setSeason] = useState(reduced ? 6 : -1);
  const [showStats, setShowStats] = useState(reduced);
  const narrow = typeof window !== "undefined" && window.innerWidth < 640;
  const perPlot = narrow ? { cols: 2, rows: 5 } : { cols: 3, rows: 6 };

  // Replant whenever the route changes.
  const key = plan.rotation.join("-");
  useEffect(() => {
    if (reduced) return;
    setGrown(false);
    setSeason(-1);
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setGrown(true), 60));
    for (let s = 0; s <= 6; s++) timers.push(window.setTimeout(() => setSeason(s), 60 + s * STEP_MS));
    timers.push(window.setTimeout(() => setShowStats(true), 60 + 6 * STEP_MS + 250));
    return () => timers.forEach(clearTimeout);
  }, [key, reduced]);

  const plantsOf = useMemo(
    () =>
      Array.from({ length: perPlot.cols * perPlot.rows }, (_, i) => ({
        c: i % perPlot.cols,
        r: Math.floor(i / perPlot.cols),
        jitter: ((i * 37) % 11) / 11 - 0.5,
      })),
    [perPlot.cols, perPlot.rows],
  );

  const current = season >= 0 && season < 6 ? plan.seasons[season] : null;
  const k = plan.kpis;
  const nDelta = Math.round(k.nFinal - k.nStart);

  return (
    <div className="absolute inset-0 flex flex-col lg:flex-row">
      <PlantDefs />
      {/* Field */}
      <div className={`plant-stage relative flex-1 ${showStats ? "lg:pr-0" : ""}`}>
        <div className="absolute top-20 left-4 z-10 sm:left-8">
          <p className="micro text-sakura">Step 03 / Planting</p>
          <h2 className="mt-1 font-display text-[clamp(26px,3.4vw,40px)] leading-tight font-normal tracking-[-0.02em]">
            Selected crops in {preset.name.split(" (")[0]}
          </h2>
          <p className="micro mt-2 h-4 text-[#f6efeb]/80 tabular" aria-live="polite">
            {current
              ? `Deploying · S${current.index + 1} ${current.kind} · ${CROP[current.crop].short}`
              : season >= 6
                ? `Plan ${plan.id} planted · 6 seasons · 3 years`
                : "Descending · preparing soil"}
          </p>
        </div>

        <div className="field-scene" style={{ ["--plots" as string]: 6 } as CSSProperties}>
          <div className="field-plane" key={key}>
            {plan.seasons.map((s, i) => {
              const crop = CROP[s.crop];
              const wilt = scenario === "elnino" && base.seasons[i].profit > 0 && s.profit < base.seasons[i].profit * 0.95;
              const done = season > i;
              return (
                <div
                  key={i}
                  className={`plot ${season === i ? "is-active" : ""} ${done ? "is-done" : ""}`}
                  style={{ ["--fam" as string]: FAMILY_VAR[crop.family] } as CSSProperties}
                >
                  <span className="plot-tag micro">
                    S{i + 1} · {crop.short}
                  </span>
                  {plantsOf.map((p, j) => (
                    <span
                      key={j}
                      className={`plant ${wilt ? "is-wilt" : ""}`}
                      style={
                        {
                          left: `${((p.c + 0.5) / perPlot.cols) * 100 + p.jitter * 6}%`,
                          top: `${((p.r + 0.6) / perPlot.rows) * 100}%`,
                          color: FAMILY_VAR[crop.family],
                          "--g": grown && season >= i ? 1 : 0,
                          "--d": `${(p.r * perPlot.cols + p.c) * 14}ms`,
                        } as CSSProperties
                      }
                    >
                      <svg viewBox="0 0 20 32">
                        <use href={`#plant-${crop.family}`} />
                      </svg>
                    </span>
                  ))}
                </div>
              );
            })}
            {/* The suit hovering over the active plot, with its scan beam */}
            <span
              aria-hidden
              className="drone"
              style={{ ["--x" as string]: `${(Math.min(Math.max(season, 0), 5) + 0.5) / 6}`, opacity: season >= 6 ? 0 : 1 } as CSSProperties}
            >
              <span className="drone-beam" />
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <aside
        className={`stats-panel ${showStats ? "is-in" : ""}`}
        aria-hidden={!showStats}
        aria-labelledby="stats-h"
      >
        <p className="micro text-sakura">Step 04 / Field data</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <h3 id="stats-h" className="font-display text-2xl font-normal tracking-[-0.02em]">
            Plan {plan.id} · {plan.name}
          </h3>
          <div className="flex gap-1" role="tablist" aria-label="Route">
            {(["A", "B", "C"] as PlanId[]).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={planId === id}
                onClick={() => onPlan(id)}
                className={`micro inline-flex size-9 items-center justify-center rounded-full border transition-colors duration-200 ${
                  planId === id ? "border-sakura bg-sakura text-foreground" : "border-[#f6efeb]/30 text-[#f6efeb] hover:bg-[#f6efeb]/10"
                }`}
              >
                {id}
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm text-[#f6efeb]/70">{plan.promise}</p>

        <p className="micro mt-4 text-[#f6efeb]/60">Field design</p>
        <ol className="mt-1.5 grid grid-cols-6 gap-1">
          {plan.seasons.map((s) => (
            <li key={s.index} className="rounded-sm px-1 py-1.5 text-center" style={{ background: `color-mix(in srgb, ${FAMILY_VAR[CROP[s.crop].family]} 70%, #1d240a)` }}>
              <span className="block text-[10px] leading-3 text-[#f6efeb]/75">S{s.index + 1}</span>
              <span className="block truncate text-[11px] leading-[14px] font-semibold">{CROP[s.crop].short}</span>
            </li>
          ))}
        </ol>

        <dl className="mt-4 grid grid-cols-2 gap-2">
          {[
            ["3-year profit", peso(k.totalProfit)],
            ["Soil nitrogen", `${Math.round(k.nStart)} → ${Math.round(k.nFinal)} (${nDelta >= 0 ? "+" : ""}${nDelta})`],
            ["Water shortfall", `${Math.round(k.waterMm)} mm`],
            ["Erosion risk", k.erosionLevel],
            ["Pest cycles broken", `${k.pestBreaks}`],
            ["Bare months in rain", `${k.bareMonthCount}`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md bg-[#f6efeb]/[0.06] px-2.5 py-2">
              <dt className="micro text-[10.5px] text-[#f6efeb]/60">{label}</dt>
              <dd className="font-display text-lg leading-6 tabular">{value}</dd>
            </div>
          ))}
        </dl>

        <label className="mt-4 flex items-center justify-between gap-3 rounded-md border border-[#f6efeb]/15 px-3 py-2">
          <span>
            <span className="block text-sm font-semibold">Dry spell (El Niño)</span>
            <span className="block text-xs text-[#f6efeb]/65">−25% rain, +1.5 °C</span>
          </span>
          <Switch checked={scenario === "elnino"} onChange={onScenario} label="Simulate El Niño or dry spell" />
        </label>

        <ul className="mt-3 list-disc space-y-1 pl-4 text-sm text-[#f6efeb]/85">
          {plan.why.slice(0, 2).map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>

        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          <button type="button" onClick={onOpenPlanner} className="micro btn-sweep inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-sakura px-4 text-foreground">
            Open full planner <ArrowDown className="size-4" aria-hidden />
          </button>
          <button type="button" onClick={onBack} className="micro inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#f6efeb]/40 px-4 text-[#f6efeb] hover:bg-[#f6efeb]/10">
            <Crosshair className="size-4" aria-hidden /> New target
          </button>
        </div>
      </aside>
    </div>
  );
}
