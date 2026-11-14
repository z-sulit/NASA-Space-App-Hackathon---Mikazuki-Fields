import { useId } from "react";

/**
 * Mikazuki Fields mark, from the team's reference: an open crescent (thick at the
 * lower left, tips opening to the upper right) holding a large five-petal sakura.
 * Original artwork; a nod to the name, not a copy of any franchise emblem.
 *
 * Geometry is shared with the WebGL tile (three/tileScene.ts) through EMBLEM.
 */
export const EMBLEM = {
  outer: { cx: 50, cy: 50, r: 40 },
  inner: { cx: 60, cy: 44, r: 31 }, // pokes past the outer circle on the upper right, so the crescent opens there
  flower: { cx: 60, cy: 44, petal: 24 }, // petal length from the flower's center
};

/** One notched sakura petal pointing up from (0,0), length L. */
export function petalPath(L: number) {
  const k = L / 21;
  const p = (x: number, y: number) => `${(x * k).toFixed(2)} ${(y * k).toFixed(2)}`;
  return `M0 0C${p(-7, -3)} ${p(-12, -12)} ${p(-8.5, -19)}C${p(-6.5, -22)} ${p(-2.5, -22)} ${p(0, -18.5)}C${p(2.5, -22)} ${p(6.5, -22)} ${p(8.5, -19)}C${p(12, -12)} ${p(7, -3)} 0 0Z`;
}

const { outer: O, inner: I, flower: F } = EMBLEM;
const CRESCENT =
  `M${O.cx + O.r} ${O.cy}A${O.r} ${O.r} 0 1 0 ${O.cx - O.r} ${O.cy}A${O.r} ${O.r} 0 1 0 ${O.cx + O.r} ${O.cy}Z` +
  `M${I.cx + I.r} ${I.cy}A${I.r} ${I.r} 0 1 1 ${I.cx - I.r} ${I.cy}A${I.r} ${I.r} 0 1 1 ${I.cx + I.r} ${I.cy}Z`;
const PETAL = petalPath(F.petal);

export function Emblem({
  size = 180,
  tile = true,
  animated = false,
  tone = "light",
  className = "",
}: {
  size?: number;
  tile?: boolean;
  /** Draws the crescent outline, fills it, then blooms the petals one by one. */
  animated?: boolean;
  /** "light" = pearl crescent (for dark backgrounds and the tile), "dark" = olive-ink crescent for light backgrounds. */
  tone?: "light" | "dark";
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const crescent = tile || tone === "light" ? `url(#${id}-pearl)` : "#26300f";
  const origin = { transformOrigin: `${F.cx}px ${F.cy}px` };
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Mikazuki Fields emblem" className={`${animated ? "emb-anim" : ""} ${className}`}>
      <defs>
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a5622" />
          <stop offset="1" stopColor="#1d240a" />
        </linearGradient>
        <linearGradient id={`${id}-pearl`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbf6f1" />
          <stop offset="1" stopColor="#dccfc2" />
        </linearGradient>
        <radialGradient id={`${id}-petal`} cx="0.5" cy="0.95" r="1">
          <stop offset="0" stopColor="#f7a8bd" />
          <stop offset="1" stopColor="#fde4ea" />
        </radialGradient>
      </defs>
      {tile && (
        <>
          <rect x="2" y="2" width="96" height="96" rx="24" fill={`url(#${id}-tile)`} />
          <rect x="2.75" y="2.75" width="94.5" height="94.5" rx="23.25" fill="none" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="1.5" />
        </>
      )}
      <g transform={tile ? "translate(50 50) scale(0.76) translate(-50 -50)" : undefined}>
        <path className="emb-ring" d={CRESCENT} fillRule="evenodd" pathLength={1} fill="none" stroke={tone === "dark" && !tile ? "#26300f" : "#efe6dc"} strokeWidth="0.8" />
        <path className="emb-fill" d={CRESCENT} fillRule="evenodd" fill={crescent} />
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i} className="emb-petal" style={{ ...origin, animationDelay: `${1000 + i * 80}ms` }}>
            <path d={PETAL} transform={`translate(${F.cx} ${F.cy}) rotate(${i * 72})`} fill={`url(#${id}-petal)`} stroke="#e58fa8" strokeWidth="0.7" strokeLinejoin="round" />
          </g>
        ))}
        <g className="emb-petal" style={{ ...origin, animationDelay: "1400ms" }}>
          {[0, 1, 2, 3, 4].map((i) => {
            const a = ((i * 72 + 36 - 90) * Math.PI) / 180;
            return <circle key={i} cx={F.cx + 5.2 * Math.cos(a)} cy={F.cy + 5.2 * Math.sin(a)} r="0.9" fill="#c2477a" />;
          })}
          <circle cx={F.cx} cy={F.cy} r="3.4" fill="#d94f7a" />
        </g>
      </g>
    </svg>
  );
}
