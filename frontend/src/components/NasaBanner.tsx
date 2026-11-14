import type { ReactNode } from "react";
import { CloudRain, Droplets, Leaf, Mountain, Sun, Thermometer, type LucideIcon } from "lucide-react";
import type { Overrides, Preset, Scenario } from "../types";
import { climate } from "../engine/simulate";
import { InfoTip, SourcePill } from "./ui";

interface Metric {
  key: string;
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  tip: ReactNode;
  tech: string;
  sample?: boolean;
}

const thirstBand = (g: number) => (g >= 0.8 ? "Soaked" : g >= 0.6 ? "Comfortable" : g >= 0.4 ? "Thirsty" : "Very thirsty");
const slopeBand = (s: number) => (s < 5 ? "Low" : s <= 10 ? "Medium" : "High");
const coverBand = (n: number) => (n < 0.3 ? "Mostly bare" : n < 0.5 ? "Patchy" : "Green");

export function NasaBanner({ preset, scenario, overrides }: { preset: Preset; scenario: Scenario; overrides: Overrides }) {
  const dry = climate(preset, "dry", scenario);
  const wet = climate(preset, "wet", scenario);
  const elnino = scenario === "elnino";
  const litres = Math.round(dry.et0_mm_day * 10000).toLocaleString("en-PH");

  const metrics: Metric[] = [
    {
      key: "thirst",
      icon: Droplets,
      label: "Soil Thirst Level",
      value: thirstBand(dry.gwetroot),
      sub: `${dry.gwetroot.toFixed(2)} wetness · ${dry.label}`,
      tip: "Water left where roots drink, top ~1 m. 0 is bone dry, 1 is soaked.",
      tech: "GWETROOT · NASA POWER",
    },
    {
      key: "rain",
      icon: CloudRain,
      label: "Rain You Can Count On",
      value: `${Math.round(dry.rain_mm)} mm`,
      sub: `${dry.label} · ${Math.round(wet.rain_mm)} mm in ${wet.label}`,
      tip: "Average rain for this season from 10 years of NASA records (2015–2024).",
      tech: "PRECTOTCORR · NASA POWER",
    },
    {
      key: "heat",
      icon: Thermometer,
      label: "Afternoon Heat",
      value: `${dry.tmax_c.toFixed(1)} °C`,
      sub: `usual daily high · ${dry.label}`,
      tip: "The usual daily high. Corn and rice flowers get damaged above about 35 °C.",
      tech: "T2M_MAX · NASA POWER",
    },
    {
      key: "water",
      icon: Sun,
      label: "Daily Water Use",
      value: `${dry.et0_mm_day.toFixed(1)} mm/day`,
      sub: `≈ ${litres} L per hectare`,
      tip: "Water that sun and heat pull from soil and leaves. 5 mm a day is 50,000 litres per hectare.",
      tech: "ET0 (Hargreaves) from T2M + ALLSKY_SFC_SW_DWN",
    },
    {
      key: "slope",
      icon: Mountain,
      label: "Erosion Slope Risk",
      value: slopeBand(preset.slope_pct),
      sub: `${preset.slope_pct}% slope`,
      tip: "How steep your field is. Steep + bare + heavy rain washes topsoil away.",
      tech: "SRTM 30 m slope",
      sample: preset.placeholders.includes("slope_pct"),
    },
    {
      key: "cover",
      icon: Leaf,
      label: "Green Cover Score",
      value: coverBand(preset.ndvi_dry_min),
      sub: `NDVI ${preset.ndvi_dry_min.toFixed(2)} · dry-season low`,
      tip: "How green your land looks from space. Below 0.3 is mostly bare soil.",
      tech: "MODIS MOD13Q1 NDVI",
      sample: preset.placeholders.includes("ndvi_dry_min"),
    },
  ];

  const groundTruth = [
    overrides.soilTestN !== "untested" && `soil N: ${overrides.soilTestN}`,
    overrides.soilPh !== null && `pH ${overrides.soilPh}`,
    overrides.pestLastSeason && "pests last season",
    overrides.floods !== "never" && `floods in ${overrides.floods} season`,
  ].filter(Boolean) as string[];

  return (
    <section aria-labelledby="nasa-h" className={`rounded-lg border p-4 transition-colors duration-200 ${elnino ? "border-sun bg-sun-tint" : "border-border bg-card"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="nasa-h" className="text-2xl font-bold">
          2 · What NASA sees{elnino && <span className="text-sun-strong"> in an El Niño year</span>}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          <SourcePill>POWER</SourcePill>
          <SourcePill>SRTM</SourcePill>
          <SourcePill>MODIS</SourcePill>
          <SourcePill>2015–2024</SourcePill>
        </div>
      </div>
      {groundTruth.length > 0 && (
        <p className="mt-2 inline-flex flex-wrap items-center gap-1 rounded-full bg-accent px-3 py-1 text-sm">
          <strong>Ground truth applied:</strong> {groundTruth.join(", ")}
        </p>
      )}
      <ul className="mt-3 grid auto-cols-[minmax(170px,1fr)] grid-flow-col gap-2 overflow-x-auto pb-1 sm:grid-flow-row sm:grid-cols-2 sm:overflow-visible md:grid-cols-3">
        {metrics.map((m, i) => (
          <li key={m.key} className="rounded-md border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-1">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{m.label}</span>
              <InfoTip label={m.label} align={i % 3 === 2 ? "right" : "left"}>
                <span className="block">{m.tip}</span>
                <span className="mt-2 block font-mono text-xs text-muted-foreground">{m.tech}</span>
              </InfoTip>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <m.icon className={`size-5 shrink-0 ${elnino && (m.key === "heat" || m.key === "rain") ? "text-sun-strong" : "text-primary"}`} aria-hidden />
              <span className="font-display text-[28px] leading-8 font-bold tabular">{m.value}</span>
            </div>
            <div className="mt-0.5 text-sm text-muted-foreground tabular">{m.sub}</div>
            {m.sample && <span className="mt-1 inline-block rounded-full bg-muted px-2 text-xs font-bold text-muted-foreground">sample value</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
