import { Fragment } from "react";
import { BugOff, Check, CloudRain, Sprout, TriangleAlert, Wheat } from "lucide-react";
import type { PlanResult, Scenario, SeasonResult } from "../types";
import { CROP, FAMILY_BAR, FAMILY_LABEL } from "../data/crops";
import { Badge, InfoTip, peso, useCountUp } from "./ui";

const PLAN_DOT = { A: "bg-plan-a", B: "bg-plan-b", C: "bg-plan-c" } as const;

function warning(s: SeasonResult): string | null {
  const c = CROP[s.crop];
  if (s.waterLoss > 0.25) return `Too little rain for ${c.short.toLowerCase()} this season: about ${Math.round(s.waterLoss * 100)}% of the harvest lost.`;
  if (s.heatLoss > 0) return `Afternoons above ${c.heat_limit_c} °C damage ${c.short.toLowerCase()} flowers: about ${Math.round(s.heatLoss * 100)}% lost.`;
  return null;
}

function SeasonCell({ s, normal, scenario }: { s: SeasonResult; normal: SeasonResult; scenario: Scenario }) {
  const crop = CROP[s.crop];
  const Icon = crop.family === "Poaceae" ? Wheat : Sprout;
  const hit = scenario === "elnino" && normal.profit > 0 && s.profit < normal.profit * 0.95;
  const warn = warning(s);
  return (
    <li
      className={`flex gap-3 rounded-md border p-3 transition-colors duration-200 ease-field ${hit ? "border-sun bg-sun-tint" : "border-border bg-card"}`}
      style={{ transitionDelay: `${s.index * 60}ms` }}
    >
      <span aria-hidden className={`w-1 shrink-0 rounded-full ${FAMILY_BAR[crop.family]}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="micro text-olive">
            S{s.index + 1} · {s.kind} · {s.label}
          </span>
          {warn && (
            <span className="text-badge-critical-fg">
              <InfoTip label="this warning" align="right">
                <span className="flex gap-2">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-badge-critical-fg" aria-hidden />
                  {warn}
                </span>
              </InfoTip>
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 font-display text-xl leading-6 font-medium">
          <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          {crop.short}
          <span className="sr-only">({FAMILY_LABEL[crop.family]})</span>
        </div>
        <div className="mt-0.5 text-sm text-muted-foreground tabular">
          {peso(s.profit)} · soil N {Math.round(s.nStart)} → {Math.round(s.nEnd)}
        </div>
        {s.bareMonths.length > 0 && (
          <div className="mt-1.5">
            <Badge tone="warn" icon={CloudRain}>
              Bare in rain: {s.bareMonths.join(", ")}
            </Badge>
          </div>
        )}
      </div>
    </li>
  );
}

function Kpi({ label, value, delta }: { label: string; value: string; delta?: string | null }) {
  return (
    <div className="rounded-md bg-muted px-2.5 py-2">
      <div className="micro text-olive">{label}</div>
      <div className="font-display text-xl leading-6 font-medium tabular">{value}</div>
      {delta && <div className="text-sm font-bold text-sun-strong tabular">{delta}</div>}
    </div>
  );
}

export function PlanColumn({
  plan,
  normal,
  scenario,
  chosen,
  onChoose,
  waterWord,
}: {
  plan: PlanResult;
  normal: PlanResult;
  scenario: Scenario;
  chosen: boolean;
  onChoose: () => void;
  waterWord: string;
}) {
  const k = plan.kpis;
  const profit = useCountUp(k.totalProfit);
  const nFinal = useCountUp(k.nFinal);
  const elnino = scenario === "elnino";
  const recommended = plan.id === "B";
  const profitDelta = normal.kpis.totalProfit !== 0 ? Math.round(((k.totalProfit - normal.kpis.totalProfit) / Math.abs(normal.kpis.totalProfit)) * 100) : 0;
  const nDelta = Math.round(k.nFinal - normal.kpis.nFinal);
  const waterDelta = Math.round(k.waterMm - normal.kpis.waterMm);
  const sign = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "±0");

  return (
    <article
      aria-labelledby={`plan-${plan.id}`}
      className={`hud relative flex flex-col rounded-lg bg-card p-4 ${recommended ? "border-2 border-primary" : "border border-border"}`}
    >
      {recommended && (
        <span className="micro absolute -top-3 left-6 rounded-full bg-chartreuse px-3 py-0.5 text-foreground">Recommended</span>
      )}
      <header className="flex items-center gap-2">
        <span aria-hidden className={`inline-flex size-8 items-center justify-center rounded-full font-display text-lg font-medium text-[#f4ede6] ${PLAN_DOT[plan.id]}`}>
          {plan.id}
        </span>
        <div>
          <h3 id={`plan-${plan.id}`} className="text-2xl leading-7 font-medium">
            Plan {plan.id} · {plan.name}
          </h3>
          <p className="text-sm text-muted-foreground">{plan.promise}</p>
        </div>
      </header>

      <ol className="mt-4 space-y-1.5" aria-label={`Plan ${plan.id} seasons`}>
        {plan.seasons.map((s, i) => (
          <Fragment key={s.index}>
            {i > 0 && s.pestBroken && (
              <li className="flex justify-center">
                <Badge tone="good" icon={BugOff}>
                  Pest Cycle Broken
                </Badge>
              </li>
            )}
            <SeasonCell s={s} normal={normal.seasons[i]} scenario={scenario} />
          </Fragment>
        ))}
      </ol>

      <div className={`mt-4 grid grid-cols-2 gap-1.5 rounded-md p-1 transition-colors duration-200 ${elnino ? "bg-sun-tint" : ""}`}>
        <Kpi label="3-year profit" value={peso(profit)} delta={elnino ? `${sign(profitDelta)}% in El Niño` : null} />
        <Kpi label="Soil N at end" value={`${Math.round(nFinal)} / 100`} delta={elnino && nDelta !== 0 ? `${sign(nDelta)} in El Niño` : null} />
        <Kpi label={waterWord} value={`${Math.round(k.waterMm)} mm`} delta={elnino && waterDelta !== 0 ? `${sign(waterDelta)} mm in El Niño` : null} />
        <Kpi label="Erosion risk" value={k.erosionLevel} />
      </div>

      <div className="mt-4">
        <h4 className="text-sm font-bold">Why this route</h4>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
          {plan.why.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        onClick={onChoose}
        aria-pressed={chosen}
        className={`micro mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-4 transition-colors duration-150 ${
          chosen ? "bg-primary text-primary-foreground" : "border border-input bg-card text-foreground hover:bg-muted"
        }`}
      >
        {chosen && <Check className="size-5" aria-hidden />}
        {chosen ? "Chosen" : "Choose this plan"}
      </button>
    </article>
  );
}
