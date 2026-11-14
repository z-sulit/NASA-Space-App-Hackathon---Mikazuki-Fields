import { useEffect, useRef, type ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import type { Preset } from "../types";
import { Emblem } from "./Emblem";
import { prefersReducedMotion, useScramble } from "./ui";

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
    <div aria-hidden className="pointer-events-none absolute inset-0" style={{ transform: "translateY(calc(var(--sy, 0) * -70px))" }}>
      <svg className="leaf-sway absolute inset-0 h-full w-full" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice">
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
    </div>
  );
}

/** Cockpit-style targeting frame: brackets snap on, the dashed ring turns slowly, and it drifts against the pointer. */
function HudFrame() {
  const c = "rgba(244,237,230,0.35)";
  return (
    <svg
      aria-hidden
      className="lock-on pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      width="300"
      height="300"
      viewBox="0 0 300 300"
      style={{ animationDelay: "500ms", transform: "translate(calc(var(--px, 0) * -10px), calc(var(--py, 0) * -10px))" }}
    >
      <g fill="none" stroke={c} strokeWidth="1.5">
        <path d="M20 60V20H60M240 20H280V60M280 240V280H240M60 280H20V240" />
        <path d="M4 150H24M276 150H296" />
        <g className="spin-slow" style={{ transformOrigin: "150px 150px" }}>
          <circle cx="150" cy="150" r="128" strokeDasharray="2 10" />
          <path d="M150 16V28" strokeWidth="2.5" stroke="rgba(212,222,114,0.8)" />
        </g>
      </g>
    </svg>
  );
}

function Line({ children, i }: { children: ReactNode; i: number }) {
  return (
    <span className="line-mask">
      <span className="line-rise" style={{ animationDelay: `${i * 110}ms` }}>
        {children}
      </span>
    </span>
  );
}

export function Hero({ preset, ready, topRight }: { preset: Preset; ready: boolean; topRight: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const lat = `${Math.abs(preset.lat).toFixed(2)}° ${preset.lat >= 0 ? "N" : "S"}`;
  const lon = `${Math.abs(preset.lon).toFixed(2)}° ${preset.lon >= 0 ? "E" : "W"}`;
  const unit = useScramble("Unit 01 · Mikazuki", ready, 800);
  const coords = useScramble(`${lat} / ${lon}`, ready, 800);

  // Scroll parallax (--sy: 0 at the top, 1 when the hero has scrolled away) and pointer tilt (--px, --py: -1..1).
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const sy = Math.min(1, Math.max(0, window.scrollY / el.offsetHeight));
        el.style.setProperty("--sy", sy.toFixed(3));
      });
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--px", (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
      el.style.setProperty("--py", (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
    };
    const onLeave = () => {
      el.style.setProperty("--px", "0");
      el.style.setProperty("--py", "0");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <section ref={ref} aria-labelledby="hero-h" data-ready={ready} className="hero-bg relative isolate overflow-hidden text-[#f4ede6]">
      <LeafShadows />
      <div className="relative mx-auto flex min-h-[640px] max-w-[1280px] flex-col px-4 pt-4 pb-8 lg:min-h-[86vh]">
        {/* Top bar */}
        <div className="fade-up relative z-20 flex flex-wrap items-center justify-between gap-3" style={{ animationDelay: "600ms" }}>
          <div className="flex items-center gap-2">
            <Emblem size={30} tile={false} />
            <span className="micro">Mikazuki Fields</span>
          </div>
          <div className="flex items-center gap-2">{topRight}</div>
        </div>

        {/* Wordmark + spec line (drifts down slower than the page while scrolling) */}
        <div className="mt-8 flex flex-wrap items-start justify-between gap-6" style={{ transform: "translateY(calc(var(--sy, 0) * 90px))" }}>
          <h1 id="hero-h" className="text-[clamp(52px,10vw,128px)] leading-[0.9] font-normal">
            <Line i={0}>Mikazuki</Line>
            <Line i={1}>
              Fields<span className="align-super text-[0.3em]">™</span>
            </Line>
          </h1>
          <p className="micro fade-up max-w-[240px] text-[#f4ede6]/80" style={{ animationDelay: "700ms" }}>
            A 3-route crop planner
            <br />
            built on 10 years
            <br />
            of NASA data
          </p>
        </div>

        {/* Centerpiece */}
        <div
          className="relative my-6 flex min-h-[300px] flex-1 items-center justify-center"
          style={{ transform: "translateY(calc(var(--sy, 0) * 40px)) scale(calc(1 - var(--sy, 0) * 0.14))" }}
        >
          <HudFrame />
          <div className="pop-in" style={{ animationDelay: "250ms" }}>
            <div
              className="transition-transform duration-300 ease-out"
              style={{ transform: "perspective(700px) rotateX(calc(var(--py, 0) * -9deg)) rotateY(calc(var(--px, 0) * 11deg))" }}
            >
              <div className="float drop-shadow-[0_30px_40px_rgba(10,14,3,0.55)]">
                <Emblem size={176} />
              </div>
            </div>
          </div>
          <span className="micro absolute top-2 left-1/2 hidden -translate-x-1/2 whitespace-pre text-[#f4ede6]/70 sm:block" aria-label="Unit 01, Mikazuki">
            {unit}
          </span>
          <span className="micro absolute bottom-2 left-1/2 hidden -translate-x-1/2 whitespace-pre text-[#f4ede6]/70 tabular sm:block" aria-label={`${lat}, ${lon}`}>
            {coords}
          </span>
        </div>

        {/* Bottom row (fades as the planner scrolls in) */}
        <div className="flex flex-wrap items-end justify-between gap-6" style={{ opacity: "calc(1 - var(--sy, 0) * 1.6)" }}>
          <div className="max-w-[460px]">
            <p className="font-display text-[clamp(28px,4vw,40px)] leading-[1.05] font-normal tracking-[-0.02em]">
              <Line i={3}>For your fields.</Line>
              <Line i={4}>For the next 6 seasons.</Line>
            </p>
            <p className="fade-up mt-3 text-sm text-[#f4ede6]/80" style={{ animationDelay: "800ms" }}>
              Named for a crescent moon, and for a pilot who only ever wanted to farm.
            </p>
            <div className="fade-up" style={{ animationDelay: "900ms" }}>
              <a href="#planner" className="micro btn-sweep mt-5 inline-flex min-h-12 items-center gap-2 rounded-full bg-chartreuse px-6 text-foreground">
                Plan my 3 routes <ArrowDown className="size-4" aria-hidden />
              </a>
            </div>
          </div>
          <div className="micro fade-up space-y-1 text-right text-[#f4ede6]/75" style={{ animationDelay: "900ms" }}>
            <p>NASA POWER · SRTM · MODIS</p>
            <p>Team Tekkadan · Space Apps 2026</p>
          </div>
        </div>
      </div>
    </section>
  );
}
