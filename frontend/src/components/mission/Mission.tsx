import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { ArrowLeft, ArrowRight, Crosshair, Info, Loader2, Lock, MapPin, RotateCcw, Sprout, Waves } from "lucide-react";
import type { CropId, PlanRequest, PlansResponse, Preset, Scenario } from "../../types";
import { climate } from "../../engine/simulate";
import { customPlan } from "../../engine/plans";
import { fetchPinFarm, fetchPlans, loadFarms, type DataSource } from "../../api/client";
import { inPhilippines } from "../../api/power";
import { checkLand } from "../../api/landcheck";
import { CROP } from "../../data/crops";
import { Emblem } from "../Emblem";
import { CountUp, formatPhpUsd, formatPhpUsdInText, InfoTip, prefersReducedMotion, Switch, useScramble } from "../ui";
import { TargetMap, type LatLon, type TargetMapHandle } from "./TargetMap";
import { PickPlants, SeasonFlags, type Choice } from "./PickPlants";
import { PlantField } from "./PlantField";
import { ElNinoReport } from "./ElNinoReport";
import { ElNinoAtmosphere } from "./ElNinoAtmosphere";
import { SeasonTimeline } from "./SeasonTimeline";
import { planSpan, planStartYear, seasonWindows } from "../../data/calendar";
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
  soil: "loam",
  irrigation: "rainfed",
  goal: "cash",
  weights: { water: 40, soil: 35, econ: 25 }, // backend PlanSliders defaults
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

/** Plain-English explanations for the NASA metrics (docs/frontend_spec.md, JargonTooltip table). */
const TIP = {
  rain: "Rain You Can Count On (PRECTOTCORR): average rain for this season from 10 years of NASA records (2015–2024).",
  heat: "Afternoon Heat (T2M_MAX): the usual daily high. Corn and rice flowers get damaged above about 35°C.",
  thirst: "Soil Thirst Level (GWETROOT): water left where roots drink, top ~1 m. 0 is bone dry, 1 is soaked.",
  et0: "Daily Water Use (ET0): water that sun and heat pull from soil and leaves. 5 mm a day is 50,000 litres per hectare.",
  slope: "Erosion Slope Risk (SRTM slope): how steep your field is. Steep + bare + heavy rain washes topsoil away.",
  ndvi: "Green Cover Score (MODIS NDVI): how green your land looks from space. Below 0.3 is mostly bare soil.",
} as const;

