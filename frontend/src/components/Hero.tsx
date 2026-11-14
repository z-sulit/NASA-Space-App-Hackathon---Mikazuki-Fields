import type { ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import type { Preset } from "../types";
import { Emblem } from "./Emblem";

/** Soft, blurred leaf shadows drifting across the backdrop (original shapes, CSS-animated). */
function LeafShadows() {
  const leaves = [
    { x: -40, y: 40, r: -35, s: 1.2 },
    { x: 60, y: 140, r: 20, s: 0.9 },
    { x: 10, y: 250, r: -10, s: 1.1 },
    { x: 980, y: 20, r: 40, s: 1.3 },
    { x: 1080, y: 160, r: -25, s: 1 },
    { x: 900, y: 320, r: 15, s: 0.8 },
  ];
  return (
    <svg aria-hidden className="leaf-sway pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice">
      <defs>
        <filter id="leaf-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>
      <g fill="#141a06" fillOpacity="0.45" filter="url(#leaf-blur)">
        {leaves.map((l, i) => (
          <g key={i} transform={`translate(${l.x} ${l.y}) rotate(${l.r}) scale(${l.s})`}>
            <path d="M0 60 C 40 0, 140 0, 200 60 C 140 120, 40 120, 0 60 Z" />
            <path d="M150 90 C 190 40, 280 50, 320 100 C 270 150, 190 140, 150 90 Z" />
            <rect x="-120" y="57" width="330" height="6" rx="3" />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Thin cockpit-style targeting frame around the emblem (the Mikazuki layer). */
function HudFrame() {
  const c = "rgba(244,237,230,0.35)";
  return (
    <svg aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" width="300" height="300" viewBox="0 0 300 300">
      <g fill="none" stroke={c} strokeWidth="1.5">
        <path d="M20 60V20H60M240 20H280V60M280 240V280H240M60 280H20V240" />
        <circle cx="150" cy="150" r="128" strokeDasharray="2 10" />
        <path d="M4 150H24M276 150H296" />
      </g>
    </svg>
  );
}

export function Hero({ preset, topRight }: { preset: Preset; topRight: ReactNode }) {
  const lat = `${Math.abs(preset.lat).toFixed(2)}° ${preset.lat >= 0 ? "N" : "S"}`;
  const lon = `${Math.abs(preset.lon).toFixed(2)}° ${preset.lon >= 0 ? "E" : "W"}`;
  return (
    <section aria-labelledby="hero-h" className="hero-bg relative isolate overflow-hidden text-[#f4ede6]">
      <LeafShadows />
      <div className="relative mx-auto flex min-h-[640px] max-w-[1280px] flex-col px-4 pt-4 pb-8 lg:min-h-[86vh]">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Emblem size={28} tile={false} />
            <span className="micro">Mikazuki Fields</span>
          </div>
          <div className="flex items-center gap-2">{topRight}</div>
        </div>

        {/* Wordmark + spec line */}
        <div className="mt-8 flex flex-wrap items-start justify-between gap-6">
          <h1 id="hero-h" className="text-[clamp(52px,10vw,128px)] leading-[0.9] font-normal">
            Mikazuki
            <br />
            Fields<span className="align-super text-[0.3em]">™</span>
          </h1>
          <p className="micro max-w-[240px] text-[#f4ede6]/80">
            A 3-route crop planner
            <br />
            built on 10 years
            <br />
            of NASA data
          </p>
        </div>

        {/* Centerpiece */}
        <div className="relative my-6 flex min-h-[300px] flex-1 items-center justify-center">
          <HudFrame />
          <div className="float drop-shadow-[0_30px_40px_rgba(10,14,3,0.55)]">
            <Emblem size={176} />
          </div>
          <span className="micro absolute top-2 left-1/2 hidden -translate-x-1/2 text-[#f4ede6]/70 sm:block">Unit 01 · Mikazuki</span>
          <span className="micro absolute bottom-2 left-1/2 hidden -translate-x-1/2 text-[#f4ede6]/70 tabular sm:block">
            {lat} / {lon}
          </span>
        </div>

        {/* Bottom row */}
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[460px]">
            <p className="font-display text-[clamp(28px,4vw,40px)] leading-[1.05] font-normal tracking-[-0.02em]">
              For your fields.
              <br />
              For the next 6 seasons.
            </p>
            <p className="mt-3 text-sm text-[#f4ede6]/80">Named for a crescent moon, and for a pilot who only ever wanted to farm.</p>
            <a
              href="#planner"
              className="micro mt-5 inline-flex min-h-12 items-center gap-2 rounded-full bg-chartreuse px-6 text-foreground transition-transform duration-150 hover:-translate-y-0.5"
            >
              Plan my 3 routes <ArrowDown className="size-4" aria-hidden />
            </a>
          </div>
          <div className="micro space-y-1 text-right text-[#f4ede6]/75">
            <p>NASA POWER · SRTM · MODIS</p>
            <p>Team Tekkadan · Space Apps 2026</p>
          </div>
        </div>
      </div>
    </section>
  );
}
