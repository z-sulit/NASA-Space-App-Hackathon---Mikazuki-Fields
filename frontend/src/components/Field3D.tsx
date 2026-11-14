import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Rotate3d } from "lucide-react";
import type { PlanResult, SeasonResult } from "../types";
import { CROP } from "../data/crops";
import { peso, SectionTitle } from "./ui";

const FAMILY_VAR = { Poaceae: "var(--family-poaceae)", Fabaceae: "var(--family-fabaceae)", Convolvulaceae: "var(--family-convolvulaceae)" } as const;

/** Block height in px for a soil-nitrogen value (0–100). */
const height = (n: number) => 8 + n * 0.9;

/**
 * "Soil terrain": 3 plans × 6 seasons as an isometric field of blocks.
 * Height = soil nitrogen left after that season, color = crop family.
 * Drag sideways to turn it; hover or tap a block for its numbers.
 */
export function Field3D({ plans }: { plans: PlanResult[] }) {
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef({ on: false, x: 0, moved: 0, rz: -38 });
  const [grown, setGrown] = useState(false);
  const [pick, setPick] = useState<{ plan: PlanResult; s: SeasonResult } | null>(null);

  // Blocks rise from the ground the first time the terrain scrolls into view.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setGrown(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Back row first: Plan A (usually the lowest) sits in front so its sinking steps are never hidden.
  const rows = [...plans].reverse();
  const summary = plans.map((p) => `Plan ${p.id} ends at soil nitrogen ${Math.round(p.kpis.nFinal)}`).join("; ");

  return (
    <section aria-labelledby="terrain-h" className="hud rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <SectionTitle id="terrain-h" num="04" kicker="Soil terrain">
          Watch the soil rise or sink
        </SectionTitle>
        <p className="micro flex items-center gap-1.5 text-olive">
          <Rotate3d className="size-4" aria-hidden /> Drag to turn
        </p>
      </div>
      <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
        Each block is one season. Taller means more nitrogen left in the soil; the color is the crop family.
      </p>

      <div
        ref={stage}
        className="f3d-stage mt-2"
        role="img"
        aria-label={`3D view of soil nitrogen by season. ${summary}.`}
        onPointerDown={(e) => {
          drag.current.on = true;
          drag.current.x = e.clientX;
          drag.current.moved = 0;
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d.on) return;
          d.moved += Math.abs(e.clientX - d.x);
          // Capture only once it is clearly a drag, so a plain tap still reaches the block under it.
          if (d.moved > 4 && !e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId);
          d.rz = Math.max(-75, Math.min(75, d.rz + (e.clientX - d.x) * 0.4));
          d.x = e.clientX;
          e.currentTarget.style.setProperty("--rz", `${d.rz.toFixed(1)}deg`);
        }}
        onPointerUp={() => (drag.current.on = false)}
        onPointerCancel={() => (drag.current.on = false)}
      >
        <div className="f3d-scene">
          <div className="f3d-ground" />
          {rows.map((p, row) => (
            <span key={p.id} className="f3d-label" style={{ left: "calc(var(--s) * -0.5)", top: `calc(${row} * (var(--s) + var(--g)) + var(--s) * 0.25)` }}>
              {p.id}
            </span>
          ))}
          {plans[0].seasons.map((s) => (
            <span key={s.index} className="f3d-label" style={{ left: `calc(${s.index} * (var(--s) + var(--g)) + var(--s) * 0.25)`, top: "calc(3 * (var(--s) + var(--g)))" }}>
              S{s.index + 1}
            </span>
          ))}
          {rows.map((p, row) =>
            p.seasons.map((s) => {
              const crop = CROP[s.crop];
              const style = {
                left: `calc(${s.index} * (var(--s) + var(--g)))`,
                top: `calc(${row} * (var(--s) + var(--g)))`,
                "--h": `${grown ? height(s.nEnd) : 2}px`,
                "--c": FAMILY_VAR[crop.family],
                "--d": `${s.index * 70 + row * 50}ms`,
              } as CSSProperties;
              return (
                <div
                  key={`${p.id}-${s.index}`}
                  className="f3d-bar"
                  style={style}
                  data-on={pick?.plan.id === p.id && pick.s.index === s.index}
                  onPointerEnter={() => setPick({ plan: p, s })}
                  onClick={() => setPick({ plan: p, s })}
                >
                  <i className="f3d-n" />
                  <i className="f3d-e" />
                  <i className="f3d-w" />
                  <i className="f3d-s" />
                  <i className="f3d-top" />
                </div>
              );
            }),
          )}
        </div>
      </div>

      <p className="micro min-h-8 text-foreground tabular" aria-live="polite">
        {pick
          ? `Plan ${pick.plan.id} · S${pick.s.index + 1} ${pick.s.kind} · ${CROP[pick.s.crop].short} · soil N ${Math.round(pick.s.nStart)} → ${Math.round(pick.s.nEnd)} · ${peso(pick.s.profit)}`
          : "Hover or tap a block to read it"}
      </p>
    </section>
  );
}
