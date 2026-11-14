import { useCallback, useEffect, useMemo, useState } from "react";
import { Languages, Loader2, Sun } from "lucide-react";
import { Hero } from "./components/Hero";
import { Boot } from "./components/Boot";
import { CropHangar } from "./components/CropHangar";
import { Field3D } from "./components/Field3D";
import presetsJson from "./data/presets.json";
import type { PlanId, PlanRequest, PlansResponse, Preset, Scenario } from "./types";
import { fetchPlans } from "./api/client";
import { Sidebar } from "./components/Sidebar";
import type { Pin } from "./components/FarmMap";
import { NasaBanner } from "./components/NasaBanner";
import { PlanColumn } from "./components/PlanColumn";
import { Charts } from "./components/Charts";
import { LimitationsBox } from "./components/LimitationsBox";
import { LANGUAGES, LanguagePicker, type Lang } from "./components/LanguagePicker";
import { InfoTip, prefersReducedMotion, Reveal, SectionTitle, Switch } from "./components/ui";

const PRESETS = presetsJson as Preset[];

const DEFAULT_REQ: PlanRequest = {
  presetId: "bukidnon",
  baselineCrop: "corn",
  soil: "clay",
  irrigation: "rainfed",
  goal: "cash",
  weights: { water: 33, soil: 33, econ: 33 },
  overrides: { soilTestN: "untested", soilPh: null, pestLastSeason: false, floods: "never" },
};

const storage = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode: just don't remember */
    }
  },
};