function Readout({ label, value, live, tip, tipAlign = "left" }: { label: string; value: string; live: boolean; tip?: string; tipAlign?: "left" | "right" }) {
  const shown = useScramble(value, live, 520);
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink/10 py-1.5">
      <dt className="micro flex items-center gap-1 text-[10.5px] text-ink/70">
        {label}
        {tip && (
          <InfoTip label={label} light align={tipAlign}>
            {tip}
          </InfoTip>
        )}
      </dt>
      <dd className="micro text-[13px] whitespace-pre text-ink tabular" aria-label={value}>
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

const PLAN_SOURCE: Record<DataSource, string> = {
  api: "Plans from the Mikazuki API",
  bundle: "Plans from the offline bundle (API not reachable)",
  demo: "Plans from the in-browser planner (API not reachable)",
};
const FARM_SOURCE: Record<DataSource, string> = {
  api: "Sample reference site · Full cached NASA POWER + SRTM + MODIS",
  bundle: "Sample reference site (offline) · Cached NASA POWER + SRTM + MODIS",
  demo: "Sample reference site · Cached NASA POWER + SRTM + MODIS",
};

/** The last farm and settings, so a returning farmer starts where they left off (this browser only). */
interface LastFarm {
  target: Preset;
  pin: LatLon | null;
  req: PlanRequest;
}
function readLastFarm(): LastFarm | null {
  try {
    const v = JSON.parse(localStorage.getItem("mf-last-farm") ?? "null") as LastFarm | null;
    return v && typeof v.target?.id === "string" && v.target.seasons?.dry && v.req?.weights ? v : null;
  } catch {
    return null;
  }
}
function saveLastFarm(v: LastFarm) {
  try {
    localStorage.setItem("mf-last-farm", JSON.stringify(v));
  } catch {
    /* private mode: just don't remember */
  }
}

export function Mission({ presets: bundled, onReady, topRight }: { presets: Preset[]; onReady: () => void; topRight?: ReactNode }) {
  // Preset farms: the app's bundled copy until the backend's measured data arrives.
  const [presets, setPresets] = useState<Preset[]>(bundled);
  const [farmSource, setFarmSource] = useState<DataSource>("demo");
  const [stage, setStage] = useState<Stage>("intro");
  const [progress, setProgress] = useState(0);
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [last] = useState(readLastFarm);
  const [target, setTarget] = useState<Preset>(last?.target ?? bundled[0]);
  const [pin, setPin] = useState<LatLon | null>(last?.pin ?? null);
  const [acquiring, setAcquiring] = useState(false);
  const [pinVia, setPinVia] = useState<"api" | "browser" | "nearest" | null>(null);
  const [mapNote, setMapNote] = useState<string | null>(last ? "Your last farm is ready. Lock it, or tap a new one." : null);
  const [checking, setChecking] = useState(false);
  const [tryAgain, setTryAgain] = useState<{ text: string; key: number } | null>(null);
  const [rejected, setRejected] = useState<(LatLon & { key: number }) | null>(null);
  const tapSeq = useRef(0);
  const [req, setReq] = useState<PlanRequest>(last?.req ?? DEFAULT_REQ);
  const [result, setResult] = useState<PlansResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState<Choice>("B");
  const [customRotation, setCustomRotation] = useState<CropId[]>(["corn", "mungbean", "corn", "sweet_potato", "corn", "peanut"]);
  const [season, setSeason] = useState(-1);
  // Season timeline: the spotlighted season (null = all), the pill being hovered, autoplay.
  const [focusSeason, setFocusSeason] = useState<number | null>(null);
  const [hoverSeason, setHoverSeason] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const startYear = useMemo(() => planStartYear(), []);
  const windows = useMemo(() => seasonWindows(startYear), [startYear]);
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
    void plan(last?.req ?? DEFAULT_REQ, last?.target ?? bundled[0]);
    let dead = false;
    void loadFarms(bundled).then((r) => {
      if (dead) return;
      setPresets(r.presets);
      setFarmSource(r.source);
      setTarget((t) => r.presets.find((p) => p.id === t.id) ?? t);
    });
    return () => {
      dead = true;
    };
  }, [plan, bundled]);

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
  /** Where a terrain value comes from: measured, anchored to the nearest reference site, or a sample. */
  const sampleTag = (p: Preset, key: string, measured: string) =>
    !p.placeholders.includes(key) ? measured : p.id.startsWith("pin-") ? "nearest ref" : "sample";
  /** Mid-sentence form: "in your farm", "in Bukidnon". */
  const inName = (p: Preset) => (p.id.startsWith("pin-") ? "your farm" : shortName(p));

  const pickPreset = (id: string) => {
    setPin(null);
    setMapNote(null);
    setPinVia(null);
    setTarget(presets.find((p) => p.id === id)!);
  };
  const refuse = (p: LatLon, text: string) => {
    const key = Date.now();
    setRejected({ ...p, key });
    setTryAgain({ text, key });
  };
  const pickPoint = async (tap: LatLon) => {
    let p = tap;
    const seq = ++tapSeq.current;
    // A new tap supersedes any check or fetch still running for an older one.
    setMapNote(null);
    setTryAgain(null);
    setChecking(false);
    setAcquiring(false);
    if (!inPhilippines(p.lat, p.lon)) {
      refuse(p, "That's outside the Philippines.");
      return;
    }
    // Farms need land: refuse seas, lakes and rivers before asking NASA for climate.
    setChecking(true);
    const ground = await checkLand(p.lat, p.lon);
    if (seq !== tapSeq.current) return; // a newer tap took over
    setChecking(false);
    if (ground.kind === "water") {
      refuse(p, "That's water (sea, lake or river). A farm needs land.");
      return;
    }
    setRejected(null);
    if (ground.snapped) p = { lat: ground.snapped.lat, lon: ground.snapped.lon };
    setPin(p);
    setAcquiring(true);
    const { preset, live, via } = await fetchPinFarm(p.lat, p.lon, presets);
    if (seq !== tapSeq.current) return;
    setAcquiring(false);
    setPinVia(via);
    if (!live) setMapNote("Live NASA data unavailable; using the nearest reference site's climate & terrain.");
    else if (ground.snapped) setMapNote(`Moved your pin ${Math.round(ground.snapped.meters)} m onto the nearest land.`);
    else if (ground.kind === "unknown") setMapNote("Couldn't check the ground here (map offline); treating it as land.");
    setTarget(preset);
  };

  const lockOn = async () => {
    if (stage !== "target" || acquiring || checking) return;
    const p = target;
    saveLastFarm({ target: p, pin, req });
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
    setBusy(true); // instant feedback; the plan itself follows the debounce
    const t = setTimeout(() => void plan(req, target), 350);
    return () => clearTimeout(t);
  }, [req]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: Esc goes back a step, Enter does the screen's main action, 1–4 pick a route,
  // E toggles El Niño. Ignored while typing in a field.
  const keys = useRef({ stage, lockOn: () => {}, backToMap: () => {}, plant: () => {}, busy });
  keys.current = {
    stage,
    lockOn: () => void lockOn(),
    backToMap: () => void backToMap(),
    plant: () => {
      setSeason(-1);
      setStage("planting");
    },
    busy,
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest("input, textarea, select, [contenteditable=true]")) return;
      const k = keys.current;
      const onControl = !!el.closest("button, a, summary, [role=radio], [role=switch]");
      if (e.key === "Escape") {
        if (k.stage === "plants") k.backToMap();
        else if (k.stage === "planting") setStage("plants");
      } else if (e.key === "Enter" && !onControl) {
        if (k.stage === "target") k.lockOn();
        else if (k.stage === "plants" && !k.busy) k.plant();
      } else if (k.stage === "plants" && ["1", "2", "3", "4"].includes(e.key)) {
        setChoice((["A", "B", "C", "custom"] as Choice[])[Number(e.key) - 1]);
      } else if ((e.key === "e" || e.key === "E") && ["target", "plants", "planting"].includes(k.stage)) {
        setScenario((s) => (s === "elnino" ? "normal" : "elnino"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
        label: `S${i + 1} · ${windows[i].months} ${windows[i].years}\n${CROP[s.crop].short}`,
        // Wilt only where El Niño cut the harvest (irrigated crops that just cost more to pump stay green).
        wilt: scenario === "elnino" && s.yieldT < chosen.normal.seasons[i].yieldT * 0.97,
      }))
    : [];
  const onSeason = useCallback((i: number) => setSeason(i), []);
  const stepIndex = STEPS.findIndex((s) => s.stages.includes(stage));
  const hudLive = stage !== "leaving";
  const canopyOn = ["intro", "leaving", "target", "locking", "flying", "rising"].includes(stage);
  const current = chosen && season >= 0 && season < 6 ? chosen.now.seasons[season] : null;
  /** Backend ground-truth chips + liming advisory; the in-browser planner does not emit the advisory, so add it. */
  const planNotes = useMemo(() => {
    const notes = [...(result?.notes ?? [])];
    const ph = req.overrides.soilPh;
    if (ph !== null && ph < 5.5 && !notes.some((n) => /lime|liming/i.test(n)))
      notes.push(`Liming advisory: soil pH ${ph.toFixed(1)} is below 5.5. Lime before planting legumes; they fix less nitrogen in acid soil.`);
    return notes;
  }, [result, req.overrides.soilPh]);

  const chosenWhy = useMemo(() => {
    if (!chosen) return [];
    if (chosen.now.custom) return chosen.now.why;
    return chosen.now.why.map(formatPhpUsdInText);
  }, [chosen]);

  return (
    <section
      aria-label="Mikazuki Fields"
      className="mission relative h-[100svh] overflow-clip text-ink"
      data-stage={stage}
      data-elnino={scenario === "elnino"}
    >
      {/* Map: mounted (and painted) from the start under the tiles, so it is ready
          the moment they fall away. Leaflet stays still; the zoom-in is a CSS scale. */}
      <div ref={viewRef} className="cockpit-view absolute inset-0">
          <TargetMap
            ref={mapRef}
            presets={presets}
            focus={stage === "plants" || stage === "planting" ? null : { lat: focus.lat, lon: focus.lon }}
            pin={pin}
            rejected={stage === "target" ? rejected : null}
            locked={stage !== "target"}
            onHover={setHoverId}
            onPickPreset={pickPreset}
            onPickPoint={(p) => void pickPoint(p)}
          />
          <div className={`mission-dim ${stage === "plants" || stage === "planting" ? "is-on" : ""}`} aria-hidden />
          <div className="hud-scan" aria-hidden />
      </div>

      {/* El Niño atmosphere over the map (the 3D field adds its own dust and dry soil) */}
      <ElNinoAtmosphere on={scenario === "elnino" && stage !== "intro" && stage !== "leaving"} />

      {/* Step 01: tiles */}
      {tilesAlive && <TileField exiting={stage !== "intro"} onExited={tilesGone} />}

      {/* Cockpit glass over steps 02–03 (pre-mounted, invisible, during the intro) */}
      {canopyOn && <Canopy ref={canopyRef} stage={stage} />}

      <div className="hud-frame" aria-hidden />

      {/* Top bar */}
      <div className="relative z-40 mx-auto flex max-w-[1400px] items-center justify-between gap-2 px-4 pt-4">
        <div className="flex shrink-0 items-center gap-2">
          <Emblem size={30} tile={false} />
          <span className="micro whitespace-nowrap">Mikazuki Fields</span>
        </div>
        {topRight && <div className="flex items-center gap-2">{topRight}</div>}
      </div>

      {/* Step 01 */}
      {(stage === "intro" || stage === "leaving") && (
        <div className={`intro-copy ${stage === "leaving" ? "is-leaving" : ""}`}>
          <h1 className="font-display text-[clamp(52px,min(11vw,17svh),150px)] leading-[0.88] font-normal tracking-[-0.03em]">
            <span className="line-mask">
              <span className="line-rise">Mikazuki</span>
            </span>
            <span className="line-mask">
              <span className="line-rise" style={{ animationDelay: "110ms" }}>
                Fields
              </span>
            </span>
          </h1>
          <p className="fade-up mt-4 max-w-[420px] text-ink/80" style={{ animationDelay: "400ms" }}>
            Tap any farm in the Philippines and see what to plant for the next 3 years, season by season, from 10 years of NASA weather.
          </p>
          <div className="mt-6 h-14">
            {!loaded ? (
              <div className="w-[min(320px,80vw)]" role="progressbar" aria-label="Loading" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
                <div className="flex justify-between text-sm text-ink/80">
                  <span>Loading Philippine NASA reference data</span>
                  <span className="tabular">{String(Math.round(progress)).padStart(3, "0")}%</span>
                </div>
                <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-ink/20">
                  <div className="h-full rounded-full bg-sakura transition-[width] duration-150" style={{ width: `${progress}%` }} />
                </div>
              </div>
            ) : (
              <button
                type="button"
                autoFocus
                onClick={() => setStage("leaving")}
                disabled={stage === "leaving"}
                className="btn btn-primary btn-lg pop-in min-h-14 rounded-full px-8 text-base"
              >
                Choose my farm <ArrowRight className="size-5 translate-y-px" aria-hidden />
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
            <h2 className="font-display text-[clamp(26px,3.4vw,44px)] leading-tight font-normal tracking-[-0.02em]">Where is your farm?</h2>
            <p className={`mt-1 text-sm ${stage === "locking" ? "blink-3 text-sakura" : "text-ink/80"}`} aria-live="polite">
              {stage === "locking"
                ? "Target locked · descending"
                : checking
                  ? "Checking that it's land…"
                  : acquiring
                    ? "Acquiring NASA data…"
                    : tryAgain
                      ? ""
                      : (mapNote ?? "Tap anywhere on land in the Philippines, or choose a sample reference site")}
            </p>
            {tryAgain && stage === "target" && (
              <p key={tryAgain.key} className="try-again" role="alert">
                <Waves className="size-4 shrink-0" aria-hidden />
                <span>{tryAgain.text}</span>
                <strong className="inline-flex items-center gap-1 font-semibold">
                  <RotateCcw className="size-3.5" aria-hidden /> Try again
                </strong>
              </p>
            )}
          </div>

          <aside className="hud-panel hud-panel-left" aria-label="Target data">
            <p className="micro flex items-center gap-1.5 text-sakura">
              <MapPin className="size-3.5" aria-hidden /> Target
              {acquiring && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            </p>
            <p className="mt-1 font-display text-xl leading-6">{shortName(focus)}</p>
            <p className="text-[11px] text-ink/70">
              {focus.id.startsWith("pin-")
                ? pinVia === "api" || pinVia === "browser" || (pinVia === null && /live|Mikazuki API/i.test(focus.source))
                  ? "Live NASA POWER climate for this pin · Slope & NDVI anchored to nearest reference site"
                  : "Using nearest reference site climate & terrain"
                : FARM_SOURCE[farmSource]}
            </p>
            <dl className="mt-2">
              <Readout live={hudLive} label="Lat / Lon" value={`${lat} / ${lon}`} />
              <Readout live={hudLive} label="Dry-season rain" value={`${Math.round(dry.rain_mm)} MM`} tip={TIP.rain} />
              <Readout live={hudLive} label="Afternoon heat" value={`${dry.tmax_c.toFixed(1)} °C`} tip={TIP.heat} />
              <Readout live={hudLive} label="Soil thirst" value={dry.gwetroot.toFixed(2)} tip={TIP.thirst} />
              <Readout live={hudLive} label="Daily water use" value={`${dry.et0_mm_day.toFixed(1)} MM/DAY`} tip={TIP.et0} />
            </dl>
          </aside>

          <aside className="hud-panel hud-panel-right" aria-label="Conditions">
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-semibold">El Niño</span>
                <span className="block text-xs text-ink/70">
                  {focus.elnino_basis === "observed_2015_2016" && focus.elnino_2016_dry_rain_pct !== null
                    ? `Replays 2015–16 here: dry-season rain ${focus.elnino_2016_dry_rain_pct > 0 ? "+" : ""}${Math.round(focus.elnino_2016_dry_rain_pct)}%`
                    : "Dry spell: −25% rain, +1.5 °C"}
                </span>
              </span>
              <Switch checked={scenario === "elnino"} onChange={(on) => setScenario(on ? "elnino" : "normal")} label="Simulate El Niño or dry spell" />
            </label>
            <dl className="mt-2">
              <Readout live={hudLive} label={`Slope (${sampleTag(focus, "slope_pct", "SRTM")})`} value={`${focus.slope_pct}%`} tip={TIP.slope} tipAlign="right" />
              <Readout live={hudLive} label={`Green cover (${sampleTag(focus, "ndvi_dry_min", "MODIS")})`} value={`NDVI ${focus.ndvi_dry_min.toFixed(2)}`} tip={TIP.ndvi} tipAlign="right" />
              <Readout live={hudLive} label="2015–16 El Niño" value={focus.elnino_2016_dry_rain_pct === null ? "—" : `${focus.elnino_2016_dry_rain_pct > 0 ? "+" : ""}${Math.round(focus.elnino_2016_dry_rain_pct)}% RAIN`} />

            </dl>
            <button
              type="button"
              onClick={() => void lockOn()}
              disabled={stage !== "target" || acquiring || checking}
              className="btn btn-primary btn-lg mt-4 w-full"
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
          <h2 className="font-display text-[clamp(22px,2.6vw,32px)] leading-tight font-normal tracking-[-0.02em]">
            {stage === "flying" ? `Descending to ${inName(target)}` : "Back to the map"}
          </h2>
          <p className="mt-1 text-sm text-ink/80 tabular" aria-live="polite">
            {stage === "flying" ? `${lat} / ${lon} · working out your routes` : "Climbing back up"}
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
          notes={planNotes}
          busy={busy}
          onPlant={() => {
            setSeason(-1);
            setFocusSeason(null);
            setPlaying(false);
            setStage("planting");
          }}
          onBack={() => void backToMap()}
        />
      )}

      {/* Step 05 */}
      {stage === "planting" && chosen && (
        <div className="absolute inset-0 z-20 flex flex-col lg:flex-row">
          <div className="relative min-h-0 flex-1">
            <PlantField
              plots={plots}
              plantKey={`${choice}-${chosen.now.rotation.join("-")}`}
              onSeason={onSeason}
              drought={scenario === "elnino"}
              focus={season >= 6 ? focusSeason : null}
            />
            <div className="pointer-events-none absolute top-20 left-4 z-10 sm:left-8">
              <h2 className="font-display text-[clamp(24px,3.2vw,40px)] leading-tight font-normal tracking-[-0.02em]">
                {chosen.now.custom ? "Your rotation" : `Route ${chosen.now.id}`} in {inName(target)}
              </h2>
              <p className="micro mt-2 h-4 text-ink/80 tabular" aria-live="polite">
                {current
                  ? `Planting · S${current.index + 1} ${current.kind} · ${CROP[current.crop].short}`
                  : season >= 6
                    ? scenario === "elnino"
                      ? `El Niño replay (2015–16 weather) · ${planSpan(startYear)} · drag to look around`
                      : `Planted · ${planSpan(startYear)} (6 seasons) · drag to look around`
                    : "Landing · preparing soil"}
              </p>
            </div>
            {season >= 6 && (
              <SeasonTimeline
                windows={windows}
                seasons={chosen.now.seasons}
                focus={focusSeason}
                onFocus={setFocusSeason}
                playing={playing}
                onPlaying={setPlaying}
                rainFor={(i) => climate(target, windows[i].kind, scenario).rain_mm}
                tmaxFor={(i) => climate(target, windows[i].kind, scenario).tmax_c}
              />
            )}
          </div>

          <aside className={`stats-panel ${season >= 6 ? "is-in" : ""}`} aria-labelledby="stats-h">
            <h3 id="stats-h" className="font-display text-2xl font-normal tracking-[-0.02em]">
              {chosen.now.name}
            </h3>
            <p className="text-sm text-ink/70">{chosen.now.promise}</p>
            <p className="mt-1 text-xs text-ink/70">
              {chosen.now.custom ? "Simulated in your browser" : PLAN_SOURCE[result!.source]}
            </p>
            {!chosen.now.custom &&
              planNotes.map((n) => (
                <p key={n} className="mt-1 text-xs text-ink/70">
                  {n}
                </p>
              ))}
            <ol className="mt-3 grid grid-cols-6 gap-1" onMouseLeave={() => setHoverSeason(null)}>
              {chosen.now.seasons.map((s) => {
                const w = windows[s.index];
                const on = focusSeason === s.index;
                return (
                  <li key={s.index}>
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={`Season ${s.index + 1}, ${w.long}, ${CROP[s.crop].short}`}
                      onClick={() => {
                        setPlaying(false);
                        setFocusSeason(on ? null : s.index);
                      }}
                      onMouseEnter={() => setHoverSeason(s.index)}
                      onFocus={() => setHoverSeason(s.index)}
                      onBlur={() => setHoverSeason(null)}
                      className={`season-pill ${on ? "is-on" : ""}`}
                      style={{ background: `color-mix(in srgb, var(--family-${CROP[s.crop].family.toLowerCase()}) 70%, #1d240a)` }}
                    >
                      <span className="block text-[10px] leading-3 text-[#f6efeb]/75">S{s.index + 1}</span>
                      <span className="block w-full truncate text-[11px] leading-[14px] font-semibold">{CROP[s.crop].short}</span>
                      <span className="mt-0.5 block w-full text-[9.5px] leading-3 text-[#f6efeb]/75 tabular">
                        {w.months}
                        <br />
                        {w.years}
                      </span>
                      <SeasonFlags season={s} />
                    </button>
                  </li>
                );
              })}
            </ol>
            {(() => {
              const i = hoverSeason ?? focusSeason;
              if (i === null) return <p className="mt-1.5 text-[11px] text-[#f6efeb]/55">Tap a season for its dates and weather.</p>;
              const s = chosen.now.seasons[i];
              const w = windows[i];
              const rain = climate(target, w.kind, scenario).rain_mm;
              return (
                <p className="season-detail" aria-live="polite">
                  <span className="font-semibold">
                    Season {i + 1} ({w.long} · {w.kind === "wet" ? "Wet" : "Dry"}):
                  </span>{" "}
                  {CROP[s.crop].short} · Rain <span className="tabular">{Math.round(rain)} mm</span>
                  {scenario === "elnino" ? " (2015–16 replay)" : ""} · Bare soil in heavy rain: {s.bareMonths.length ? s.bareMonths.join(", ") : "none"} · Pest
                  cycle: {s.pestBroken ? "broken" : i === 0 ? "starting" : "continues"}
                </p>
              );
            })()}
            <p className="mt-1 flex flex-wrap gap-x-3 text-[10.5px] text-[#f6efeb]/60">
              <span>
                <span className="text-[#c9e86a]">●</span> pest cycle broken
              </span>
              <span>
                <span className="text-[#8fd3ff]">●</span> bare soil in heavy rain
              </span>
            </p>
            <div className="mt-5">
              <p className="text-xs font-medium text-ink/70">3-year profit</p>
              <p className="font-display text-[22px] leading-8 tracking-[-0.02em] sm:text-[24px]">
                <CountUp value={chosen.now.kpis.totalProfit} format={formatPhpUsd} />
              </p>
              {scenario === "elnino" && Math.abs(chosen.now.kpis.totalProfit - chosen.normal.kpis.totalProfit) >= 1 && (
                <p className="text-xs text-[#f3b49f] tabular">
                  {chosen.now.kpis.totalProfit < chosen.normal.kpis.totalProfit ? "−" : "+"}
                  {formatPhpUsd(Math.abs(chosen.now.kpis.totalProfit - chosen.normal.kpis.totalProfit))} vs a normal year
                </p>
              )}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              {(
                [
                  ["Soil nitrogen", <><CountUp value={chosen.now.kpis.nStart} format={(v) => `${Math.round(v)}`} /> → <CountUp value={chosen.now.kpis.nFinal} format={(v) => `${Math.round(v)}`} /></>],
                  ["Water shortfall", <CountUp value={chosen.now.kpis.waterMm} format={(v) => `${Math.round(v)} mm`} />],
                  ["Erosion risk", chosen.now.kpis.erosionLevel],
                  ["Pest cycles broken", <CountUp value={chosen.now.kpis.pestBreaks} format={(v) => `${Math.round(v)}`} />],
                  ["Bare months in rain", <CountUp value={chosen.now.kpis.bareMonthCount} format={(v) => `${Math.round(v)}`} />],
                ] as [string, ReactNode][]
              ).map(([label, value], i) => (
                <div key={label} className={`rounded-md bg-ink/[0.06] px-2.5 py-2 ${i === 4 ? "col-span-2" : ""}`}>
                  <dt className="micro text-[10.5px] text-ink/70">{label}</dt>
                  <dd className="font-display text-lg leading-6 tabular">{value}</dd>
                </div>
              ))}
            </dl>
            <label className="mt-5 flex items-center justify-between gap-3 rounded-md border border-ink/15 px-3 py-2">
              <span>
                <span className="block text-sm font-semibold">El Niño (2015–16)</span>
                <span className="block text-xs text-ink/70">Replays the real El Niño months; crops it hurts wilt</span>
              </span>
              <Switch checked={scenario === "elnino"} onChange={(on) => setScenario(on ? "elnino" : "normal")} label="Replay the 2015–16 El Niño" />
            </label>
            {scenario === "elnino" && <ElNinoReport req={req} preset={target} now={chosen.now} normal={chosen.normal} />}
            <ul className="mt-5 list-disc space-y-1 pl-4 text-sm text-ink/80">
              {chosenWhy.slice(0, 2).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <details className="mt-3 rounded-md border border-ink/12 px-3 py-2 text-xs text-ink/80">
              <summary className="flex cursor-pointer items-center gap-1.5 font-semibold text-ink">
                <Info className="size-3.5" aria-hidden /> Know the limits
              </summary>
              <p className="mt-1.5">
                NASA POWER weather is averaged over a grid cell about 50–70 km across. Slope (SRTM 30 m) and green cover (MODIS) are measured for the 3 preset
                farms; a pinned farm borrows the nearest preset's. Soil thirst comes from
                a model, not a sensor, and crop numbers are general. Test your soil at a DA regional soils laboratory and check any plan with your Municipal
                Agriculturist before switching crops.
              </p>
            </details>
            <div className="mt-auto flex flex-wrap gap-2 pt-5">
              <button type="button" onClick={() => setStage("plants")} className="btn btn-primary flex-1">
                <Sprout className="size-4" aria-hidden /> Change plants
              </button>
              <button type="button" onClick={() => void backToMap()} className="btn btn-secondary">
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
