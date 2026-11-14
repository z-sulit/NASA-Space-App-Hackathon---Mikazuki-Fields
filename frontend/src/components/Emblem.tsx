import { useId } from "react";

/**
 * Original Mikazuki Fields mark: a crescent moon (mikazuki) cradling a small
 * five-petal "iron flower", embossed on a dark field tile. Drawn from scratch;
 * it is a nod to the name, not a copy of any franchise emblem.
 */
export function Emblem({ size = 180, tile = true, className = "" }: { size?: number; tile?: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Mikazuki Fields emblem" className={className}>
      <defs>
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a5622" />
          <stop offset="1" stopColor="#1d240a" />
        </linearGradient>
        <linearGradient id={`${id}-moon`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f1d37a" />
          <stop offset="1" stopColor="#c99a2e" />
        </linearGradient>
        <mask id={`${id}-cut`}>
          <rect width="100" height="100" fill="#fff" />
          <circle cx="60" cy="43" r="25" fill="#000" />
        </mask>
      </defs>
      {tile && (
        <>
          <rect x="2" y="2" width="96" height="96" rx="24" fill={`url(#${id}-tile)`} />
          <rect x="2.75" y="2.75" width="94.5" height="94.5" rx="23.25" fill="none" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="1.5" />
        </>
      )}
      <circle cx="48" cy="52" r="29" fill={`url(#${id}-moon)`} mask={`url(#${id}-cut)`} />
      <g fill="#c4553a">
        <circle cx="64" cy="37" r="4.2" />
        <circle cx="70.7" cy="41.9" r="4.2" />
        <circle cx="68.1" cy="49.8" r="4.2" />
        <circle cx="59.9" cy="49.8" r="4.2" />
        <circle cx="57.3" cy="41.9" r="4.2" />
      </g>
      <circle cx="64" cy="44" r="3" fill="#f1d37a" />
    </svg>
  );
}
