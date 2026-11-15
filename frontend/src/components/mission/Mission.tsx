import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type Ref } from "react";
import { ArrowLeft, BookmarkPlus, CircleHelp, Crosshair, FileDown, Info, Loader2, Lock, MapPin, PenLine, Pencil, RotateCcw, Sprout, Trash2, Undo2, Waves, X } from "lucide-react";
import type { CropId, PlanRequest, PlansResponse, Preset, Scenario } from "../../types";
import { climate } from "../../engine/simulate";
import { customPlan, scalePlanResult, scalePlansResponse } from "../../engine/plans";
import { fetchPinFarm, fetchPlans, loadFarms, type DataSource } from "../../api/client";
import { inPhilippines } from "../../api/power";
import { checkLand } from "../../api/landcheck";
import { fetchWeather, type Weather } from "../../api/weather";
import { ringAreaHa, ringCentroid } from "../../utils/geo";
import { CROP } from "../../data/crops";
import { Emblem } from "../Emblem";
import { CountUp, formatPhpUsd, formatPhpUsdInText, prefersReducedMotion, Switch, useScramble } from "../ui";
import { TargetMap, type GibsOverlay, type LatLon, type TargetMapHandle } from "./TargetMap";
import { HaInput, SeasonFlags, Seg, type Choice } from "./FieldControls";
import { PlaceSearch } from "./PlaceSearch";
import { firstVisitStep, stepOnScreen, Tour, type TourTarget } from "./Tour";
import { PanelBar, ResizeGrip, useMedia, usePanel } from "./FloatPanel";
import { reverseGeocode, type Place } from "../../api/geocode";
import { inTargetName, lockTargetName, shortTargetName } from "../../utils/locationName";
import { deleteSavedFarm, loadSavedFarms, renameSavedFarm, saveFarmPlot, type SavedFarm } from "../../utils/savedFarms";
import { telemetryStatus, type TelemetryBadge } from "../../utils/telemetryStatus";
import { planSpan, planStartYear, seasonWindows } from "../../data/calendar";
import type { FieldHandle } from "../../three/tileField";
import { DataFeedsPanel } from "./DataFeedsPanel";

const PickPlants = lazy(() => import("./PickPlants").then((m) => ({ default: m.PickPlants })));
const PlantField = lazy(() => import("./PlantField").then((m) => ({ default: m.PlantField })));
const ElNinoReport = lazy(() => import("./ElNinoReport").then((m) => ({ default: m.ElNinoReport })));
const ElNinoAtmosphere = lazy(() => import("./ElNinoAtmosphere").then((m) => ({ default: m.ElNinoAtmosphere })));
const SeasonTimeline = lazy(() => import("./SeasonTimeline").then((m) => ({ default: m.SeasonTimeline })));

/** Must match EXIT_MS in three/tileField.ts (kept here so the 3D chunk stays lazy). */
const EXIT_MS = 600;
/** Outlines outside this range are slips of the finger or more than one farm (#31). */
const MIN_HA = 0.05;
const MAX_HA = 1000;

/** The whole app as one step-by-step mission (the team's sketch); STEPS groups the stages into its five steps. */
type Stage = "intro" | "leaving" | "target" | "locking" | "flying" | "plants" | "planting" | "rising";
const STEPS: { n: string; label: string; stages: Stage[] }[] = [
  { n: "01", label: "Load", stages: ["intro", "leaving"] },
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
  landSizeHa: 1,
  weights: { water: 40, soil: 35, econ: 25 }, // backend PlanSliders defaults
  overrides: { soilTestN: "untested", soilPh: null, pestLastSeason: false, floods: "never", lastHarvestYieldTHa: null },
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
  altitude: "Height above sea level. Higher farms run cooler, which changes which crops do well.",
  slope: "Erosion Slope Risk (SRTM slope): how steep your field is. Steep + bare + heavy rain washes topsoil away.",
  ndvi: "Green Cover Score (MODIS NDVI): how green your land looks from space. Below 0.3 is mostly bare soil.",
} as const;

function useHudTip() {
  const [hover, setHover] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const active = hover ?? focus ?? pinned;
  const bind = (tip: string) => ({
    active: active === tip,
    onMouseEnter: () => setHover(tip),
    onMouseLeave: () => setHover((h) => (h === tip ? null : h)),
    onFocus: () => setFocus(tip),
    onBlur: () => setFocus((f) => (f === tip ? null : f)),
    onClick: (e: ReactMouseEvent<HTMLDivElement>) => {
      if (pinned === tip) {
        setPinned(null);
        setHover(null);
        e.currentTarget.querySelector("button")?.blur();
      } else {
        setPinned(tip);
      }
    },
  });
  return { active, bind };
}

function TipSlot({ tip }: { tip: string | null }) {
  return (
    <p
      className={`mt-2 min-h-[3.5rem] rounded-[6px] px-2.5 py-1.5 text-xs leading-snug transition-colors ${
        tip ? "bg-ink/[0.08] text-ink" : "bg-ink/[0.03] text-ink/60"
      }`}
      aria-live="polite"
    >
      {tip ?? "Hover or tap an underlined metric to see what it means."}
    </p>
  );
}

