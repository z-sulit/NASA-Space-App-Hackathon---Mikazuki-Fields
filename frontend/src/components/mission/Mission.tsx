import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Crosshair, Lock } from "lucide-react";
import type { PlanId, PlansResponse, Preset, Scenario } from "../../types";
import { climate } from "../../engine/simulate";
import { Emblem } from "../Emblem";
import { prefersReducedMotion, Switch, useScramble } from "../ui";
import { TargetMap, type TargetMapHandle } from "./TargetMap";
import { Plantation } from "./Plantation";
import type { FieldHandle } from "../../three/tileField";

/**
 * The opening "mission", from the team's sketch:
 *   1 intro    green tile field, loading bar, START
 *   2 target   cockpit view over the Philippines; lock onto a farm
 *   3 flying   the suit hovers down to the farm
 *   4 planting the field plants itself, then the field data slides in
 */
type Stage = "intro" | "leaving" | "target" | "locking" | "flying" | "planting" | "rising";

function supportsWebGL() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Frame 1 backdrop: WebGL tile field, or a flat CSS grid without WebGL / with reduced motion. */
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
      const t = setTimeout(() => exitRef.current(), prefersReducedMotion() ? 0 : 500);
      return () => clearTimeout(t);
    }
  }, [exiting]);

  return (
    <div ref={host} className={`absolute inset-0 transition-opacity duration-700 ${exiting && !gl ? "opacity-0" : ""}`}>
      {!gl && <div className="tile-fallback absolute inset-0" aria-hidden />}
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  const shown = useScramble(value, true, 520);
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[#f6efeb]/10 py-1.5">
      <dt className="micro text-[10.5px] text-[#f6efeb]/60">{label}</dt>
      <dd className="micro text-[13px] whitespace-pre text-[#f6efeb] tabular" aria-label={value}>
        {shown}
      </dd>
    </div>
  );
}

