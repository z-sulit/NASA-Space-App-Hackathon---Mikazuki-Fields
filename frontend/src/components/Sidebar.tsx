import { ChevronDown, Loader2, MapPin } from "lucide-react";
import type { CropId, Overrides, PlanRequest, Preset, Weights } from "../types";
import { CROPS } from "../data/crops";
import { FarmMap, type Pin } from "./FarmMap";
import { SectionTitle, Segmented } from "./ui";

function Slider({ label, value, share, onChange }: { label: string; value: number; share: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-sm">
        <span className="font-bold">{label}</span>
        <span className="tabular text-muted-foreground">{Math.round(share * 100)}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mf-range"
        style={{ ["--fill" as string]: `${value}%` }}
        aria-valuetext={`${Math.round(share * 100)} percent of the weight`}
      />
    </label>
  );
}

const selectCls =
  "mt-1.5 block min-h-11 w-full rounded-md border border-input bg-card px-3 text-base text-foreground";

export function Sidebar({
  presets,
  req,
  pin,
  pinNote,
  busy,
  dirty,
  collapsed,
  onToggleCollapsed,
  onChange,
  onPin,
  onPlan,
}: {
  presets: Preset[];
  req: PlanRequest;
  pin: Pin | null;
  pinNote: string | null;
  busy: boolean;
  dirty: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onChange: (patch: Partial<PlanRequest>) => void;
  onPin: (p: Pin | null) => void;
  onPlan: () => void;
}) {
  const sum = req.weights.water + req.weights.soil + req.weights.econ || 1;
  const setW = (k: keyof Weights) => (v: number) => onChange({ weights: { ...req.weights, [k]: v } });
  const setO = (patch: Partial<Overrides>) => onChange({ overrides: { ...req.overrides, ...patch } });
  const preset = presets.find((p) => p.id === req.presetId)!;
  const groundTruthOn =
    req.overrides.soilTestN !== "untested" || req.overrides.soilPh !== null || req.overrides.pestLastSeason || req.overrides.floods !== "never";

  return (
    <section aria-labelledby="farm-h" className="hud rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle id="farm-h" num="01" kicker="Input">
          Your farm
        </SectionTitle>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-bold text-primary lg:hidden"
        >
          {collapsed ? "Edit" : "Hide"}
          <ChevronDown className={`size-4 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`} aria-hidden />
        </button>
      </div>

      {collapsed && (
        <p className="mt-1 text-sm text-muted-foreground lg:hidden">
          {preset.name} · {req.soil} · {req.irrigation} · {req.goal === "cash" ? "cash crop" : "forage"}
        </p>
      )}

      <div className={`mt-4 space-y-5 ${collapsed ? "hidden lg:block" : ""}`}>
        <div>
          <FarmMap
            presets={presets}
            selectedId={req.presetId}
            pin={pin}
            onSelectPreset={(id) => {
              onPin(null);
              onChange({ presetId: id });
            }}
            onPin={onPin}
          />
          <p className="mt-1.5 flex items-start gap-1 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            {pinNote ?? "Tap a green pin, or tap your farm's location."}
          </p>
        </div>

        <label className="block text-sm font-bold">
          Farm area
          <select className={selectCls} value={req.presetId} onChange={(e) => (onPin(null), onChange({ presetId: e.target.value }))}>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-bold">
          What do you plant now?
          <select className={selectCls} value={req.baselineCrop} onChange={(e) => onChange({ baselineCrop: e.target.value as CropId })}>
            {CROPS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <Segmented
          legend="Soil type"
          value={req.soil}
          onChange={(soil) => onChange({ soil })}
          options={[
            { value: "clay", label: "Clay" },
            { value: "loam", label: "Loam" },
            { value: "sandy", label: "Sandy" },
          ]}
        />
        <Segmented
          legend="Water"
          value={req.irrigation}
          onChange={(irrigation) => onChange({ irrigation })}
          options={[
            { value: "rainfed", label: "Rain only" },
            { value: "irrigated", label: "Irrigated" },
          ]}
        />
        <Segmented
          legend="Goal"
          value={req.goal}
          onChange={(goal) => onChange({ goal })}
          options={[
            { value: "cash", label: "Cash crop" },
            { value: "forage", label: "Animal feed" },
          ]}
        />

        <fieldset className="space-y-1">
          <legend className="mb-1 text-sm font-bold">What matters most?</legend>
          <Slider label="Save water" value={req.weights.water} share={req.weights.water / sum} onChange={setW("water")} />
          <Slider label="Rebuild soil" value={req.weights.soil} share={req.weights.soil / sum} onChange={setW("soil")} />
          <Slider label="Earn more" value={req.weights.econ} share={req.weights.econ / sum} onChange={setW("econ")} />
        </fieldset>

        <details className="group rounded-md border border-border bg-background" open={groundTruthOn || undefined}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-sm font-bold">
            I know something the satellite doesn't
            <ChevronDown className="size-4 transition-transform duration-200 group-open:rotate-180" aria-hidden />
          </summary>
          <div className="space-y-4 px-3 pb-3">
            <Segmented
              legend="Soil test: nitrogen"
              value={req.overrides.soilTestN}
              onChange={(soilTestN) => setO({ soilTestN })}
              options={[
                { value: "untested", label: "Not tested" },
                { value: "low", label: "Low" },
                { value: "medium", label: "Med" },
                { value: "high", label: "High" },
              ]}
            />
            <label className="block text-sm font-bold">
              Soil pH (if tested)
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min={3}
                max={9}
                placeholder="e.g. 5.8"
                value={req.overrides.soilPh ?? ""}
                onChange={(e) => setO({ soilPh: e.target.value === "" ? null : Number(e.target.value) })}
                className={selectCls}
              />
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-bold">
              <input
                type="checkbox"
                checked={req.overrides.pestLastSeason}
                onChange={(e) => setO({ pestLastSeason: e.target.checked })}
                className="size-5 accent-[var(--primary)]"
              />
              Pests hit my last crop
            </label>
            <Segmented
              legend="My field floods in the…"
              value={req.overrides.floods}
              onChange={(floods) => setO({ floods })}
              options={[
                { value: "never", label: "Never" },
                { value: "wet", label: "Wet season" },
                { value: "dry", label: "Dry season" },
              ]}
            />
          </div>
        </details>

        <button
          type="button"
          onClick={onPlan}
          disabled={busy}
          className="micro btn-sweep inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-primary-foreground [--sweep:var(--hero-mid)] disabled:opacity-70"
        >
          {busy && <Loader2 className="size-5 animate-spin" aria-hidden />}
          {busy ? "Planning…" : "Plan my 3 routes"}
        </button>
        {dirty && !busy && <p className="text-center text-sm text-sun-strong">You changed something. Plan again to update the routes.</p>}
      </div>
    </section>
  );
}
