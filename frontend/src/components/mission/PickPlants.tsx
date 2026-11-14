import { Fragment, useState, type CSSProperties } from "react";
import { ArrowLeft, Bean, BugOff, ChevronDown, CloudRain, Sprout, TriangleAlert, Wheat } from "lucide-react";
import type { CropId, Family, PlanId, PlanRequest, PlanResult, SeasonResult } from "../../types";
import { CROP, CROPS } from "../../data/crops";
import { peso } from "../ui";

const FAMILY_VAR: Record<Family, string> = {
  Poaceae: "var(--family-poaceae)",
  Fabaceae: "var(--family-fabaceae)",
  Convolvulaceae: "var(--family-convolvulaceae)",
};
const FAMILY_ICON = { Poaceae: Wheat, Fabaceae: Bean, Convolvulaceae: Sprout } as const;
export type Choice = PlanId | "custom";

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div>
      <p className="micro text-[10.5px] text-[#f6efeb]/60">{label}</p>
      <div className="mt-1 flex gap-1 rounded-full border border-[#f6efeb]/20 p-0.5">
        {options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={`min-h-8 flex-1 rounded-full px-2 text-xs transition-colors duration-200 ${value === v ? "bg-[#f6efeb] text-foreground" : "text-[#f6efeb]/80 hover:bg-[#f6efeb]/10"}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Per-season flags: pest cycle broken (green bug), bare soil in heavy-rain months (blue cloud). */
export function SeasonFlags({ season }: { season: SeasonResult }) {
  const bare = season.bareMonths.length > 0;
  if (!season.pestBroken && !bare) return <span className="h-3.5" aria-hidden />;
  return (
    <span className="flex h-3.5 items-center gap-0.5">
      {season.pestBroken && (
        <span title="Pest cycle broken" className="text-[#c9e86a]">
          <BugOff className="size-3" aria-hidden />
          <span className="sr-only">Pest cycle broken</span>
        </span>
      )}
      {bare && (
        <span title={`Bare soil in heavy rain: ${season.bareMonths.join(", ")}`} className="text-[#8fd3ff]">
          <CloudRain className="size-3" aria-hidden />
          <span className="sr-only">Bare-soil erosion months: {season.bareMonths.join(", ")}</span>
        </span>
      )}
    </span>
  );
}

function Chips({ rotation, seasons }: { rotation: CropId[]; seasons?: SeasonResult[] }) {
  return (
    <ol className="mt-3 grid grid-cols-6 gap-1">
      {rotation.map((id, i) => {
        const c = CROP[id];
        const Icon = FAMILY_ICON[c.family];
        return (
          <li key={i} className="flex flex-col items-center gap-0.5 rounded-md py-1.5" style={{ background: `color-mix(in srgb, ${FAMILY_VAR[c.family]} 55%, #1d240a)` }}>
            <Icon className="size-4" aria-hidden />
            <span className="w-full truncate px-0.5 text-center text-[10px] leading-3">{c.short}</span>
            {seasons?.[i] && <SeasonFlags season={seasons[i]} />}
          </li>
        );
      })}
    </ol>
  );
}

const PH_VALUE = { untested: null, acidic: 5.1, neutral: 6.5 } as const;
type PhChoice = keyof typeof PH_VALUE;
const phChoice = (ph: number | null): PhChoice => (ph === null ? "untested" : ph < 5.5 ? "acidic" : "neutral");

/**
 * Step 04: pick what goes in the ground. Three computed routes plus "build your own",
 * with farm settings (soil, water, goal, priorities, what you know) that re-plan the routes.
 */