function Readout({
  label,
  value,
  live,
  tip,
  tips,
  status,
}: {
  label: string;
  value: string;
  live: boolean;
  tip?: string;
  tips?: ReturnType<typeof useHudTip>;
  status?: TelemetryBadge;
}) {
  const shown = useScramble(value, live, 300);
  const badge = status ? <span className={`status-badge is-${status.level.toLowerCase()}`}>{status.level}</span> : null;
  const advisory = status?.advisory ? (
    <p className={`status-note is-${status.level.toLowerCase()} mt-0.5 text-[11px] leading-snug`}>{status.advisory}</p>
  ) : null;
  if (!tip || !tips) {
    return (
      <div className="border-b border-ink/10 py-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="micro min-w-0 text-[10.5px] text-ink/70">{label}</dt>
          <dd className="flex shrink-0 items-center gap-1.5" aria-label={status ? `${value}, ${status.level}` : value}>
            <span className="micro text-[13px] whitespace-pre text-ink tabular">{shown}</span>
            {badge}
          </dd>
        </div>
        {advisory}
      </div>
    );
  }
  const { active, onMouseEnter, onMouseLeave, onClick, onFocus, onBlur } = tips.bind(tip);
  return (
    <div
      className={`cursor-pointer border-b border-ink/10 py-1.5 transition-colors ${
        active ? "-mx-1.5 rounded-[4px] bg-ink/[0.06] px-1.5" : ""
      }`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      <div className="flex items-baseline justify-between gap-2">
        <dt className="min-w-0">
          <button
            type="button"
            aria-pressed={active}
            onFocus={onFocus}
            onBlur={onBlur}
            className={`micro border-b border-dotted text-left text-[10.5px] transition-colors ${
              active ? "border-sakura text-ink" : "border-ink/40 text-ink/75 hover:border-ink/70 hover:text-ink"
            }`}
          >
            {label}
          </button>
        </dt>
        <dd className="flex shrink-0 items-center gap-1.5" aria-label={status ? `${value}, ${status.level}` : value}>
          <span className="micro text-[13px] whitespace-pre text-ink tabular">{shown}</span>
          {badge}
        </dd>
      </div>
      {advisory}
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
const ROUTES: { id: Choice; label: string }[] = [
  { id: "A", label: "Route A" },
  { id: "B", label: "Route B" },
  { id: "C", label: "Route C" },
  { id: "custom", label: "Yours" },
];
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
    if (!(v && typeof v.target?.id === "string" && v.target.seasons?.dry && v.req?.weights)) return null;
    return { ...v, req: { ...v.req, landSizeHa: v.req.landSizeHa ?? 1 } };
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

export function Mission({ presets: bundled, onReady }: { presets: Preset[]; onReady: () => void }) {
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
  const [mapNote, setMapNote] = useState<string | null>(null);
  const [mapZoom, setMapZoom] = useState(() => (typeof window !== "undefined" && window.innerWidth < 640 ? 5.0 : 5.9));
  const [hasPickedLocation, setHasPickedLocation] = useState(false);
  const [checking, setChecking] = useState(false);
  const [tryAgain, setTryAgain] = useState<{ text: string; key: number } | null>(null);
  const [rejected, setRejected] = useState<(LatLon & { key: number }) | null>(null);
  const tapSeq = useRef(0);
  const revGeoAbort = useRef<AbortController | null>(null);
  // Map base layer (#57) & NASA GIBS overlay (#65): auto-switches to Satellite at field zoom unless toggled.
  const [baseChoice, setBaseChoice] = useState<"map" | "satellite" | null>(null);
  const [gibsOverlay, setGibsOverlay] = useState<GibsOverlay>("none");
  const [gibsOffline, setGibsOffline] = useState(false);
  // Farm outline (#31): its corners, and whether taps add corners or drop a pin.
  const [drawing, setDrawing] = useState(false);
  const [boundary, setBoundary] = useState<LatLon[]>([]);
  const [weather, setWeather] = useState<Weather | null | undefined>(undefined);

  useEffect(() => () => revGeoAbort.current?.abort(), []);
  // Walkthrough (#30): the step it is on, or null when closed.
  const [tour, setTour] = useState(firstVisitStep);
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
  const [mapReady, setMapReady] = useState(false);
  const lockBtn = useRef<HTMLButtonElement>(null);
  const reduced = prefersReducedMotion();
  // Floating HUD panels (#17). Phones start with the target data folded so the map shows.
  const phone = typeof window !== "undefined" && window.innerWidth < 640;
  const wide = useMedia("(min-width: 1024px)");
  const leftPanel = usePanel({ minW: 240, minH: 150, collapsed: phone });
  const rightPanel = usePanel({ minW: 240, minH: 150 });
  const statsPanel = usePanel({ minW: 320, minH: wide ? 240 : 120, mode: wide ? "float" : "sheet" });
  const targetTips = useHudTip();
  const condTips = useHudTip();
  const [savedFarms, setSavedFarms] = useState<SavedFarm[]>(() => loadSavedFarms());
  const [activeFarmId, setActiveFarmId] = useState<string | null>(null);
  const [editingFarmId, setEditingFarmId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const skipBoundarySync = useRef(false);

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

  // Loading bar: eases toward 90% and finishes once the first routes are computed and the
  // first screen of map tiles is in (or after 5 s without tiles, e.g. offline).
  useEffect(() => {
    const t = setTimeout(() => setMapReady(true), 5000);
    return () => clearTimeout(t);
  }, []);
  const ready = result !== null && mapReady;
  useEffect(() => {
    if (stage !== "intro") return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / (reduced ? 1 : 500));
      setProgress((p) => Math.max(p, ready && k >= 1 ? 100 : 90 * (1 - Math.pow(1 - k, 3))));
      if (!(ready && k >= 1)) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, stage, reduced]);
  const loaded = progress >= 100;
  useEffect(() => {
    if (!loaded) return;
    onReady();
    // No start button (#13): go straight into the map once everything is in.
    setStage((s) => (s === "intro" ? "leaving" : s));
  }, [loaded, onReady]);

  useEffect(() => {
    if (stage !== "target" || !mapReady) return;
    let idleId = 0;
    let timer = 0;
    const warm = () => {
      void import("./PlantField");
      void import("../../three/plantScene");
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      idleId = w.requestIdleCallback(warm, { timeout: 2500 });
      return () => w.cancelIdleCallback?.(idleId);
    }
    timer = window.setTimeout(warm, 800);
    return () => window.clearTimeout(timer);
  }, [stage, mapReady]);

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
    setTimeout(() => setTilesAlive(false), 1500);
  }, []);

  const hovered = hoverId ? presets.find((p) => p.id === hoverId)! : null;
  const focus: Preset = stage === "target" && hovered ? hovered : target;
  const dry = climate(focus, "dry", scenario);
  const lat = `${Math.abs(focus.lat).toFixed(2)}° ${focus.lat >= 0 ? "N" : "S"}`;
  const lon = `${Math.abs(focus.lon).toFixed(2)}° ${focus.lon >= 0 ? "E" : "W"}`;
  /** Where a terrain value comes from: measured, anchored to the nearest reference site, or a sample. */
  const sampleTag = (p: Preset, key: string, measured: string) =>
    !p.placeholders.includes(key) ? measured : p.id.startsWith("pin-") ? "nearest ref" : "sample";

  const pickPreset = (id: string) => {
    const next = presets.find((p) => p.id === id)!;
    ++tapSeq.current;
    revGeoAbort.current?.abort();
    resetBoundary();
    setActiveFarmId(null);
    setHasPickedLocation(true);
    setPin(null);
    setMapNote(null);
    setPinVia(null);
    setTarget(next);
    if (drawing) void mapRef.current?.glideTo(next.lat, next.lon, 16);
  };
  const refuse = (p: LatLon, text: string) => {
    const key = Date.now();
    setRejected({ ...p, key });
    setTryAgain({ text, key });
  };
  const pickPoint = async (tap: LatLon, place?: string) => {
    let p = tap;
    const seq = ++tapSeq.current;
    revGeoAbort.current?.abort();
    // A new tap supersedes any check or fetch still running for an older one.
    setActiveFarmId(null);
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
    setHasPickedLocation(true);
    const currentZoom = mapRef.current?.getZoom() ?? mapZoom;
    if (drawing && currentZoom < 12) void mapRef.current?.glideTo(p.lat, p.lon, 16);
    setPin(p);
    let resolvedName: string | null = place ?? null;
    if (!place) {
      const ac = new AbortController();
      revGeoAbort.current = ac;
      void reverseGeocode(p.lat, p.lon, ac.signal).then((name) => {
        if (!name || seq !== tapSeq.current) return;
        resolvedName = name;
        setTarget((cur) => (cur.id.startsWith("pin-") && cur.lat === p.lat && cur.lon === p.lon ? { ...cur, name } : cur));
      });
    }
    setAcquiring(true);
    const { preset, live, via } = await fetchPinFarm(p.lat, p.lon, presets);
    if (seq !== tapSeq.current) return;
    setAcquiring(false);
    setPinVia(via);
    if (!live) setMapNote("Live NASA data unavailable; using the nearest reference site's climate & terrain.");
    else if (ground.snapped) setMapNote(`Moved your pin ${Math.round(ground.snapped.meters)} m onto the nearest land.`);
    else if (ground.kind === "unknown") setMapNote("Couldn't check the ground here (map offline); treating it as land.");
    else if (place) setMapNote(`Targeting ${place}. Lock it to plan this farm.`);
    setTarget(resolvedName ? { ...preset, name: resolvedName } : preset);
    // One Enter away from planning (after the re-render that enables the button).
    if (place) requestAnimationFrame(() => lockBtn.current?.focus());
  };
  const setHectares = (ha: number) => setReq((r) => (r.landSizeHa === ha ? r : { ...r, landSizeHa: ha }));
  const resetBoundary = () => {
    setBoundary([]);
    setHectares(1); // a pin stands for 1 ha
  };
  const drawBoundary = (ring: LatLon[]) => {
    const outside = ring.find((p) => !inPhilippines(p.lat, p.lon));
    setTryAgain(null);
    if (outside) refuse(outside, "That's outside the Philippines.");
    setActiveFarmId(null);
    setBoundary(outside ? [...boundary] : ring); // a fresh array redraws a corner dragged out of bounds where it was
  };
  const setDrawMode = (on: boolean) => {
    setDrawing(on);
    if (!on) {
      resetBoundary();
      return;
    }
    // Zoom to field level only if the user already picked a location or zoomed in manually.
    const zoom = mapRef.current?.getZoom() ?? mapZoom;
    if (hasPickedLocation || zoom >= 12) void mapRef.current?.glideTo(target.lat, target.lon, 16);
  };
  const areaHa = boundary.length >= 3 ? ringAreaHa(boundary) : null;
  const areaNote = areaHa === null ? null : areaHa < MIN_HA ? `Under ${MIN_HA} ha: check the corners. Planning uses ${MIN_HA} ha.` : areaHa > MAX_HA ? `Over ${MAX_HA.toLocaleString("en-PH")} ha: planning uses ${MAX_HA.toLocaleString("en-PH")} ha.` : null;
  // A closed outline targets its centre like a tap there (land check, live data) and sets the farm's size.
  useEffect(() => {
    if (skipBoundarySync.current) {
      skipBoundarySync.current = false;
      return;
    }
    if (areaHa === null) return;
    setHectares(Math.round(Math.min(MAX_HA, Math.max(MIN_HA, areaHa)) * 100) / 100);
    const t = setTimeout(() => void pickPoint(ringCentroid(boundary)), 600);
    return () => clearTimeout(t);
  }, [boundary]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveCurrentFarm = () => {
    const { farms, saved } = saveFarmPlot({ target, req, boundary, scenario });
    setSavedFarms(farms);
    setActiveFarmId(saved.id);
    setEditingFarmId(null);
    setMapNote(`Saved ${saved.label}.`);
  };
  const loadSavedPlot = async (farm: SavedFarm) => {
    ++tapSeq.current;
    revGeoAbort.current?.abort();
    setTryAgain(null);
    setRejected(null);
    setChecking(false);
    setAcquiring(false);
    setHoverId(null);
    skipBoundarySync.current = farm.boundary.length >= 3;
    setActiveFarmId(farm.id);
    setHasPickedLocation(true);
    setTarget(farm.target);
    setPin(farm.target.id.startsWith("pin-") ? { lat: farm.target.lat, lon: farm.target.lon } : null);
    setBoundary(farm.boundary.map((p) => ({ ...p })));
    setDrawing(farm.boundary.length >= 3);
    setReq(farm.req);
    setScenario(farm.scenario);
    setPinVia(null);
    setMapNote(`Loaded ${farm.label}.`);
    await Promise.all([
      mapRef.current?.glideTo(farm.target.lat, farm.target.lon, farm.boundary.length >= 3 ? 16 : 12),
      plan(farm.req, farm.target),
    ]);
  };
  const startRenameFarm = (farm: SavedFarm) => {
    setEditingFarmId(farm.id);
    setEditLabel(farm.label);
  };
  const commitRenameFarm = () => {
    if (!editingFarmId) return;
    const next = renameSavedFarm(editingFarmId, editLabel);
    setSavedFarms(next);
    setEditingFarmId(null);
  };
  const removeSavedPlot = (id: string) => {
    const next = deleteSavedFarm(id);
    setSavedFarms(next);
    if (activeFarmId === id) setActiveFarmId(null);
    if (editingFarmId === id) setEditingFarmId(null);
  };
  const drawStatus =
    mapZoom < 12
      ? "Step 1: Search or tap your farm's general location on the map to zoom in."
      : boundary.length === 0
        ? "Step 2: Tap at least 3 corners around your field to trace your boundary (drag map to pan)."
        : areaHa === null
          ? `${boundary.length} of 3 corners: tap ${3 - boundary.length} more to close the outline`
          : (areaNote ?? `${boundary.length} corners · ${areaHa.toFixed(2)} ha. Drag a corner to adjust it.`);

  // Current weather for the farm in view; never holds up targeting.
  useEffect(() => {
    setWeather(undefined);
    let dead = false;
    const t = setTimeout(() => void fetchWeather(focus.lat, focus.lon).then((w) => !dead && setWeather(w)), 400);
    return () => {
      dead = true;
      clearTimeout(t);
    };
  }, [focus.lat, focus.lon]);
  // Altitude: SRTM from the backend when it is for this point, else Open-Meteo's terrain model, else the nearest reference site's.
  const altitude =
    focus.elevation_m !== undefined && !focus.placeholders.includes("elevation_m")
      ? { m: focus.elevation_m, from: "SRTM" }
      : weather?.elevationM != null
        ? { m: weather.elevationM, from: "Open-Meteo" }
        : focus.elevation_m !== undefined
          ? { m: focus.elevation_m, from: "nearest ref" }
          : null;

  /** A search result: glide over, then target it exactly like a tap. */
  const pickPlace = async (pl: Place) => {
    resetBoundary(); // a new place is a new farm
    setHasPickedLocation(true);
    await mapRef.current?.glideTo(pl.lat, pl.lon, drawing ? 16 : undefined);
    await pickPoint({ lat: pl.lat, lon: pl.lon }, pl.context ? `${pl.name}, ${pl.context}` : pl.name);
  };

  const navSeq = useRef(0);
  const lockOn = async () => {
    if (stage !== "target" || acquiring || checking) return;
    const seq = ++navSeq.current;
    const p = target;
    saveLastFarm({ target: p, pin, req });
    setStage("locking");
    const planning = plan(req, p); // compute this farm's routes while we fly
    await new Promise((r) => setTimeout(r, reduced ? 0 : 200));
    if (navSeq.current !== seq) return;
    setStage("flying");
    await Promise.all([mapRef.current?.flyTo(p.lat, p.lon), planning]);
    if (navSeq.current === seq) setStage("plants");
  };
  const backToMap = async () => {
    const seq = ++navSeq.current;
    setStage("rising");
    await mapRef.current?.reset();
    if (navSeq.current === seq) setStage("target");
  };
  const returnHome = async () => {
    if (stage === "intro" || stage === "leaving") return;
    const fromDeep = stage === "plants" || stage === "planting" || stage === "flying";
    setDrawing(false);
    setBaseChoice(null);
    setActiveFarmId(null);
    setEditingFarmId(null);
    resetBoundary();
    setHasPickedLocation(false);
    setTryAgain(null);
    setRejected(null);
    setMapNote(null);
    if (fromDeep) {
      await backToMap();
    } else {
      const seq = ++navSeq.current;
      setStage("target");
      await mapRef.current?.reset();
      if (navSeq.current === seq) setStage("target");
    }
  };

  // Farm-settings changes re-plan (debounced) while picking plants or looking at the field; landSizeHa scales instantaneously.
  const firstReq = useRef(true);
  const planSig = JSON.stringify({ ...req, landSizeHa: 1 });
  useEffect(() => {
    if (firstReq.current) {
      firstReq.current = false;
      return;
    }
    if (stage !== "plants" && stage !== "planting") return;
    setBusy(true); // instant feedback; the plan itself follows the debounce
    const t = setTimeout(() => void plan(req, target), 350);
    return () => clearTimeout(t);
  }, [planSig]); // eslint-disable-line react-hooks/exhaustive-deps

  const plant = () => {
    setSeason(-1);
    setFocusSeason(null);
    setPlaying(false);
    setStage("planting");
  };

  // Keyboard: Esc goes back a step, Enter does the screen's main action, 1–4 pick a route,
  // E toggles El Niño. Ignored while typing in a field.
  const keys = useRef({ stage, lockOn: () => {}, backToMap: () => {}, plant: () => {}, busy });
  keys.current = {
    stage,
    lockOn: () => void lockOn(),
    backToMap: () => void backToMap(),
    plant,
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
      } else if ((k.stage === "plants" || k.stage === "planting") && ["1", "2", "3", "4"].includes(e.key)) {
        setChoice((["A", "B", "C", "custom"] as Choice[])[Number(e.key) - 1]);
      } else if ((e.key === "e" || e.key === "E") && ["target", "plants", "planting"].includes(k.stage)) {
        setScenario((s) => (s === "elnino" ? "normal" : "elnino"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const landHa = Number.isFinite(req.landSizeHa) && req.landSizeHa > 0 ? req.landSizeHa : 1;
  const scaledResult = useMemo(() => (result ? scalePlansResponse(result, landHa) : null), [result, landHa]);
  const customRaw = useMemo(() => customPlan(req, target, customRotation), [req, target, customRotation]);
  const custom = useMemo(
    () => ({ normal: scalePlanResult(customRaw.normal, landHa), elnino: scalePlanResult(customRaw.elnino, landHa) }),
    [customRaw, landHa],
  );
  const chosen = useMemo(() => {
    if (!scaledResult) return null;
    if (choice === "custom") return { now: custom[scenario], normal: custom.normal };
    const i = ["A", "B", "C"].indexOf(choice);
    return { now: scaledResult[scenario][i], normal: scaledResult.normal[i] };
  }, [scaledResult, choice, custom, scenario]);

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

  const downloadPdfReport = async () => {
    if (!chosen) return;
    const { downloadFieldReportPdf } = await import("../../utils/pdfReport");
    await downloadFieldReportPdf({
      target,
      req,
      scenario,
      plan: chosen.now,
      normalPlan: chosen.normal,
      why: chosenWhy,
      notes: planNotes,
      windows,
      startYear,
      farmSource,
      pinVia,
      planSource: result?.source ?? "demo",
      altitude,
    });
  };

  const advanceTour = (nextTarget: TourTarget): boolean => {
    if (nextTarget === "settings" && stage === "target" && !acquiring && !checking) {
      void lockOn();
      return true;
    }
    if (nextTarget === "routes" && stage === "plants" && !busy) {
      plant();
      return true;
    }
    if (nextTarget === "report" && stage === "planting" && statsPanel.collapsed) {
      statsPanel.toggle();
      return true;
    }
    return false;
  };

  const autoSatellite = mapZoom >= 13 || (drawing && mapZoom >= 12);
  const satellite = baseChoice ? baseChoice === "satellite" : autoSatellite;

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
            locked={stage !== "target" && stage !== "leaving"}
            satellite={satellite}
            gibsOverlay={gibsOverlay}
            onHover={setHoverId}
            onPickPreset={pickPreset}
            onPickPoint={(p) => void pickPoint(p)}
            boundary={boundary}
            drawing={drawing && stage === "target"}
            onBoundary={drawBoundary}
            onZoom={setMapZoom}
            onOverlayError={setGibsOffline}
            onTilesReady={() => setMapReady(true)}
          />
          <div className={`mission-dim ${stage === "plants" || stage === "planting" ? "is-on" : ""}`} aria-hidden />
          <div className="hud-scan" aria-hidden />
      </div>

      {/* El Niño atmosphere over the map (the 3D field adds its own dust and dry soil) */}
      <Suspense fallback={null}>
        <ElNinoAtmosphere on={scenario === "elnino" && stage !== "intro" && stage !== "leaving"} />
      </Suspense>

      {/* Step 01: tiles */}
      {tilesAlive && <TileField exiting={stage !== "intro"} onExited={tilesGone} />}

      {/* Cockpit glass over steps 02–03 (pre-mounted, invisible, during the intro) */}
      {canopyOn && <Canopy ref={canopyRef} stage={stage} />}

      <div className="hud-frame" aria-hidden />

      {/* Top bar */}
      <div className="pointer-events-none relative z-40 mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2 px-4 pt-3 sm:pt-4">
        <button
          type="button"
          onClick={() => void returnHome()}
          disabled={stage === "intro" || stage === "leaving"}
          title="Return to Philippine map"
          aria-label="Mikazuki Fields — Return to Philippine map"
          className={`pointer-events-auto flex shrink-0 items-center gap-2 transition-opacity ${
            stage === "intro" || stage === "leaving" ? "cursor-default" : "cursor-pointer hover:opacity-80"
          }`}
        >
          <Emblem size={30} />
          <span className="micro whitespace-nowrap">Mikazuki Fields</span>
        </button>
        {stage === "target" && (
          <div className="saved-farms order-3 w-full sm:order-none sm:w-auto sm:flex-1" role="region" aria-label="My saved farms">
            {savedFarms.map((farm) => {
              const on = activeFarmId === farm.id;
              if (editingFarmId === farm.id) {
                return (
                  <span key={farm.id} className={`farm-pill ${on ? "is-on" : ""}`}>
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRenameFarm();
                        else if (e.key === "Escape") setEditingFarmId(null);
                      }}
                      onBlur={commitRenameFarm}
                      aria-label="Rename farm"
                      maxLength={32}
                      autoFocus
                      className="farm-pill-input"
                    />
                  </span>
                );
              }
              return (
                <span key={farm.id} className={`farm-pill ${on ? "is-on" : ""}`}>
                  <button
                    type="button"
                    onClick={() => void loadSavedPlot(farm)}
                    onDoubleClick={() => startRenameFarm(farm)}
                    aria-pressed={on}
                    title={`${farm.label} (${farm.req.landSizeHa} ha) · Click to load, double-click to rename`}
                    className="farm-pill-name"
                  >
                    {farm.label}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      startRenameFarm(farm);
                    }}
                    aria-label={`Rename ${farm.label}`}
                    className="farm-pill-act"
                  >
                    <Pencil className="size-2.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSavedPlot(farm.id);
                    }}
                    aria-label={`Delete ${farm.label}`}
                    className="farm-pill-act"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              );
            })}
            <button type="button" onClick={saveCurrentFarm} className="farm-save-pill">
              <BookmarkPlus className="size-3" aria-hidden /> Save farm
            </button>
          </div>
        )}
        {stage !== "intro" && stage !== "leaving" && (
          <button
            type="button"
            className="btn btn-secondary guide-btn pointer-events-auto shrink-0 whitespace-nowrap"
            onClick={() => setTour(stepOnScreen())}
          >
            <CircleHelp className="size-4" aria-hidden /> Guide
          </button>
        )}
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
            <div className="w-[min(320px,80vw)]" role="progressbar" aria-label="Loading" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
              <div className="flex items-center justify-between gap-3 text-sm text-ink/80">
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {loaded ? "Opening the map" : "Loading the map and NASA reference data"}
                </span>
                <span className="tabular">{Math.round(progress)}%</span>
              </div>
              <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-ink/20">
                <div className="h-full rounded-full bg-sakura transition-[width] duration-150" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 02: cockpit targeting. Mounted (hidden) from START so its layout and paint
          happen while the tiles still cover the screen; revealed at the handover. */}
      {(stage === "leaving" || stage === "target" || stage === "locking") && (
        <div className={`cockpit-hud ${stage === "leaving" ? "is-pre" : ""}`} aria-hidden={stage === "leaving" || undefined}>
          <div className="hud-title">
            <h2 className="font-display text-[clamp(26px,3.4vw,44px)] leading-tight font-normal tracking-[-0.02em]">Where is your farm?</h2>
            <p className={`mt-1 text-sm tabular ${stage === "locking" ? "blink-3 text-sakura" : "text-ink/80"}`} aria-live="polite">
              {stage === "locking"
                ? "Target locked · descending"
                : checking
                  ? "Checking that it's land…"
                  : acquiring
                    ? "Acquiring NASA data…"
                    : tryAgain
                      ? ""
                      : drawing
                        ? drawStatus
                        : (mapNote ?? "Search a town, tap anywhere on the map, or pick a reference site.")}
            </p>
            {stage !== "locking" && (
              <div className="mx-auto w-fit" data-tour="locate">
                <PlaceSearch onPick={(pl) => void pickPlace(pl)} />
                <div className="draw-bar">
                  <div className="route-tabs draw-mode" role="radiogroup" aria-label="How to mark your farm">
                    <button type="button" role="radio" aria-checked={!drawing} onClick={() => setDrawMode(false)} className={`route-tab ${drawing ? "" : "is-on"}`}>
                      <MapPin className="size-4" aria-hidden /> Drop a pin
                    </button>
                    <button type="button" role="radio" aria-checked={drawing} onClick={() => setDrawMode(true)} className={`route-tab ${drawing ? "is-on" : ""}`}>
                      <PenLine className="size-4" aria-hidden /> Draw boundary
                    </button>
                  </div>
                  {drawing && (
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-secondary flex-1" disabled={!boundary.length} onClick={() => drawBoundary(boundary.slice(0, -1))}>
                        <Undo2 className="size-4" aria-hidden /> Undo last point
                      </button>
                      <button type="button" className="btn btn-secondary flex-1" disabled={!boundary.length} onClick={resetBoundary}>
                        <Trash2 className="size-4" aria-hidden /> Clear boundary
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
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

          <div className="hud-panels">
          <aside
            ref={leftPanel.ref}
            style={leftPanel.style}
            className={`hud-panel hud-panel-left ${leftPanel.lifted ? "is-lifted" : ""} ${leftPanel.active ? "is-active" : ""}`}
            aria-label="Target data"
            data-tour="telemetry"
          >
            <PanelBar panel={leftPanel} label="target data">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-sakura">
                <MapPin className="size-3.5" aria-hidden /> Target
                {acquiring && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              </p>
              <p className="truncate font-display text-xl leading-6" title={shortTargetName(focus)}>{shortTargetName(focus)}</p>
            </PanelBar>
            {!leftPanel.collapsed && (
            <div className="panel-body">
            <p className="text-[11px] text-ink/70">
              {focus.id.startsWith("pin-")
                ? pinVia === "api" || pinVia === "browser" || (pinVia === null && /live|Mikazuki API/i.test(focus.source))
                  ? focus.placeholders.includes("slope_pct")
                    ? "Live NASA POWER climate for this farm · Slope & NDVI anchored to nearest reference site"
                    : "Live NASA POWER climate and SRTM terrain for this farm · NDVI anchored to nearest reference site"
                  : "Using nearest reference site climate & terrain"
                : FARM_SOURCE[farmSource]}
            </p>
            <dl className="mt-2">
              <Readout live={hudLive} label="Lat / Lon" value={`${lat} / ${lon}`} />
              <Readout live={hudLive} label={`Farm area (${areaHa === null ? "pin" : "outline"})`} value={`${req.landSizeHa} HA`} />
              <Readout live={hudLive} label="Dry-season rain" value={`${Math.round(dry.rain_mm)} MM`} tip={TIP.rain} tips={targetTips} status={telemetryStatus("rain", dry.rain_mm)} />
              <Readout live={hudLive} label="Afternoon heat" value={`${dry.tmax_c.toFixed(1)} °C`} tip={TIP.heat} tips={targetTips} status={telemetryStatus("heat", dry.tmax_c)} />
              <Readout live={hudLive} label="Soil thirst" value={dry.gwetroot.toFixed(2)} tip={TIP.thirst} tips={targetTips} />
              <Readout live={hudLive} label="Daily water use" value={`${dry.et0_mm_day.toFixed(1)} MM/DAY`} tip={TIP.et0} tips={targetTips} />
            </dl>
            <TipSlot tip={targetTips.active} />
            <p className="mt-2 text-xs text-ink/80 tabular" aria-live="polite">
              {weather
                ? `Right now: ${weather.tempC.toFixed(1)} °C, ${weather.rainMm.toFixed(1)} mm rain, wind ${Math.round(weather.windKmh)} km/h (Open-Meteo). The plan uses the 10-year climate above.`
                : weather === null
                  ? "Current weather is unavailable; the plan does not need it."
                  : "Checking current weather…"}
            </p>
            </div>
            )}
            <ResizeGrip panel={leftPanel} label="target data" />
          </aside>

          <aside
            ref={rightPanel.ref}
            style={rightPanel.style}
            className={`hud-panel hud-panel-right ${rightPanel.lifted ? "is-lifted" : ""} ${rightPanel.active ? "is-active" : ""}`}
            aria-label="Conditions"
          >
            <PanelBar panel={rightPanel} label="conditions">
              <p className="text-xs font-semibold text-sakura">Conditions</p>
            </PanelBar>
            <div className="panel-body">
            {!rightPanel.collapsed && (
            <>
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
              <Readout live={hudLive} label={`Altitude (${altitude?.from ?? "SRTM"})`} value={altitude ? `${Math.round(altitude.m)} M` : "No record"} tip={TIP.altitude} tips={condTips} />
              <Readout live={hudLive} label={`Slope (${sampleTag(focus, "slope_pct", "SRTM")})`} value={`${focus.slope_pct}%`} tip={TIP.slope} tips={condTips} status={telemetryStatus("slope", focus.slope_pct)} />
              <Readout live={hudLive} label={`Green cover (${sampleTag(focus, "ndvi_dry_min", "MODIS")})`} value={`NDVI ${focus.ndvi_dry_min.toFixed(2)}`} tip={TIP.ndvi} tips={condTips} />
              <Readout live={hudLive} label="2015–16 El Niño" value={focus.elnino_2016_dry_rain_pct === null ? "No record" : `${focus.elnino_2016_dry_rain_pct > 0 ? "+" : ""}${Math.round(focus.elnino_2016_dry_rain_pct)}% RAIN`} />
            </dl>
            <TipSlot tip={condTips.active} />
            </>
            )}
            {/* Lock stays reachable even with the panel folded. */}
            <button
              ref={lockBtn}
              type="button"
              data-tour="lock"
              onClick={() => void lockOn()}
              disabled={stage !== "target" || acquiring || checking}
              className={`btn btn-primary btn-lg w-full ${rightPanel.collapsed ? "" : "mt-4"}`}
            >
              {stage === "locking" ? <Lock className="size-4" aria-hidden /> : <Crosshair className="size-4" aria-hidden />}
              {stage === "locking" ? "Locked" : `Lock ${lockTargetName(target)}`}
            </button>
            </div>
            <ResizeGrip panel={rightPanel} label="conditions" />
          </aside>
          </div>
          {stage === "target" && (
            <div className="map-dock">
              {gibsOverlay !== "none" && (
                <p className="layer-legend" aria-live="polite">
                  {gibsOffline ? (
                    "NASA GIBS imagery unavailable offline"
                  ) : gibsOverlay === "ndvi" ? (
                    <>
                      <span>Dry</span>
                      <span className="layer-swatch is-ndvi" aria-hidden />
                      <span>Lush · MODIS 8-Day NDVI</span>
                    </>
                  ) : (
                    <>
                      <span>Light</span>
                      <span className="layer-swatch is-rain" aria-hidden />
                      <span>Heavy · NASA IMERG Rain</span>
                    </>
                  )}
                </p>
              )}
              <div className="map-layers">
                <div className="layer-group" role="group" aria-label="Base map">
                  <button type="button" aria-pressed={!satellite} onClick={() => setBaseChoice("map")} className={`layer-pill ${satellite ? "" : "is-on"}`}>
                    Map
                  </button>
                  <button type="button" aria-pressed={satellite} onClick={() => setBaseChoice("satellite")} className={`layer-pill ${satellite ? "is-on" : ""}`}>
                    Satellite
                  </button>
                </div>
                <div className="layer-group" role="group" aria-label="NASA GIBS overlay">
                  {([
                    ["none", "None"],
                    ["ndvi", "NDVI"],
                    ["rain", "Rain"],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={gibsOverlay === id}
                      onClick={() => setGibsOverlay(id)}
                      className={`layer-pill ${gibsOverlay === id ? "is-on" : ""}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {stage === "target" && <DataFeedsPanel farmSource={farmSource} focus={focus} pinVia={pinVia} altitudeFrom={altitude?.from} weather={weather} gibsOffline={gibsOffline} />}
        </div>
      )}

      {/* Step 03 */}
      {(stage === "flying" || stage === "rising") && (
        <div className="hud-title">
          <h2 className="font-display text-[clamp(22px,2.6vw,32px)] leading-tight font-normal tracking-[-0.02em]">
            {stage === "flying" ? `Descending to ${inTargetName(target)}` : "Back to the map"}
          </h2>
          <p className="mt-1 text-sm text-ink/80 tabular" aria-live="polite">
            {stage === "flying" ? `${lat} / ${lon} · working out your routes` : "Climbing back up"}
          </p>
        </div>
      )}

      {/* Step 04 */}
      {stage === "plants" && scaledResult && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-20 grid place-items-center bg-[#141a06]/80" role="status">
              <span className="inline-flex items-center gap-2 rounded-full border border-ink/20 bg-[#1d240a]/95 px-4 py-2 text-xs text-ink">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Loading crop planner…
              </span>
            </div>
          }
        >
          <PickPlants
            farmName={inTargetName(target)}
            plans={scaledResult[scenario]}
            custom={custom[scenario]}
            choice={choice}
            onChoice={setChoice}
            customRotation={customRotation}
            onCustomRotation={setCustomRotation}
            req={req}
            onReq={(patch) => setReq((r) => ({ ...r, ...patch }))}
            scenario={scenario}
            onScenario={setScenario}
            notes={planNotes}
            busy={busy}
            onPlant={plant}
            onBack={() => void backToMap()}
          />
        </Suspense>
      )}

      {/* Step 05 */}
      {stage === "planting" && chosen && (
        <div className="absolute inset-0 z-20 flex flex-col lg:flex-row">
          <div className="relative min-h-0 flex-1">
            <Suspense
              fallback={
                <div className="grid h-full place-items-center bg-[#0d1104] text-sm text-ink/75" role="status">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Preparing 3D field…
                  </span>
                </div>
              }
            >
              <PlantField
                plots={plots}
                plantKey={`${choice}-${chosen.now.rotation.join("-")}`}
                onSeason={onSeason}
                drought={scenario === "elnino"}
                focus={season >= 6 ? focusSeason : null}
                polygon={boundary.length >= 3 ? boundary : undefined}
              />
            </Suspense>
            <div className="pointer-events-none absolute top-20 left-4 z-10 sm:left-8">
              <h2 className="font-display text-[clamp(24px,3.2vw,40px)] leading-tight font-normal tracking-[-0.02em]">
                {chosen.now.custom ? "Your rotation" : `Route ${chosen.now.id}`} in {inTargetName(target)}
              </h2>
              <p className="micro mt-2 min-h-4 text-ink/80 tabular" aria-live="polite">
                {current
                  ? `Planting · S${current.index + 1} ${current.kind} · ${CROP[current.crop].short}`
                  : season >= 6
                    ? scenario === "elnino"
                      ? `El Niño replay (2015–16 weather) · ${planSpan(startYear)} · drag to look around`
                      : `Planted · ${planSpan(startYear)} (6 seasons) · drag to turn, pinch or scroll to zoom`
                    : "Landing · preparing soil"}
              </p>
            </div>
            {season >= 6 && (
              <Suspense fallback={null}>
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
              </Suspense>
            )}
          </div>

          <aside
            ref={statsPanel.ref}
            style={statsPanel.style}
            className={`stats-panel ${season >= 6 ? "is-in" : ""} ${statsPanel.lifted ? "is-lifted" : ""} ${statsPanel.active ? "is-active" : ""} ${statsPanel.collapsed ? "is-collapsed" : ""}`}
            aria-labelledby="stats-h"
          >
            <PanelBar panel={statsPanel} label="field data">
              <h3 id="stats-h" className="truncate font-display text-2xl leading-8 font-normal tracking-[-0.02em]">
                {chosen.now.name}
              </h3>
              {statsPanel.collapsed && (
                <p className="truncate text-xs text-ink/70 tabular">3-year profit {formatPhpUsd(chosen.now.kpis.totalProfit)}</p>
              )}
            </PanelBar>
            {/* One tap switches the route right here (#15); the field regrows in place. */}
            <div className="route-tabs" role="radiogroup" aria-label="Route, keys 1 to 4" data-tour="routes">
              {ROUTES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={choice === r.id}
                  onClick={() => setChoice(r.id)}
                  className={`route-tab ${choice === r.id ? "is-on" : ""}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {!statsPanel.collapsed && (
            <div className="panel-body">
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
                      <span className="mt-0.5 block w-full text-[10px] leading-3 text-[#f6efeb]/75 tabular">
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
              const crop = CROP[s.crop];
              const rain = climate(target, w.kind, scenario).rain_mm;
              return (
                <p className="season-detail" aria-live="polite">
                  <span className="font-semibold">
                    Season {i + 1} ({w.long} · {w.kind === "wet" ? "Wet" : "Dry"}):
                  </span>{" "}
                  {crop.short} ({crop.variety}) · {crop.establishment} · Rain <span className="tabular">{Math.round(rain)} mm</span>
                  {scenario === "elnino" ? " (2015–16 replay)" : ""} · Bare soil in heavy rain: {s.bareMonths.length ? s.bareMonths.join(", ") : "none"} · Pest
                  cycle: {s.pestBroken ? "broken" : i === 0 ? "starting" : "continues"}
                </p>
              );
            })()}
            <ul className="mt-2 divide-y divide-ink/10 rounded-md border border-ink/12 bg-ink/[0.03] px-2.5 py-1 text-[11px]" aria-label="Recommended varieties and establishment methods">
              {chosen.now.seasons.map((s) => {
                const crop = CROP[s.crop];
                const active = (hoverSeason ?? focusSeason) === s.index;
                return (
                  <li key={s.index} className={`py-1 leading-snug ${active ? "text-ink" : "text-ink/80"}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="font-semibold text-ink">
                        S{s.index + 1} · {crop.short}
                      </span>
                      <span className="text-[10.5px] text-[#c9e86a]">{crop.variety}</span>
                    </div>
                    <p className="text-[10.5px] text-ink/65">{crop.establishment}</p>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-[#f6efeb]/60">
              <span>
                <span className="text-[#c9e86a]">●</span> pest cycle broken
              </span>
              <span>
                <span className="text-[#8fd3ff]">●</span> bare soil in heavy rain
              </span>
            </p>
            <div className="mt-5">
              <p className="text-xs font-medium text-ink/70">3-year profit ({landHa} ha)</p>
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
                  ["Total harvest", <CountUp value={chosen.now.seasons.reduce((acc, s) => acc + s.yieldT, 0)} format={(v) => `${v.toFixed(1)} t`} />],
                  ["Fertilizer (urea)", <CountUp value={chosen.now.kpis.ureaTotal} format={formatPhpUsd} />],
                  ["Soil nitrogen", <><CountUp value={chosen.now.kpis.nStart} format={(v) => `${Math.round(v)}`} /> → <CountUp value={chosen.now.kpis.nFinal} format={(v) => `${Math.round(v)}`} /></>],
                  [
                    req.irrigation === "irrigated" ? "Water pumped" : "Water shortfall",
                    <CountUp value={chosen.now.kpis.waterMm} format={(v) => `${Math.round(v)} mm · ${Math.round(v * 10 * landHa).toLocaleString("en-PH")} m³`} />,
                  ],
                  ["Erosion risk", chosen.now.kpis.erosionLevel],
                  ["Pest cycles broken", <CountUp value={chosen.now.kpis.pestBreaks} format={(v) => `${Math.round(v)}`} />],
                  ["Bare months in rain", <CountUp value={chosen.now.kpis.bareMonthCount} format={(v) => `${Math.round(v)}`} />],
                ] as [string, ReactNode][]
              ).map(([label, value], i) => (
                <div key={label} className={`rounded-md bg-ink/[0.06] px-2.5 py-2 ${i === 4 ? "col-span-2" : ""}`}>
                  <dt className="micro text-[11px] text-ink/70">{label}</dt>
                  <dd className="font-display text-lg leading-6 tabular">{value}</dd>
                </div>
              ))}
            </dl>
            {/* The two inputs that change the numbers most, adjustable in place (#15); the rest stay in step 04. */}
            <div className="mt-5 grid grid-cols-2 items-end gap-2">
              <div>
                <label htmlFor="field-land-size" className="text-xs font-medium text-ink/70">
                  Land size
                </label>
                <div className="mt-1 flex min-h-10 items-center">
                  <HaInput id="field-land-size" value={landHa} onChange={(landSizeHa) => setReq((r) => ({ ...r, landSizeHa }))} />
                </div>
              </div>
              <Seg label="Water" value={req.irrigation} options={[["rainfed", "Rain only"], ["irrigated", "Irrigated"]]} onChange={(irrigation) => setReq((r) => ({ ...r, irrigation }))} />
            </div>
            <p className="mt-1 min-h-4 text-xs text-ink/70" aria-live="polite">
              {busy ? "Re-planning with your settings…" : ""}
            </p>
            <label className="mt-3 flex items-center justify-between gap-3 rounded-md border border-ink/15 px-3 py-2">
              <span>
                <span className="block text-sm font-semibold">El Niño (2015–16)</span>
                <span className="block text-xs text-ink/70">Replays the real El Niño months; crops it hurts wilt</span>
              </span>
              <Switch checked={scenario === "elnino"} onChange={(on) => setScenario(on ? "elnino" : "normal")} label="Replay the 2015–16 El Niño" />
            </label>
            {scenario === "elnino" && (
              <Suspense fallback={<p className="mt-2 text-xs text-ink/70" role="status">Loading El Niño analysis…</p>}>
                <ElNinoReport req={req} preset={target} now={chosen.now} normal={chosen.normal} />
              </Suspense>
            )}
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
            <div className="mt-auto flex flex-wrap gap-2 pt-5" data-tour="report">
              <button type="button" onClick={() => setStage("plants")} className="btn btn-primary flex-1">
                <Sprout className="size-4" aria-hidden /> Change plants
              </button>
              <button type="button" onClick={() => void downloadPdfReport()} className="btn btn-secondary">
                <FileDown className="size-4" aria-hidden /> Download PDF Report
              </button>
              <button type="button" onClick={() => void backToMap()} className="btn btn-secondary">
                <ArrowLeft className="size-4" aria-hidden /> New farm
              </button>
            </div>
            </div>
            )}
            <ResizeGrip panel={statsPanel} label="field data" />
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

      {/* The cockpit HUD is in the DOM, invisible, while the tiles leave: no coach marks until it shows. */}
      <Tour step={stage === "intro" || stage === "leaving" ? null : tour} onStep={setTour} onAdvance={advanceTour} />

      {stage !== "intro" && (
        <p className="map-credit">
          {satellite ? (
            "Tiles © Esri"
          ) : (
            <>
              ©{" "}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                OpenStreetMap
              </a>
            </>
          )}{" "}
          · NASA POWER{gibsOverlay !== "none" ? " · NASA GIBS" : ""}
        </p>
      )}
    </section>
  );
}