export function Mission({
  presets,
  result,
  resultFor,
  ready,
  scenario,
  onScenario,
  onTarget,
  onReady,
  onOpenPlanner,
  topRight,
}: {
  presets: Preset[];
  result: PlansResponse | null;
  /** Preset the current result was computed for (null while computing). */
  resultFor: string | null;
  ready: boolean;
  scenario: Scenario;
  onScenario: (on: boolean) => void;
  onTarget: (presetId: string) => void;
  onReady: () => void;
  onOpenPlanner: () => void;
  topRight: ReactNode;
}) {
  const [stage, setStage] = useState<Stage>("intro");
  const [progress, setProgress] = useState(0);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState(presets[0].id);
  const [planId, setPlanId] = useState<PlanId>("B");
  const mapRef = useRef<TargetMapHandle>(null);
  const reduced = prefersReducedMotion();

  // Loading bar: eases toward 90% on its own and finishes once the first routes are computed.
  useEffect(() => {
    if (stage !== "intro") return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / (reduced ? 1 : 1500));
      const eased = 90 * (1 - Math.pow(1 - k, 3));
      setProgress((p) => Math.max(p, ready && k >= 1 ? 100 : eased));
      if (!(ready && k >= 1)) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, stage, reduced]);
  const loaded = progress >= 100;
  useEffect(() => {
    if (loaded) onReady();
  }, [loaded, onReady]);

  const focusId = stage === "target" ? (hoverId ?? targetId) : targetId;
  const focus = presets.find((p) => p.id === focusId)!;
  const dry = climate(focus, "dry", scenario);
  const lat = `${Math.abs(focus.lat).toFixed(2)}° ${focus.lat >= 0 ? "N" : "S"}`;
  const lon = `${Math.abs(focus.lon).toFixed(2)}° ${focus.lon >= 0 ? "E" : "W"}`;

  const lockOn = async (id: string) => {
    if (stage !== "target") return;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    const p = presets.find((x) => x.id === id)!;
    setTargetId(id);
    setHoverId(null);
    onTarget(id); // compute this farm's routes while we fly
    setStage("locking");
    await new Promise((r) => setTimeout(r, reduced ? 0 : 750));
    setStage("flying");
    await mapRef.current?.flyTo(p);
    setStage("planting");
  };

  const newTarget = async () => {
    setStage("rising");
    await mapRef.current?.reset();
    setStage("target");
  };

  const showMap = stage !== "intro";
  const plantPreset = presets.find((p) => p.id === targetId)!;
  const routesReady = result && resultFor === targetId && stage === "planting";

  return (
    <section aria-label="Mikazuki Fields mission" className="mission relative h-[100svh] min-h-[620px] overflow-hidden text-[#f6efeb]" data-stage={stage}>
      {/* Map (frames 2–4) sits under the tiles and is revealed as they fall away */}
      {showMap && (
        <div className={`absolute inset-0 transition-opacity duration-1000 ${stage === "leaving" ? "opacity-0" : "opacity-100"}`}>
          <TargetMap ref={mapRef} presets={presets} focusId={focusId} locked={stage !== "target"} onHover={setHoverId} onPick={lockOn} />
          <div className={`mission-dim ${stage === "planting" ? "is-on" : ""}`} aria-hidden />
          <div className="hud-scan" aria-hidden />
        </div>
      )}

      {/* Frame 1: tiles */}
      {(stage === "intro" || stage === "leaving") && (
        <TileField exiting={stage === "leaving"} onExited={() => setStage("target")} />
      )}

      {/* Cockpit frame, always on */}
      <div className="hud-frame" aria-hidden />

      {/* Top bar */}
      <div className="relative z-30 mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 pt-4">
        <div className="flex items-center gap-2">
          <Emblem size={30} tile={false} />
          <span className="micro">Mikazuki Fields</span>
        </div>
        <div className="flex items-center gap-2">{topRight}</div>
      </div>

      {/* Frame 1 content */}
      {(stage === "intro" || stage === "leaving") && (
        <div className={`intro-copy ${stage === "leaving" ? "is-leaving" : ""}`}>
          <p className="micro text-sakura">Green tiles · NASA Space Apps 2026</p>
          <h1 className="mt-3 font-display text-[clamp(56px,11vw,150px)] leading-[0.88] font-normal tracking-[-0.03em]">
            <span className="line-mask">
              <span className="line-rise">Mikazuki</span>
            </span>
            <span className="line-mask">
              <span className="line-rise" style={{ animationDelay: "110ms" }}>
                Fields
              </span>
            </span>
          </h1>
          <p className="fade-up mt-4 max-w-[420px] text-[#f6efeb]/80" style={{ animationDelay: "400ms" }}>
            Your next 6 seasons, planned with 10 years of NASA data. Touch the field, then press start.
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
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
                  setStage("leaving");
                }}
                disabled={stage === "leaving"}
                className="micro pop-in btn-sweep inline-flex min-h-14 items-center gap-3 rounded-full bg-sakura px-8 text-[14px] text-foreground"
              >
                Start <ArrowRight className="size-5" aria-hidden />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Frame 2 content: targeting HUD */}
      {(stage === "target" || stage === "locking") && (
        <>
          <div className="hud-title">
            <p className="micro text-sakura">Step 02 / Targeting</p>
            <h2 className="mt-1 font-display text-[clamp(26px,3.4vw,44px)] leading-tight font-normal tracking-[-0.02em]">Select a location</h2>
            <p className={`micro mt-2 ${stage === "locking" ? "blink-3 text-sakura" : "text-[#f6efeb]/70"}`} aria-live="polite">
              {stage === "locking" ? "Target locked · descending" : "Hover a target · tap to lock"}
            </p>
          </div>

          <aside className="hud-panel hud-panel-left" aria-label="Target data">
            <p className="micro text-sakura">Target</p>
            <p className="mt-1 font-display text-xl leading-6">{focus.name.split(" (")[0]}</p>
            <dl className="mt-2">
              <Readout label="Lat / Lon" value={`${lat} / ${lon}`} />
              <Readout label="Dry-season rain" value={`${Math.round(dry.rain_mm)} MM`} />
              <Readout label="Afternoon heat" value={`${dry.tmax_c.toFixed(1)} °C`} />
              <Readout label="Soil thirst" value={dry.gwetroot.toFixed(2)} />
              <Readout label="Daily water use" value={`${dry.et0_mm_day.toFixed(1)} MM/DAY`} />
            </dl>
          </aside>

          <aside className="hud-panel hud-panel-right" aria-label="Conditions">
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="micro block text-sakura">Dry spell</span>
                <span className="block text-xs text-[#f6efeb]/65">El Niño: −25% rain, +1.5 °C</span>
              </span>
              <Switch checked={scenario === "elnino"} onChange={onScenario} label="Simulate El Niño or dry spell" />
            </label>
            <dl className="mt-2">
              <Readout label="Slope" value={`${focus.slope_pct}%`} />
              <Readout label="Green cover" value={`NDVI ${focus.ndvi_dry_min.toFixed(2)}`} />
              <Readout label="2015–16 El Niño" value={focus.elnino_2016_dry_rain_pct === null ? "—" : `${Math.round(focus.elnino_2016_dry_rain_pct)}% RAIN`} />
            </dl>
            <button
              type="button"
              onClick={() => void lockOn(focusId)}
              disabled={stage !== "target"}
              className="micro btn-sweep mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-sakura px-4 text-foreground disabled:opacity-70"
            >
              {stage === "locking" ? <Lock className="size-4" aria-hidden /> : <Crosshair className="size-4" aria-hidden />}
              {stage === "locking" ? "Locked" : `Lock ${focus.name.split(" (")[0]}`}
            </button>
          </aside>
        </>
      )}

      {/* Frame 3 transition */}
      {(stage === "flying" || stage === "rising") && (
        <div className="hud-title">
          <p className="micro text-sakura">{stage === "flying" ? "Step 03 / Descent" : "Returning to orbit"}</p>
          <p className="micro mt-2 text-[#f6efeb]/80" aria-live="polite">
            {stage === "flying" ? `Hovering to ${plantPreset.name.split(" (")[0]} · ${lat} / ${lon}` : "Climbing · re-acquiring targets"}
          </p>
        </div>
      )}

      {/* Frames 3–4: plantation + data */}
      {stage === "planting" && (
        <div className="absolute inset-0 z-20 animate-[fade-up_0.6s_var(--mf-ease)_both]">
          {routesReady ? (
            <Plantation
              preset={plantPreset}
              plans={result[scenario]}
              normal={result.normal}
              planId={planId}
              onPlan={setPlanId}
              scenario={scenario}
              onScenario={onScenario}
              onBack={() => void newTarget()}
              onOpenPlanner={onOpenPlanner}
            />
          ) : (
            <p className="micro absolute top-1/2 left-1/2 -translate-x-1/2 text-[#f6efeb]/80">Computing routes…</p>
          )}
        </div>
      )}
    </section>
  );
}
