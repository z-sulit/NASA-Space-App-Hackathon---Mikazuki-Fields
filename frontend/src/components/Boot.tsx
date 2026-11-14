import { useEffect, useState } from "react";
import type { Preset } from "../types";
import { Emblem } from "./Emblem";
import { prefersReducedMotion } from "./ui";

const RUN_MS = 1700; // start-up check
const EXIT_MS = 750; // curtain lift (matches .boot transition)

/**
 * Preloader in the style of a mobile-suit start-up check: the emblem draws itself,
 * the data sources report in, then the screen lifts like a curtain.
 * Under 2.5 s, skippable with a tap or any key, and skipped entirely with reduced motion.
 * The status words are honest: a source that is still a placeholder says SAMPLE.
 */
export function Boot({ presets, onDone }: { presets: Preset[]; onDone: () => void }) {
  const [phase, setPhase] = useState<"run" | "exit" | "gone">(() => (prefersReducedMotion() ? "gone" : "run"));
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (phase !== "run") return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / RUN_MS);
      setPct(Math.round(k * 100));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // The timer, not the animation frame, ends the boot: frames stop in a background tab, timers don't.
    const timer = setTimeout(() => setPhase("exit"), RUN_MS);
    const skip = () => setPhase("exit");
    window.addEventListener("keydown", skip);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      window.removeEventListener("keydown", skip);
    };
  }, [phase]);

  useEffect(() => {
    if (phase === "run") return;
    onDone(); // the hero starts its reveal as the curtain lifts
    if (phase !== "exit") return;
    const t = setTimeout(() => setPhase("gone"), EXIT_MS);
    return () => clearTimeout(t);
  }, [phase, onDone]);

  if (phase === "gone") return null;

  const sample = (key: string) => presets.some((p) => p.placeholders.includes(key));
  const lines = [
    ["Mikazuki Fields", "Start-up check"],
    ["NASA POWER · 2015–2024", "OK"],
    ["SRTM slope", sample("slope_pct") ? "Sample" : "OK"],
    ["MODIS green cover", sample("ndvi_dry_min") ? "Sample" : "OK"],
    [`${presets.length} farm presets`, "Loaded"],
    ["Pilot: farmer", "Ready"],
  ];

  return (
    <div
      className="boot hero-bg fixed inset-0 z-[60] flex cursor-pointer flex-col items-center justify-center gap-8 px-6 text-[#f6efeb]"
      data-phase={phase}
      onClick={() => setPhase("exit")}
      role="status"
      aria-label="Loading Mikazuki Fields"
    >
      <Emblem size={112} tile={false} animated />
      <div className="w-full max-w-[320px]">
        <ul className="micro space-y-1.5">
          {lines.map(([label, status], i) => (
            <li key={label} className="boot-line flex justify-between gap-4" style={{ animationDelay: `${150 + i * 210}ms` }}>
              <span className="text-[#f6efeb]/80">{label}</span>
              <span className={status === "Sample" ? "text-moon" : "text-sakura"}>{status}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 h-px w-full bg-[#f6efeb]/25">
          <div className="boot-bar h-px bg-sakura" />
        </div>
        <div className="micro mt-2 flex justify-between text-[#f6efeb]/70">
          <span>Tap to skip</span>
          <span className="tabular">{String(pct).padStart(3, "0")}%</span>
        </div>
      </div>
    </div>
  );
}
