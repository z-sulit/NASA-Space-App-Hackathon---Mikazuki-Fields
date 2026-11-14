import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { ArrowLeft, ArrowRight, Crosshair, Info, Loader2, Lock, MapPin, Sprout } from "lucide-react";
import type { CropId, PlanRequest, PlansResponse, Preset, Scenario } from "../../types";
import { climate } from "../../engine/simulate";
import { customPlan } from "../../engine/plans";
import { fetchPlans } from "../../api/client";
import { fetchPointPreset, inPhilippines } from "../../api/power";
import { CROP } from "../../data/crops";
import { Emblem } from "../Emblem";
import { peso, prefersReducedMotion, Switch, useScramble } from "../ui";
import { TargetMap, type LatLon, type TargetMapHandle } from "./TargetMap";
import { PickPlants, type Choice } from "./PickPlants";
import { PlantField } from "./PlantField";
import type { FieldHandle } from "../../three/tileField";

/** Must match EXIT_MS in three/tileField.ts (kept here so the 3D chunk stays lazy). */
const EXIT_MS = 1150;

/**
 * The whole app as one step-by-step mission (from the team's sketch):
 *   01 Start    green tile field, loading, START
 *   02 Target   cockpit view over the Philippines; tap anywhere to target a farm
 *   03 Descend  the suit hovers down to the farm
 *   04 Plants   pick a route, or build your own rotation
 *   05 Field    the field plants itself in 3D, with its data
 */
type Stage = "intro" | "leaving" | "target" | "locking" | "flying" | "plants" | "planting" | "rising";
const STEPS: { n: string; label: string; stages: Stage[] }[] = [
  { n: "01", label: "Start", stages: ["intro", "leaving"] },
  { n: "02", label: "Target", stages: ["target", "locking", "rising"] },
  { n: "03", label: "Descend", stages: ["flying"] },
  { n: "04", label: "Plants", stages: ["plants"] },
  { n: "05", label: "Field", stages: ["planting"] },
];

const DEFAULT_REQ: PlanRequest = {
  presetId: "bukidnon",
  baselineCrop: "corn",
  soil: "clay",
  irrigation: "rainfed",
  goal: "cash",
  weights: { water: 33, soil: 33, econ: 33 },
  overrides: { soilTestN: "untested", soilPh: null, pestLastSeason: false, floods: "never" },
};