function km(a: Pin, b: Pin) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export default function App() {
  // ?lang=en (or fil, ceb, ilo) in a shared link skips the picker; otherwise use the saved choice.
  const [lang, setLang] = useState<Lang | null>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("lang");
    if (LANGUAGES.some((l) => l.code === fromUrl)) return fromUrl as Lang;
    return storage.get("mf-lang") as Lang | null;
  });
  const [req, setReq] = useState<PlanRequest>(DEFAULT_REQ);
  const [planned, setPlanned] = useState<PlanRequest | null>(null);
  const [result, setResult] = useState<PlansResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [tab, setTab] = useState<PlanId>("B");
  const [chosen, setChosen] = useState<PlanId | null>(null);
  const [pin, setPin] = useState<Pin | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [booted, setBooted] = useState(prefersReducedMotion);
  const onBooted = useCallback(() => setBooted(true), []);

  const preset = PRESETS.find((p) => p.id === (planned ?? req).presetId)!;
  const dirty = planned !== null && JSON.stringify(planned) !== JSON.stringify(req);

  const plan = useCallback(async (r: PlanRequest) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetchPlans(r, PRESETS.find((p) => p.id === r.presetId)!);
      setResult(res);
      setPlanned(r);
      setChosen(null);
      if (window.matchMedia("(max-width: 1023px)").matches) setCollapsed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Planning failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void plan(DEFAULT_REQ);
  }, [plan]);

  const onPin = (p: Pin | null) => {
    setPin(p);
    if (!p) return;
    const nearest = [...PRESETS].sort((a, b) => km(p, a) - km(p, b))[0];
    setReq((r) => ({ ...r, presetId: nearest.id }));
  };
  const pinNote = useMemo(() => {
    if (!pin) return null;
    const p = PRESETS.find((x) => x.id === req.presetId)!;
    return `Your pin is ${Math.round(km(pin, p))} km from the ${p.name.split(" (")[0]} data. Live NASA data for any pin comes with the backend.`;
  }, [pin, req.presetId]);

  const toggleScenario = (on: boolean) => {
    const next: Scenario = on ? "elnino" : "normal";
    setScenario(next);
    if (!result) return;
    if (on) {
      const drop = (i: number) => {
        const n = result.normal[i].kpis.totalProfit;
        return n > 0 ? Math.round(((n - result.elnino[i].kpis.totalProfit) / n) * 100) : 0;
      };
      setAnnounce(`El Niño view. 3-year profit falls ${drop(0)}% for Status Quo, ${drop(1)}% for Balanced, ${drop(2)}% for Drought-Safe.`);
    } else setAnnounce("Normal-year view.");
  };

  const plans = result ? result[scenario] : null;
  const waterWord = (planned ?? req).irrigation === "irrigated" ? "Water pumped" : "Water shortfall";
  const langLabel = LANGUAGES.find((l) => l.code === lang)?.label;
  const pastDrop = preset.elnino_2016_dry_rain_pct;

  return (
    <div className="min-h-dvh">
      <Boot presets={PRESETS} onDone={onBooted} />

      {lang === null && booted && (
        <LanguagePicker
          onPick={(l) => {
            storage.set("mf-lang", l);
            setLang(l);
          }}
        />
      )}

      <Hero
        preset={preset}
        ready={booted}
        topRight={
          <>
          {result?.source === "demo" && (
            <span className="micro inline-flex min-h-11 items-center gap-1 rounded-full border border-[#f6efeb]/30 px-4 text-[#f6efeb]/85">
              Demo planner
              <InfoTip label="the demo planner" align="right" light>
                Routes are computed in your browser with the team's engine spec until the FastAPI backend is running. Rain, heat and soil
                wetness are real NASA POWER averages (2015–2024); slope and green cover are sample values.
              </InfoTip>
            </span>
          )}
          <button
            type="button"
            onClick={() => setLang(null)}
            className="micro inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[#f6efeb]/50 px-4 text-[#f6efeb] transition-colors duration-150 hover:bg-[#f6efeb]/10"
          >
            <Languages className="size-4" aria-hidden />
            {langLabel ?? "Language"}
          </button>
          </>
        }
      />

      {lang && lang !== "en" && (
        <p className="mx-auto mt-4 max-w-[1280px] px-4">
          <span className="block rounded-md bg-accent px-3 py-2 text-sm">{langLabel} translation is coming soon. Showing English for now.</span>
        </p>
      )}

      <CropHangar plans={result ? result.normal : null} />

      <div id="planner" className="mx-auto max-w-[1280px] scroll-mt-4 gap-6 px-4 pt-8 pb-6 lg:grid lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="mb-6 lg:sticky lg:top-4 lg:mb-0 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto">
          <Reveal>
          <Sidebar
            presets={PRESETS}
            req={req}
            pin={pin}
            pinNote={pinNote}
            busy={busy}
            dirty={dirty}
            collapsed={collapsed}
            onToggleCollapsed={() => setCollapsed((c) => !c)}
            onChange={(patch) => setReq((r) => ({ ...r, ...patch }))}
            onPin={onPin}
            onPlan={() => void plan(req)}
          />
          </Reveal>
        </aside>

        <main className="min-w-0 space-y-6">
          <Reveal delay={80}>
            <NasaBanner preset={preset} scenario={scenario} overrides={(planned ?? req).overrides} />
          </Reveal>

          <section aria-labelledby="routes-h" className="space-y-4">
            <Reveal delay={120}>
            <div
              className={`hud relative flex flex-wrap items-end justify-between gap-3 overflow-hidden rounded-lg border p-4 transition-colors duration-200 ${
                scenario === "elnino" ? "border-sun bg-sun-tint pl-6" : "border-border bg-card"
              }`}
            >
              {scenario === "elnino" && (
                <>
                  <span aria-hidden className="hazard hazard-move absolute inset-y-0 left-0 w-2" />
                  <span aria-hidden className="scan-sweep" />
                </>
              )}
              <SectionTitle id="routes-h" num="03" kicker="Routes">
                Compare 3 routes
              </SectionTitle>
              <label className="flex cursor-pointer items-center gap-3">
                <span className="text-right">
                  <span className="flex items-center justify-end gap-1.5 font-bold">
                    <Sun className={`size-5 transition-colors duration-200 ${scenario === "elnino" ? "text-sun" : "text-muted-foreground"}`} aria-hidden />
                    Simulate El Niño / Dry Spell
                  </span>
                  <span className="block text-sm text-muted-foreground">−25% rain, +1.5 °C</span>
                </span>
                <Switch checked={scenario === "elnino"} onChange={toggleScenario} label="Simulate El Niño or dry spell: 25% less rain, 1.5 °C hotter" />
              </label>
              {scenario === "elnino" && pastDrop !== null && (
                <p className="w-full text-sm">
                  <span className="micro blink-3 mr-2 text-sun-strong">Caution · Dry spell simulation</span>
                  In the 2015–16 El Niño, dry-season rain here was <strong className="text-sun-strong">{Math.abs(Math.round(pastDrop))}% below normal</strong>{" "}
                  (NASA POWER). This test uses 25%.
                </p>
              )}
            </div>
            </Reveal>
            <p className="sr-only" aria-live="polite">
              {announce}
            </p>

            {error && <p className="rounded-md bg-badge-critical-bg p-3 text-badge-critical-fg">{error}</p>}
            {result?.notes.map((n) => (
              <p key={n} className="rounded-md bg-badge-warn-bg p-3 text-sm text-badge-warn-fg">
                {n}
              </p>
            ))}

            {!plans ? (
              <div className="flex min-h-60 items-center justify-center gap-2 rounded-lg border border-border bg-card text-muted-foreground">
                <Loader2 className="size-5 animate-spin" aria-hidden /> Planning your routes…
              </div>
            ) : (
              <>
                <div role="tablist" aria-label="Plans" className="grid grid-cols-3 gap-1 rounded-md border border-input bg-card p-1 lg:hidden">
                  {plans.map((p) => (
                    <button
                      key={p.id}
                      role="tab"
                      type="button"
                      aria-selected={tab === p.id}
                      onClick={() => setTab(p.id)}
                      className={`min-h-11 rounded-sm px-2 text-sm font-bold transition-colors duration-150 ${tab === p.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    >
                      {p.id} · {p.name}
                    </button>
                  ))}
                </div>
                <div className={`relative grid gap-4 pt-2 lg:grid-cols-3 ${busy ? "opacity-60" : ""}`}>
                  {busy && <span aria-hidden className="scan-v" />}
                  {plans.map((p, i) => (
                    <div key={p.id} className={tab === p.id ? "" : "hidden lg:block"}>
                      <Reveal delay={i * 110}>
                      <PlanColumn
                        plan={p}
                        normal={result!.normal[i]}
                        scenario={scenario}
                        chosen={chosen === p.id}
                        onChoose={() => setChosen(chosen === p.id ? null : p.id)}
                        waterWord={waterWord}
                      />
                      </Reveal>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {plans && (
            <Reveal>
              <Field3D plans={plans} />
            </Reveal>
          )}

          {plans && result && (
            <Reveal>
              <Charts plans={plans} normal={result.normal} elnino={result.elnino} scenario={scenario} />
            </Reveal>
          )}
        </main>
      </div>

      <footer className="mx-auto max-w-[1280px] px-4 pb-10">
        <Reveal>
          <LimitationsBox />
        </Reveal>
      </footer>
    </div>
  );
}
