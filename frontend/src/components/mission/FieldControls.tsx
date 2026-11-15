import { AlertTriangle, BugOff, CloudRain } from "lucide-react";
import type { PlanId, SeasonResult } from "../../types";
import { seasonAlerts } from "../../utils/seasonAlerts";

export type Choice = PlanId | "custom";

export function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
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

/** Per-season flags: crop wilt / net loss (red triangle), pest cycle broken (green bug), bare soil in heavy-rain months (blue cloud). */
export function SeasonFlags({ season }: { season: SeasonResult }) {
  const bare = season.bareMonths.length > 0;
  const alert = seasonAlerts(season);
  if (!alert.severe && !season.pestBroken && !bare) return <span className="h-3.5" aria-hidden />;
  const alertTitle = [alert.wiltRisk && "Crop wilt / drought risk", alert.netLoss && "Net loss"].filter(Boolean).join(" · ");
  return (
    <span className="flex h-3.5 items-center gap-0.5">
      {alert.severe && (
        <span title={alertTitle} className="text-red-300">
          <AlertTriangle className="size-3" aria-hidden />
          <span className="sr-only">{alertTitle}</span>
        </span>
      )}
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