function supportsWebGL() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Step 01 backdrop: WebGL tile field, or a flat CSS grid without WebGL / with reduced motion. */
function TileField({ exiting, onExited }: { exiting: boolean; onExited: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<FieldHandle | null>(null);
  const [gl, setGl] = useState(false);
  const exitRef = useRef(onExited);
  exitRef.current = onExited;

  useEffect(() => {
    if (prefersReducedMotion() || !supportsWebGL()) return;
    let dead = false;
    import("../../three/tileField")
      .then(({ createTileField }) => {
        if (dead || !host.current) return;
        try {
          handle.current = createTileField(host.current);
          setGl(true);
        } catch {
          setGl(false);
        }
      })
      .catch(() => {});
    return () => {
      dead = true;
      handle.current?.dispose();
      handle.current = null;
    };
  }, []);

  useEffect(() => {
    if (!exiting) return;
    if (handle.current) handle.current.exit(() => exitRef.current());
    else {
      const t = setTimeout(() => exitRef.current(), prefersReducedMotion() ? 0 : EXIT_MS);
      return () => clearTimeout(t);
    }
  }, [exiting]);

  return (
    // Fades out over the map underneath while the camera dives (see .tile-stage).
    <div ref={host} className={`tile-stage ${exiting ? "is-leaving" : ""}`}>
      {!gl && <div className="tile-fallback absolute inset-0" aria-hidden />}
    </div>
  );
}

function Readout({ label, value, live }: { label: string; value: string; live: boolean }) {
  const shown = useScramble(value, live, 520);
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[#f6efeb]/10 py-1.5">
      <dt className="micro text-[10.5px] text-[#f6efeb]/60">{label}</dt>
      <dd className="micro text-[13px] whitespace-pre text-[#f6efeb] tabular" aria-label={value}>
        {shown}
      </dd>
    </div>
  );
}

/** Cockpit glass: canopy struts, heading tape, altitude ladder. Purely decorative. */
function Canopy({ stage, ref }: { stage: Stage; ref?: Ref<HTMLDivElement> }) {
  // Outer: closes in around you once (and takes the pointer parallax). Inner: hover / thrust motion.
  const cls = stage === "intro" ? "is-pre" : stage === "flying" || stage === "rising" ? "is-flying" : "";
  return (
    <div ref={ref} className={`canopy ${cls}`} aria-hidden>
      <div className="canopy-body">
      <svg className="canopy-frame" viewBox="0 0 1600 900" preserveAspectRatio="none">
        <defs>
          <linearGradient id="strut" x1="0" x2="1">
            <stop offset="0" stopColor="#141a06" />
            <stop offset="0.6" stopColor="#2a3411" />
            <stop offset="1" stopColor="#4a5622" />
          </linearGradient>
        </defs>
        <path d="M0 0H1600V70C1300 40 300 40 0 70Z" fill="url(#strut)" opacity="0.92" />
        <path d="M0 70C40 300 70 600 110 900H0Z" fill="url(#strut)" opacity="0.9" />
        <path d="M1600 70C1560 300 1530 600 1490 900H1600Z" fill="url(#strut)" opacity="0.9" />
        <path d="M0 900C300 830 1300 830 1600 900Z" fill="#141a06" opacity="0.85" />
        <path d="M0 70C300 40 1300 40 1600 70" stroke="#f5bfcd" strokeOpacity="0.35" strokeWidth="2" fill="none" />
        <path d="M110 900C70 600 40 300 0 70M1490 900C1530 600 1560 300 1600 70" stroke="#f6efeb" strokeOpacity="0.12" strokeWidth="2" fill="none" />
      </svg>
      <div className="heading-tape">
        <span className="heading-ticks" />
        <span className="heading-mark" />
      </div>
      <div className="alt-ladder">
        <span className="alt-ticks" />
      </div>
      <div className="glass-glare" />
      </div>
    </div>
  );
}

export function Mission({ presets, onReady, topRight }: { presets: Preset[]; onReady: () => void; topRight: ReactNode }) {
  const [stage, setStage] = useState<Stage>("intro");
  const [progress, setProgress] = useState(0);
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [target, setTarget] = useState<Preset>(presets[0]);
  const [pin, setPin] = useState<LatLon | null>(null);
  const [acquiring, setAcquiring] = useState(false);
  const [liveData, setLiveData] = useState(false);
  const [mapNote, setMapNote] = useState<string | null>(null);
  const [req, setReq] = useState<PlanRequest>(DEFAULT_REQ);
  const [result, setResult] = useState<PlansResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState<Choice>("B");
  const [customRotation, setCustomRotation] = useState<CropId[]>(["corn", "mungbean", "corn", "sweet_potato", "corn", "peanut"]);
  const [season, setSeason] = useState(-1);
  const mapRef = useRef<TargetMapHandle>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const canopyRef = useRef<HTMLDivElement>(null);
  const [tilesAlive, setTilesAlive] = useState(true);
  const reduced = prefersReducedMotion();

  const planSeq = useRef(0);
  const plan = useCallback(async (r: PlanRequest, p: Preset) => {
    const seq = ++planSeq.current;
    setBusy(true);
    try {
      const res = await fetchPlans({ ...r, presetId: p.id }, p);
      if (seq === planSeq.current) setResult(res); // ignore answers to older requests
    } finally {
      if (seq === planSeq.current) setBusy(false);
    }
  }, []);
  // Warm the planner up during the intro so step 01 has something real to load.
  useEffect(() => {
    void plan(DEFAULT_REQ, presets[0]);
  }, [plan, presets]);

  // Loading bar: eases toward 90% and finishes once the first routes are computed.
  const ready = result !== null;
  useEffect(() => {
    if (stage !== "intro") return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / (reduced ? 1 : 1500));
      setProgress((p) => Math.max(p, ready && k >= 1 ? 100 : 90 * (1 - Math.pow(1 - k, 3))));
      if (!(ready && k >= 1)) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, stage, reduced]);
  const loaded = progress >= 100;
  useEffect(() => {
    if (loaded) onReady();
  }, [loaded, onReady]);

  // Cockpit parallax: the far map and the near canopy shift opposite ways with the pointer.
  // Written straight to the two layers once per frame (cheap, compositor-only).
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      raf = 0;
      viewRef.current?.style.setProperty("translate", `${(-10 * x).toFixed(1)}px ${(-8 * y).toFixed(1)}px`);
      canopyRef.current?.style.setProperty("translate", `${(16 * x).toFixed(1)}px ${(12 * y).toFixed(1)}px`);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x = (e.clientX / window.innerWidth) * 2 - 1;
      y = (e.clientY / window.innerHeight) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener("pointermove", move);
    return () => {
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  // Tiles have faded out: hand over to the cockpit, and free the tile scene's GPU
  // context only once the cockpit has settled (tearing it down mid-move stalls frames).
  const tilesGone = useCallback(() => {
    setStage((s) => (s === "leaving" ? "target" : s));
    setTimeout(() => setTilesAlive(false), 2500);
  }, []);

  const hovered = hoverId ? presets.find((p) => p.id === hoverId)! : null;
  const focus: Preset = stage === "target" && hovered ? hovered : target;
  const dry = climate(focus, "dry", scenario);
  const lat = `${Math.abs(focus.lat).toFixed(2)}° ${focus.lat >= 0 ? "N" : "S"}`;
  const lon = `${Math.abs(focus.lon).toFixed(2)}° ${focus.lon >= 0 ? "E" : "W"}`;
  const shortName = (p: Preset) => (p.id.startsWith("pin-") ? "Your farm" : p.name.split(" (")[0]);
  /** Mid-sentence form: "in your farm", "in Bukidnon". */
  const inName = (p: Preset) => (p.id.startsWith("pin-") ? "your farm" : shortName(p));

  const pickPreset = (id: string) => {
    setPin(null);
    setMapNote(null);
    setLiveData(false);
    setTarget(presets.find((p) => p.id === id)!);
  };
  const pickPoint = async (p: LatLon) => {
    if (!inPhilippines(p.lat, p.lon)) {
      setMapNote("Pick a point inside the Philippines.");
      return;
    }
    setMapNote(null);
    setPin(p);
    setAcquiring(true);
    const { preset, live } = await fetchPointPreset(p.lat, p.lon, presets);
    setAcquiring(false);
    setLiveData(live);
    if (!live) setMapNote("Live NASA data unavailable; using the nearest preset's climate.");
    setTarget(preset);
  };

  const lockOn = async () => {
    if (stage !== "target" || acquiring) return;
    const p = target;
    setStage("locking");
    const planning = plan(req, p); // compute this farm's routes while we fly
    await new Promise((r) => setTimeout(r, reduced ? 0 : 750));
    setStage("flying");
    await Promise.all([mapRef.current?.flyTo(p.lat, p.lon), planning]);
    setStage("plants");
  };
  const backToMap = async () => {
    setStage("rising");
    await mapRef.current?.reset();
    setStage("target");
  };

  // Farm-settings changes re-plan (debounced) while picking plants.
  const firstReq = useRef(true);
  useEffect(() => {
    if (firstReq.current) {
      firstReq.current = false;
      return;
    }
    if (stage !== "plants") return;
    const t = setTimeout(() => void plan(req, target), 350);
    return () => clearTimeout(t);
  }, [req]); // eslint-disable-line react-hooks/exhaustive-deps

  const custom = useMemo(() => customPlan(req, target, customRotation), [req, target, customRotation]);
  const chosen = useMemo(() => {
    if (!result) return null;
    if (choice === "custom") return { now: custom[scenario], normal: custom.normal };
    const i = ["A", "B", "C"].indexOf(choice);
    return { now: result[scenario][i], normal: result.normal[i] };
  }, [result, choice, custom, scenario]);

  const plots = chosen
    ? chosen.now.seasons.map((s, i) => ({
        family: CROP[s.crop].family,
        label: `S${i + 1} · ${CROP[s.crop].short}`,
        wilt: scenario === "elnino" && chosen.normal.seasons[i].profit > 0 && s.profit < chosen.normal.seasons[i].profit * 0.95,
      }))
    : [];
  const onSeason = useCallback((i: number) => setSeason(i), []);
  const stepIndex = STEPS.findIndex((s) => s.stages.includes(stage));
  const hudLive = stage !== "leaving";
  const canopyOn = ["intro", "leaving", "target", "locking", "flying", "rising"].includes(stage);
  const current = chosen && season >= 0 && season < 6 ? chosen.now.seasons[season] : null;

  return (
    <section
      aria-label="Mikazuki Fields"
      className="mission relative h-[100svh] overflow-clip text-[#f6efeb]"
      data-stage={stage}
    >
      {/* Map: mounted (and painted) from the start under the tiles, so it is ready
          the moment they fall away. Leaflet stays still; the zoom-in is a CSS scale. */}
      <div ref={viewRef} className="cockpit-view absolute inset-0">
          <TargetMap
            ref={mapRef}
            presets={presets}
            focus={stage === "plants" || stage === "planting" ? null : { lat: focus.lat, lon: focus.lon }}
            pin={pin}
            locked={stage !== "target"}
            onHover={setHoverId}
            onPickPreset={pickPreset}
            onPickPoint={(p) => void pickPoint(p)}
          />
          <div className={`mission-dim ${stage === "plants" || stage === "planting" ? "is-on" : ""}`} aria-hidden />
          <div className="hud-scan" aria-hidden />
      </div>

      {/* Step 01: tiles */}
      {tilesAlive && <TileField exiting={stage !== "intro"} onExited={tilesGone} />}

      {/* Cockpit glass over steps 02–03 (pre-mounted, invisible, during the intro) */}
      {canopyOn && <Canopy ref={canopyRef} stage={stage} />}

      <div className="hud-frame" aria-hidden />

      {/* Top bar */}
      <div className="relative z-40 mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 pt-4">
        <div className="flex items-center gap-2">
          <Emblem size={30} tile={false} />
          <span className="micro">Mikazuki Fields</span>
        </div>
        <div className="flex items-center gap-2">{topRight}</div>
      </div>

      {/* Step 01 */}
      {(stage === "intro" || stage === "leaving") && (
        <div className={`intro-copy ${stage === "leaving" ? "is-leaving" : ""}`}>
          <p className="micro text-sakura">Green tiles · NASA Space Apps 2026</p>
          <h1 className="mt-3 font-display text-[clamp(52px,min(11vw,17svh),150px)] leading-[0.88] font-normal tracking-[-0.03em]">
            <span className="line-mask">
              <span className="line-rise">Mikazuki</span>
            </span>
            <span className="line-mask">
              <span className="line-rise" style={{ animationDelay: "110ms" }}>
                Fields
              </span>
            </span>
          </h1>
          <p className="fade-up mt-4 max-w-[420px] text-[#f6efeb]/85" style={{ animationDelay: "400ms" }}>
            Plan your next 6 seasons with 10 years of NASA data. Run your hand over the field, then press start.
          </p>
          <div className="mt-6 h-14">
            {!loaded ? (
              <div className="w-[min(320px,80vw)]" role="progressbar" aria-label="Loading" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
                <div className="micro flex justify-between text-[#f6efeb]/75">
                  <span>Loading NASA data</span>
                  <span className="tabular">{String(Math.round(progress)).padStart(3, "0")}%</span>
                </div>
                <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-[#f6efeb]/20">
                  <div className="h-full rounded-full bg-sakura transition-[width] duration-150" style={{ width: `${progress}%` }} />
                </div>
              </div>
            ) : (
              <button
                type="button"
                autoFocus
                onClick={() => setStage("leaving")}
                disabled={stage === "leaving"}
                className="micro pop-in btn-sweep inline-flex min-h-14 items-center gap-3 rounded-full bg-sakura px-8 text-[14px] text-foreground"
              >
                Start <ArrowRight className="size-5" aria-hidden />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 02: cockpit targeting. Mounted (hidden) from START so its layout and paint
          happen while the tiles still cover the screen; revealed at the handover. */}
      {(stage === "leaving" || stage === "target" || stage === "locking") && (
        <div className={`cockpit-hud ${stage === "leaving" ? "is-pre" : ""}`} aria-hidden={stage === "leaving" || undefined}>
          <div className="hud-title">
            <p className="micro text-sakura">Step 02 / Targeting</p>
            <h2 className="mt-1 font-display text-[clamp(26px,3.4vw,44px)] leading-tight font-normal tracking-[-0.02em]">Select a location</h2>
            <p className={`micro mt-2 ${stage === "locking" ? "blink-3 text-sakura" : "text-[#f6efeb]/75"}`} aria-live="polite">
              {stage === "locking" ? "Target locked · descending" : acquiring ? "Acquiring NASA data…" : (mapNote ?? "Tap anywhere in the Philippines, or a preset farm")}
            </p>
          </div>

          <aside className="hud-panel hud-panel-left" aria-label="Target data">
            <p className="micro flex items-center gap-1.5 text-sakura">
              <MapPin className="size-3.5" aria-hidden /> Target
              {acquiring && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            </p>
            <p className="mt-1 font-display text-xl leading-6">{shortName(focus)}</p>
            <p className="text-[11px] text-[#f6efeb]/55">
              {focus.id.startsWith("pin-") ? (liveData ? "Live NASA POWER, 2015–2024" : "Nearest preset climate") : "Preset farm · NASA POWER 2015–2024"}
            </p>
            <dl className="mt-2">
              <Readout live={hudLive} label="Lat / Lon" value={`${lat} / ${lon}`} />
              <Readout live={hudLive} label="Dry-season rain" value={`${Math.round(dry.rain_mm)} MM`} />
              <Readout live={hudLive} label="Afternoon heat" value={`${dry.tmax_c.toFixed(1)} °C`} />
              <Readout live={hudLive} label="Soil thirst" value={dry.gwetroot.toFixed(2)} />
              <Readout live={hudLive} label="Daily water use" value={`${dry.et0_mm_day.toFixed(1)} MM/DAY`} />
            </dl>
          </aside>

          <aside className="hud-panel hud-panel-right" aria-label="Conditions">
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="micro block text-sakura">Dry spell</span>
                <span className="block text-xs text-[#f6efeb]/65">El Niño: −25% rain, +1.5 °C</span>
              </span>
              <Switch checked={scenario === "elnino"} onChange={(on) => setScenario(on ? "elnino" : "normal")} label="Simulate El Niño or dry spell" />
            </label>
            <dl className="mt-2">
              <Readout live={hudLive} label="Slope (sample)" value={`${focus.slope_pct}%`} />
              <Readout live={hudLive} label="Green cover (sample)" value={`NDVI ${focus.ndvi_dry_min.toFixed(2)}`} />
              <Readout live={hudLive} label="2015–16 El Niño" value={focus.elnino_2016_dry_rain_pct === null ? "—" : `${Math.round(focus.elnino_2016_dry_rain_pct)}% RAIN`} />
            </dl>
            <button
              type="button"
              onClick={() => void lockOn()}
              disabled={stage !== "target" || acquiring}
              className="micro btn-sweep mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-sakura px-4 text-foreground disabled:opacity-70"
            >
              {stage === "locking" ? <Lock className="size-4" aria-hidden /> : <Crosshair className="size-4" aria-hidden />}
              {stage === "locking" ? "Locked" : `Lock ${shortName(target)}`}
            </button>
          </aside>
        </div>
      )}

      {/* Step 03 */}
      {(stage === "flying" || stage === "rising") && (
        <div className="hud-title">
          <p className="micro text-sakura">{stage === "flying" ? "Step 03 / Descent" : "Returning to orbit"}</p>
          <p className="micro mt-2 text-[#f6efeb]/80" aria-live="polite">
            {stage === "flying" ? `Hovering to ${inName(target)} · ${lat} / ${lon}` : "Climbing · re-acquiring targets"}
          </p>
        </div>
      )}

      {/* Step 04 */}
      {stage === "plants" && result && (
        <PickPlants
          farmName={inName(target)}
          plans={result[scenario]}
          custom={custom[scenario]}
          choice={choice}
          onChoice={setChoice}
          customRotation={customRotation}
          onCustomRotation={setCustomRotation}
          req={req}
          onReq={(patch) => setReq((r) => ({ ...r, ...patch }))}
          busy={busy}
          onPlant={() => {
            setSeason(-1);
            setStage("planting");
          }}
          onBack={() => void backToMap()}
        />
      )}

      {/* Step 05 */}
      {stage === "planting" && chosen && (
        <div className="absolute inset-0 z-20 flex flex-col lg:flex-row">
          <div className="relative min-h-0 flex-1">
            <PlantField plots={plots} plantKey={`${choice}-${chosen.now.rotation.join("-")}`} onSeason={onSeason} />
            <div className="pointer-events-none absolute top-20 left-4 z-10 sm:left-8">
              <p className="micro text-sakura">Step 05 / Your field</p>
              <h2 className="mt-1 font-display text-[clamp(24px,3.2vw,40px)] leading-tight font-normal tracking-[-0.02em]">
                {chosen.now.custom ? "Your rotation" : `Route ${chosen.now.id}`} in {inName(target)}
              </h2>
              <p className="micro mt-2 h-4 text-[#f6efeb]/80 tabular" aria-live="polite">
                {current
                  ? `Planting · S${current.index + 1} ${current.kind} · ${CROP[current.crop].short}`
                  : season >= 6
                    ? "Planted · 6 seasons · 3 years · drag to look around"
                    : "Landing · preparing soil"}
              </p>
            </div>
          </div>

          <aside className={`stats-panel ${season >= 6 ? "is-in" : ""}`} aria-labelledby="stats-h">
            <p className="micro text-sakura">Field data</p>
            <h3 id="stats-h" className="mt-1 font-display text-2xl font-normal tracking-[-0.02em]">
              {chosen.now.name}
            </h3>
            <p className="text-sm text-[#f6efeb]/70">{chosen.now.promise}</p>
            <ol className="mt-3 grid grid-cols-6 gap-1">
              {chosen.now.seasons.map((s) => (
                <li
                  key={s.index}
                  className="rounded-sm px-1 py-1.5 text-center"
                  style={{ background: `color-mix(in srgb, var(--family-${CROP[s.crop].family.toLowerCase()}) 70%, #1d240a)` }}
                >
                  <span className="block text-[10px] leading-3 text-[#f6efeb]/75">S{s.index + 1}</span>
                  <span className="block truncate text-[11px] leading-[14px] font-semibold">{CROP[s.crop].short}</span>
                </li>
              ))}
            </ol>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              {[
                ["3-year profit", peso(chosen.now.kpis.totalProfit)],
                ["Soil nitrogen", `${Math.round(chosen.now.kpis.nStart)} → ${Math.round(chosen.now.kpis.nFinal)}`],
                ["Water shortfall", `${Math.round(chosen.now.kpis.waterMm)} mm`],
                ["Erosion risk", chosen.now.kpis.erosionLevel],
                ["Pest cycles broken", `${chosen.now.kpis.pestBreaks}`],
                ["Bare months in rain", `${chosen.now.kpis.bareMonthCount}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md bg-[#f6efeb]/[0.06] px-2.5 py-2">
                  <dt className="micro text-[10.5px] text-[#f6efeb]/60">{label}</dt>
                  <dd className="font-display text-lg leading-6 tabular">{value}</dd>
                </div>
              ))}
            </dl>
            <label className="mt-3 flex items-center justify-between gap-3 rounded-md border border-[#f6efeb]/15 px-3 py-2">
              <span>
                <span className="block text-sm font-semibold">Dry spell (El Niño)</span>
                <span className="block text-xs text-[#f6efeb]/65">Crops hit by the dry spell wilt</span>
              </span>
              <Switch checked={scenario === "elnino"} onChange={(on) => setScenario(on ? "elnino" : "normal")} label="Simulate El Niño or dry spell" />
            </label>
            <ul className="mt-3 list-disc space-y-1 pl-4 text-sm text-[#f6efeb]/85">
              {chosen.now.why.slice(0, 2).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <details className="mt-3 rounded-md border border-[#f6efeb]/12 px-3 py-2 text-xs text-[#f6efeb]/75">
              <summary className="flex cursor-pointer items-center gap-1.5 font-semibold text-[#f6efeb]">
                <Info className="size-3.5" aria-hidden /> Know the limits
              </summary>
              <p className="mt-1.5">
                NASA POWER weather is averaged over a grid cell about 50–70 km across; slope and green cover are sample values for now. Soil thirst comes from
                a model, not a sensor, and crop numbers are general. Test your soil at a DA regional soils laboratory and check any plan with your Municipal
                Agriculturist before switching crops.
              </p>
            </details>
            <div className="mt-auto flex flex-wrap gap-2 pt-4">
              <button
                type="button"
                onClick={() => setStage("plants")}
                className="micro btn-sweep inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-sakura px-4 text-foreground"
              >
                <Sprout className="size-4" aria-hidden /> Change plants
              </button>
              <button
                type="button"
                onClick={() => void backToMap()}
                className="micro inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#f6efeb]/40 px-4 text-[#f6efeb] hover:bg-[#f6efeb]/10"
              >
                <ArrowLeft className="size-4" aria-hidden /> New farm
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Step rail: where you are in the mission */}
      <ol className="step-rail" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s.n} className={i < stepIndex ? "is-done" : i === stepIndex ? "is-now" : ""} aria-current={i === stepIndex ? "step" : undefined}>
            <span className="micro">{s.n}</span>
            <span className="micro hidden sm:inline">{s.label}</span>
          </li>
        ))}
      </ol>

      {stage !== "intro" && (
        <p className="map-credit">
          ©{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap
          </a>{" "}
          · NASA POWER
        </p>
      )}
    </section>
  );
}
