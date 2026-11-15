import { Fragment, useState, type CSSProperties } from "react";
import { ArrowLeft, Loader2, Bean, BugOff, CloudRain, Sprout, TriangleAlert, Wheat } from "lucide-react";
import type { CropId, Family, PlanId, PlanRequest, PlanResult, Scenario, SeasonResult } from "../../types";
import { CROP, CROPS } from "../../data/crops";
import { Switch, formatPhpUsd } from "../ui";

const FAMILY_VAR: Record<Family, string> = {
  Poaceae: "var(--family-poaceae)",
  Fabaceae: "var(--family-fabaceae)",
  Convolvulaceae: "var(--family-convolvulaceae)",
};
const FAMILY_ICON = { Poaceae: Wheat, Fabaceae: Bean, Convolvulaceae: Sprout } as const;
export type Choice = PlanId | "custom";

export function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink/70">{label}</p>
      <div className="mt-1 flex gap-1 rounded-[8px] border border-ink/20 p-0.5">
        {options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={`min-h-9 flex-1 rounded-[6px] px-2 text-xs transition-colors duration-200 ${value === v ? "bg-ink text-foreground" : "text-ink/80 hover:bg-ink/10"}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Land size in hectares, typed. Shared by farm settings (step 04) and the field panel (step 05). */
export function HaInput({ id, value, onChange }: { id: string; value: number; onChange: (ha: number) => void }) {
  return (
    <span className="flex items-center gap-1">
      <input
        id={id}
        type="number"
        min={0.1}
        max={500}
        step={0.1}
        value={value}
        onChange={(e) => {
          const raw = Number(e.target.value);
          if (Number.isFinite(raw)) onChange(Math.round(Math.min(500, Math.max(0.1, raw)) * 100) / 100);
        }}
        className="w-16 rounded-[6px] border border-ink/25 bg-transparent px-1.5 py-0.5 text-right text-xs text-ink tabular"
        aria-label="Land size in hectares"
      />
      <span className="text-xs text-ink/70">ha</span>
    </span>
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
          <li key={i} className="flex flex-col items-center gap-0.5 rounded-[4px] py-1.5" style={{ background: `color-mix(in srgb, ${FAMILY_VAR[c.family]} 55%, #1d240a)` }}>
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
  scenario,
  onScenario,
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
  scenario: Scenario;
  onScenario: (s: Scenario) => void;
  notes: string[];
  busy: boolean;
  onPlant: () => void;
  onBack: () => void;
}) {
  const [slot, setSlot] = useState(0);
  const cards: { id: Choice; plan: PlanResult }[] = [...plans.map((p) => ({ id: p.id as Choice, plan: p })), { id: "custom", plan: custom }];
  const sum = req.weights.water + req.weights.soil + req.weights.econ || 1;
  const ha = Number.isFinite(req.landSizeHa) && req.landSizeHa > 0 ? req.landSizeHa : 1;
  const sliderHa = Math.min(20, Math.max(0.25, ha));
  const sliderFill = ((sliderHa - 0.25) / (20 - 0.25)) * 100;

  return (
    <div className="pick-wrap">
      <div className="pick-panel">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-[clamp(24px,3vw,36px)] leading-tight font-normal tracking-[-0.02em]">What should grow in {farmName}?</h2>
            <p className="text-sm text-ink/70">Choose a route for the next 6 seasons, or build your own.</p>
          </div>
          <button type="button" onClick={onBack} className="btn btn-secondary">
            <ArrowLeft className="size-4" aria-hidden /> Change farm
          </button>
        </div>

        {notes.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-[10px] border border-sun/50 bg-sun/[0.08] px-3 py-2 text-xs text-ink/80" aria-live="polite">
            {notes.map((n) => (
              <li key={n} className="flex items-start gap-1.5">
                <TriangleAlert className="mt-px size-3.5 shrink-0 text-sun" aria-hidden />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        )}

        <div className={`mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4 ${busy ? "opacity-60" : ""}`} role="radiogroup" aria-label="Route" onKeyDown={(e) => {
            const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
            if (!step) return;
            e.preventDefault();
            const ids = cards.map((c) => c.id);
            const next = ids[(ids.indexOf(choice) + step + ids.length) % ids.length];
            onChoice(next);
            (e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")[ids.indexOf(next)])?.focus();
          }}>
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
                {id === "B" && <span className="absolute -top-2.5 left-4 rounded-full bg-sakura px-2.5 py-0.5 text-[11px] font-semibold text-foreground">Recommended</span>}
                <span className="text-xs font-medium text-ink/70">{id === "custom" ? "Your own" : `Route ${id}`}</span>
                <span className="mt-0.5 block font-display text-xl leading-6">{plan.name}</span>
                <span className="block text-xs text-ink/70">{plan.promise}</span>
                <Chips rotation={plan.rotation} seasons={plan.seasons} />
                <span className="mt-3 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-xs text-ink/80 tabular">
                  <span className="whitespace-nowrap">{formatPhpUsd(plan.kpis.totalProfit)}</span>
                  <span className="whitespace-nowrap">{plan.seasons.reduce((acc, s) => acc + s.yieldT, 0).toFixed(1)} t</span>
                  <span className="whitespace-nowrap">Soil N → {Math.round(plan.kpis.nFinal)}</span>
                </span>
              </button>
            );
          })}
        </div>

        {choice === "custom" && (
          <div className="mt-4 rounded-[10px] border border-ink/20 bg-ink/[0.04] p-3 animate-[fade-up_0.4s_var(--mf-ease)_both]">
            <p className="text-xs font-medium text-ink/80">Build your rotation: tap a season, then a crop</p>
            <ol className="mt-2 flex items-center gap-1 overflow-x-auto pb-1">
              {customRotation.map((id, i) => {
                const c = CROP[id];
                const broke = i > 0 && CROP[customRotation[i - 1]].family !== c.family;
                return (
                  <Fragment key={i}>
                    {i > 0 && (
                      <li aria-hidden className={`shrink-0 ${broke ? "text-[#c9e86a]" : "text-ink/40"}`} title={broke ? "Pest cycle broken" : "Same family"}>
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
                        <span className="text-[10px] text-ink/70">S{i + 1} · {i % 2 ? "Dry" : "Wet"}</span>
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

        <div className="mt-4 rounded-[10px] border border-ink/12 p-3" data-tour="settings">
          <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2.5">
            <p className="text-sm font-semibold">Farm settings</p>
            <p className="text-xs text-ink/70 tabular">
              {ha} ha · {req.soil} · {req.irrigation === "rainfed" ? "rain only" : "irrigated"} · {req.goal === "cash" ? "cash crop" : "animal feed"} ·{" "}
              {scenario === "elnino" ? "El Niño (2015–16)" : "Normal climate"}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex items-center justify-between gap-3 rounded-[8px] border border-ink/15 px-3 py-2">
              <span>
                <span className="block text-xs font-semibold">El Niño (2015–16)</span>
                <span className="block text-[11px] text-ink/70">Simulate 2015–16 drought &amp; heat</span>
              </span>
              <Switch
                checked={scenario === "elnino"}
                onChange={(on) => onScenario(on ? "elnino" : "normal")}
                label="Simulate El Niño (2015–16)"
              />
            </label>
            <div className="rounded-[8px] border border-ink/15 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="land-size-ha" className="text-xs font-semibold">
                  Land size (ha)
                </label>
                <HaInput id="land-size-ha" value={ha} onChange={(landSizeHa) => onReq({ landSizeHa })} />
              </div>
              <input
                type="range"
                min={0.25}
                max={20}
                step={0.25}
                value={sliderHa}
                onChange={(e) => onReq({ landSizeHa: Number(e.target.value) })}
                aria-label="Land size slider in hectares"
                className="mf-range mt-1.5 h-5 w-full"
                style={{ ["--fill" as string]: `${sliderFill}%` } as CSSProperties}
              />
            </div>
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
            <Seg
              label="Seasonal budget / ha"
              value={String(req.overrides.maxBudgetPhp ?? "none")}
              options={[
                ["none", "No limit"],
                ["25000", "₱25k"],
                ["35000", "₱35k"],
                ["45000", "₱45k"],
              ]}
              onChange={(v) => onReq({ overrides: { ...req.overrides, maxBudgetPhp: v === "none" ? null : Number(v) } })}
            />
            <Seg
              label="Food-security staple"
              value={req.overrides.mustIncludeStaple ? "yes" : "no"}
              options={[["no", "Any crops"], ["yes", "Include rice/corn"]]}
              onChange={(v) => onReq({ overrides: { ...req.overrides, mustIncludeStaple: v === "yes" } })}
            />
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-xs font-medium text-ink/70">Exclude crops (optional)</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {CROPS.map((c) => {
                  const excluded = (req.overrides.excludedCrops ?? []).includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={excluded}
                      onClick={() => {
                        const prev = req.overrides.excludedCrops ?? [];
                        const next = excluded ? prev.filter((id) => id !== c.id) : [...prev, c.id];
                        if (next.length < CROPS.length) onReq({ overrides: { ...req.overrides, excludedCrops: next } });
                      }}
                      className={`rounded-[6px] border px-2.5 py-1 text-xs transition-colors ${
                        excluded
                          ? "border-[#e0896f]/70 bg-[#a9452c]/25 text-[#f3b49f] line-through"
                          : "border-ink/20 text-ink/80 hover:bg-ink/10"
                      }`}
                    >
                      {c.short}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-xs font-medium text-ink/70">What matters most</p>
              <div className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-3">
                {(["water", "soil", "econ"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-2 text-xs">
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
          </div>
        </div>

        <button type="button" onClick={onPlant} disabled={busy} className="btn btn-primary btn-lg mt-4 w-full">
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden /> Re-planning with your settings…
            </>
          ) : (
            `Plant ${choice === "custom" ? "my rotation" : `route ${choice}`}`
          )}
        </button>
      </div>
    </div>
  );
}
