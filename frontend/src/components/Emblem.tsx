import { useId } from "react";

/**
 * Mikazuki Fields mark, from the team's sketch: a crescent that closes into a
 * full ring (thick at the lower left, tapering to the upper right) with a small
 * five-petal "iron flower" in the middle of the opening.
 * Original artwork; a nod to the name, not a copy of any franchise emblem.
 */
const R_OUT = 40;
const R_IN = 28;
const SHIFT = 7.5; // how far the inner circle sits toward the upper right (ring stays 4.5 wide at its thinnest)
const CX = +(50 + SHIFT * Math.SQRT1_2).toFixed(2);
const CY = +(50 - SHIFT * Math.SQRT1_2).toFixed(2);
const CRESCENT =
  `M${50 + R_OUT} 50A${R_OUT} ${R_OUT} 0 1 0 ${50 - R_OUT} 50A${R_OUT} ${R_OUT} 0 1 0 ${50 + R_OUT} 50Z` +
  `M${CX + R_IN} ${CY}A${R_IN} ${R_IN} 0 1 1 ${CX - R_IN} ${CY}A${R_IN} ${R_IN} 0 1 1 ${CX + R_IN} ${CY}Z`;
const PETALS = [0, 1, 2, 3, 4].map((i) => {
  const deg = -90 + 72 * i;
  const rad = (deg * Math.PI) / 180;
  return { x: +(CX + 7.4 * Math.cos(rad)).toFixed(2), y: +(CY + 7.4 * Math.sin(rad)).toFixed(2), rot: deg + 90 };
});

export function Emblem({
  size = 180,
  tile = true,
  animated = false,
  className = "",
}: {
  size?: number;
  tile?: boolean;
  /** Draws the ring, fills the crescent, then blooms the petals one by one. */
  animated?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const origin = { transformOrigin: `${CX}px ${CY}px` };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Mikazuki Fields emblem"
      className={`${animated ? "emb-anim" : ""} ${className}`}
    >
      <defs>
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a5622" />
          <stop offset="1" stopColor="#1d240a" />
        </linearGradient>
        <linearGradient id={`${id}-moon`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f1d37a" />
          <stop offset="1" stopColor="#c99a2e" />
        </linearGradient>
      </defs>
      {tile && (
        <>
          <rect x="2" y="2" width="96" height="96" rx="24" fill={`url(#${id}-tile)`} />
          <rect x="2.75" y="2.75" width="94.5" height="94.5" rx="23.25" fill="none" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="1.5" />
        </>
      )}
      <g transform={tile ? "translate(50 50) scale(0.74) translate(-50 -50)" : undefined}>
        <circle className="emb-ring" cx="50" cy="50" r={R_OUT - 0.5} pathLength={1} fill="none" stroke="#e3b341" strokeWidth="1" />
        <circle className="emb-ring" cx={CX} cy={CY} r={R_IN + 0.5} pathLength={1} fill="none" stroke="#e3b341" strokeWidth="1" />
        <path className="emb-fill" d={CRESCENT} fillRule="evenodd" fill={`url(#${id}-moon)`} />
        {PETALS.map((p, i) => (
          // The <g> carries the bloom (CSS scale about the flower's center); the ellipse keeps its own rotation.
          <g key={i} className="emb-petal" style={{ ...origin, animationDelay: `${1000 + i * 80}ms` }}>
            <ellipse cx={p.x} cy={p.y} rx="4.6" ry="6.8" transform={`rotate(${p.rot} ${p.x} ${p.y})`} fill="#c4553a" stroke="#8f3a24" strokeWidth="0.6" />
          </g>
        ))}
        <circle className="emb-petal" cx={CX} cy={CY} r="3.2" fill="#f1d37a" style={{ ...origin, animationDelay: "1400ms" }} />
      </g>
    </svg>
  );
}