export function PickPlants({
  farmName,
  plans,
  custom,
  choice,
  onChoice,
  customRotation,
  onCustomRotation,
  req,
  onReq,
  notes,
  busy,
  onPlant,
  onBack,
}: {
  farmName: string;
  plans: PlanResult[];
  custom: PlanResult;
  choice: Choice;
  onChoice: (c: Choice) => void;
  customRotation: CropId[];
  onCustomRotation: (r: CropId[]) => void;
  req: PlanRequest;
  onReq: (patch: Partial<PlanRequest>) => void;
  notes: string[];
  busy: boolean;
  onPlant: () => void;
  onBack: () => void;
}) {
  const [slot, setSlot] = useState(0);
  const [settings, setSettings] = useState(false);
  const cards: { id: Choice; plan: PlanResult }[] = [...plans.map((p) => ({ id: p.id as Choice, plan: p })), { id: "custom", plan: custom }];
  const sum = req.weights.water + req.weights.soil + req.weights.econ || 1;

  return (
    <div className="pick-wrap">
      <div className="pick-panel">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="micro text-sakura">Step 04 / Pick your plants</p>
            <h2 className="mt-1 font-display text-[clamp(24px,3vw,36px)] leading-tight font-normal tracking-[-0.02em]">What should grow in {farmName}?</h2>
            <p className="text-sm text-[#f6efeb]/70">Choose a route for the next 6 seasons, or build your own.</p>
          </div>
          <button type="button" onClick={onBack} className="micro inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[#f6efeb]/30 px-3 text-[#f6efeb] hover:bg-[#f6efeb]/10">
            <ArrowLeft className="size-4" aria-hidden /> Change farm
          </button>
        </div>

        {notes.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-xl border border-sun/50 bg-sun/[0.08] px-3 py-2 text-xs text-[#f6efeb]/90" aria-live="polite">
            {notes.map((n) => (
              <li key={n} className="flex items-start gap-1.5">
                <TriangleAlert className="mt-px size-3.5 shrink-0 text-sun" aria-hidden />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        )}

        <div className={`mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4 ${busy ? "opacity-60" : ""}`} role="radiogroup" aria-label="Route">
          {cards.map(({ id, plan }) => {
            const on = choice === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChoice(id)}
                className={`route-card ${on ? "is-on" : ""}`}
              >
                {id === "B" && <span className="micro absolute -top-2.5 left-4 rounded-full bg-sakura px-2.5 py-0.5 text-[10px] text-foreground">Recommended</span>}
                <span className="micro text-[10.5px] text-[#f6efeb]/60">{id === "custom" ? "Your own" : `Route ${id}`}</span>
                <span className="mt-0.5 block font-display text-xl leading-6">{plan.name}</span>
                <span className="block text-xs text-[#f6efeb]/65">{plan.promise}</span>
                <Chips rotation={plan.rotation} seasons={plan.seasons} />
                <span className="mt-3 flex justify-between text-xs text-[#f6efeb]/80 tabular">
                  <span>{peso(plan.kpis.totalProfit)}</span>
                  <span>Soil N → {Math.round(plan.kpis.nFinal)}</span>
                </span>
              </button>
            );
          })}
        </div>

        {choice === "custom" && (
          <div className="mt-4 rounded-xl border border-sakura/50 bg-sakura/[0.06] p-3 animate-[fade-up_0.4s_var(--mf-ease)_both]">
            <p className="micro text-[10.5px] text-sakura">Build your rotation: tap a season, then a crop</p>
            <ol className="mt-2 flex items-center gap-1 overflow-x-auto pb-1">
              {customRotation.map((id, i) => {
                const c = CROP[id];
                const broke = i > 0 && CROP[customRotation[i - 1]].family !== c.family;
                return (
                  <Fragment key={i}>
                    {i > 0 && (
                      <li aria-hidden className={`shrink-0 ${broke ? "text-[#c9e86a]" : "text-[#f6efeb]/25"}`} title={broke ? "Pest cycle broken" : "Same family"}>
                        <BugOff className="size-3.5" />
                      </li>
                    )}
                    <li className="shrink-0">
                      <button
                        type="button"
                        onClick={() => setSlot(i)}
                        aria-pressed={slot === i}
                        className={`slot-btn ${slot === i ? "is-on" : ""}`}
                        style={{ ["--fam" as string]: FAMILY_VAR[c.family] } as CSSProperties}
                      >
                        <span className="text-[10px] text-[#f6efeb]/65">S{i + 1} · {i % 2 ? "Dry" : "Wet"}</span>
                        <span className="text-xs font-semibold">{c.short}</span>
                      </button>
                    </li>
                  </Fragment>
                );
              })}
            </ol>
            <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-8">
              {CROPS.map((c) => {
                const Icon = FAMILY_ICON[c.family];
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      const next = [...customRotation];
                      next[slot] = c.id;
                      onCustomRotation(next);
                      setSlot((s) => Math.min(5, s + 1));
                    }}
                    className="crop-pick"
                    style={{ ["--fam" as string]: FAMILY_VAR[c.family] } as CSSProperties}
                  >
                    <Icon className="size-5" aria-hidden />
                    <span className="text-[11px] leading-3">{c.short}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-[#f6efeb]/12">
          <button type="button" onClick={() => setSettings((s) => !s)} aria-expanded={settings} className="flex min-h-11 w-full items-center justify-between px-3 text-sm">
            <span>
              <span className="font-semibold">Farm settings</span>
              <span className="text-[#f6efeb]/60"> · {req.soil}, {req.irrigation === "rainfed" ? "rain only" : "irrigated"}, {req.goal === "cash" ? "cash crop" : "animal feed"}</span>
            </span>
            <ChevronDown className={`size-4 transition-transform duration-200 ${settings ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {settings && (
            <div className="grid gap-3 px-3 pb-3 sm:grid-cols-2 lg:grid-cols-3">
              <Seg label="Soil" value={req.soil} options={[["clay", "Clay"], ["loam", "Loam"], ["sandy", "Sandy"]]} onChange={(soil) => onReq({ soil })} />
              <Seg label="Water" value={req.irrigation} options={[["rainfed", "Rain only"], ["irrigated", "Irrigated"]]} onChange={(irrigation) => onReq({ irrigation })} />
              <Seg label="Goal" value={req.goal} options={[["cash", "Cash crop"], ["forage", "Animal feed"]]} onChange={(goal) => onReq({ goal })} />
              <Seg
                label="Soil test: nitrogen"
                value={req.overrides.soilTestN}
                options={[["untested", "Not tested"], ["low", "Low"], ["medium", "Med"], ["high", "High"]]}
                onChange={(soilTestN) => onReq({ overrides: { ...req.overrides, soilTestN } })}
              />
              <Seg
                label="Pests hit my last crop"
                value={req.overrides.pestLastSeason ? "yes" : "no"}
                options={[["no", "No"], ["yes", "Yes"]]}
                onChange={(v) => onReq({ overrides: { ...req.overrides, pestLastSeason: v === "yes" } })}
              />
              <Seg
                label="Soil test: pH"
                value={phChoice(req.overrides.soilPh)}
                options={[["untested", "Not tested"], ["acidic", "Acidic 5.1"], ["neutral", "Neutral 6.5"]]}
                onChange={(v) => onReq({ overrides: { ...req.overrides, soilPh: PH_VALUE[v] } })}
              />
              <Seg
                label="Field floods in"
                value={req.overrides.floods}
                options={[["never", "Never"], ["wet", "Wet season"], ["dry", "Dry season"]]}
                onChange={(floods) => onReq({ overrides: { ...req.overrides, floods } })}
              />
              <div className="sm:col-span-2 lg:col-span-1">
                <p className="micro text-[10.5px] text-[#f6efeb]/60">What matters most</p>
                {(["water", "soil", "econ"] as const).map((k) => (
                  <label key={k} className="mt-1 flex items-center gap-2 text-xs">
                    <span className="w-16">{k === "water" ? "Save water" : k === "soil" ? "Soil" : "Earn more"}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={req.weights[k]}
                      onChange={(e) => onReq({ weights: { ...req.weights, [k]: Number(e.target.value) } })}
                      className="mf-range h-6 flex-1"
                      style={{ ["--fill" as string]: `${req.weights[k]}%` } as CSSProperties}
                    />
                    <span className="w-8 text-right tabular">{Math.round((req.weights[k] / sum) * 100)}%</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <button type="button" onClick={onPlant} disabled={busy} className="micro btn-sweep mt-4 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-sakura px-6 py-4 text-[14px] text-foreground disabled:opacity-60">
          {busy ? "Re-planning…" : `Plant ${choice === "custom" ? "my rotation" : `route ${choice}`}`}
        </button>
      </div>
    </div>
  );
}
