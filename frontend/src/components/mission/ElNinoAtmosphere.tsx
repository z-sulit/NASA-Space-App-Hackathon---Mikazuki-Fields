import { useMemo } from "react";

/** Deterministic pseudo-random, so the dust field is the same on every render. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/**
 * Dust motes as box-shadows on one tiny element: a single layer the compositor can move.
 * The pattern fills one screen height and is drawn twice (the copy one screen lower), so
 * rising by exactly one screen height loops seamlessly.
 */
function dustShadows(count: number, seed: number, maxSize: number) {
  const r = rng(seed);
  const dots: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = (r() * 100).toFixed(2);
    const y = (r() * 100).toFixed(2);
    const s = (0.6 + r() * maxSize).toFixed(1);
    const a = (0.25 + r() * 0.5).toFixed(2);
    const c = `rgb(255 ${Math.round(200 + r() * 40)} ${Math.round(150 + r() * 40)} / ${a})`;
    dots.push(`${x}vw ${y}vh 0 ${s}px ${c}`, `${x}vw calc(${y}vh + 100vh) 0 ${s}px ${c}`);
  }
  return dots.join(",");
}

/**
 * El Niño atmosphere over the map: sky tint, sun glare, heat shimmer and dust, with a flash each time it is switched on.
 * Decorative only (aria-hidden) and static under reduced motion.
 */
export function ElNinoAtmosphere({ on }: { on: boolean }) {
  const near = useMemo(() => dustShadows(70, 7, 1.8), []);
  const far = useMemo(() => dustShadows(110, 19, 0.9), []);
  return (
    <div className={`elnino-atmo print:hidden ${on ? "is-on" : ""}`} aria-hidden>
      <div className="atmo-tint" />
      <div className="atmo-sun" />
      <div className="atmo-haze" />
      <div className="atmo-dust atmo-dust-far">
        <i style={{ boxShadow: far }} />
      </div>
      <div className="atmo-dust atmo-dust-near">
        <i style={{ boxShadow: near }} />
      </div>
      <div className="atmo-ground" />
      {on && <div className="atmo-flash" />}
    </div>
  );
}
