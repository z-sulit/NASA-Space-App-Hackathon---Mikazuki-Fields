import { useId } from "react";

/**
 * Mikazuki Fields mark, from the team's reference: an open crescent (thick at the
 * lower left, tips opening to the upper right) holding a large five-petal sakura.
 * Original artwork; a nod to the name, not a copy of any franchise emblem.
 */
const O = { cx: 50, cy: 50, r: 40 };
const I = { cx: 60, cy: 44, r: 31 }; // pokes past the outer circle on the upper right, so the crescent opens there
const F = { cx: 60, cy: 44, petal: 24 }; // petal length from the flower's center

const CRESCENT =
  `M${O.cx + O.r} ${O.cy}A${O.r} ${O.r} 0 1 0 ${O.cx - O.r} ${O.cy}A${O.r} ${O.r} 0 1 0 ${O.cx + O.r} ${O.cy}Z` +
  `M${I.cx + I.r} ${I.cy}A${I.r} ${I.r} 0 1 1 ${I.cx - I.r} ${I.cy}A${I.r} ${I.r} 0 1 1 ${I.cx + I.r} ${I.cy}Z`;

/** One notched sakura petal pointing up from (0,0). */
const PETAL = (() => {
  const k = F.petal / 21;
  const p = (x: number, y: number) => `${(x * k).toFixed(2)} ${(y * k).toFixed(2)}`;
  return `M0 0C${p(-7, -3)} ${p(-12, -12)} ${p(-8.5, -19)}C${p(-6.5, -22)} ${p(-2.5, -22)} ${p(0, -18.5)}C${p(2.5, -22)} ${p(6.5, -22)} ${p(8.5, -19)}C${p(12, -12)} ${p(7, -3)} 0 0Z`;
})();

/** Inline SVG markup of the emblem (used when rasterizing for the PDF report header). */
export function emblemSvg({ size = 128, backdrop = false }: { size?: number; backdrop?: boolean } = {}): string {
  const petals = [0, 1, 2, 3, 4]
    .map((i) => `<path d="${PETAL}" transform="translate(${F.cx} ${F.cy}) rotate(${i * 72})" fill="url(#mf-petal)" stroke="#e58fa8" stroke-width="0.7" stroke-linejoin="round"/>`)
    .join("");
  const stamens = [0, 1, 2, 3, 4]
    .map((i) => {
      const a = ((i * 72 + 36 - 90) * Math.PI) / 180;
      return `<circle cx="${F.cx + 5.2 * Math.cos(a)}" cy="${F.cy + 5.2 * Math.sin(a)}" r="0.9" fill="#c2477a"/>`;
    })
    .join("");
  const tile = backdrop ? `<rect x="1" y="1" width="98" height="98" rx="22" fill="#1d240a" stroke="#404f1d" stroke-width="2"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"><defs><linearGradient id="mf-pearl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbf6f1"/><stop offset="1" stop-color="#dccfc2"/></linearGradient><radialGradient id="mf-petal" cx="0.5" cy="0.95" r="1"><stop offset="0" stop-color="#f7a8bd"/><stop offset="1" stop-color="#fde4ea"/></radialGradient></defs>${tile}<path d="${CRESCENT}" fill-rule="evenodd" fill="none" stroke="#efe6dc" stroke-width="0.8"/><path d="${CRESCENT}" fill-rule="evenodd" fill="url(#mf-pearl)"/>${petals}${stamens}<circle cx="${F.cx}" cy="${F.cy}" r="3.4" fill="#d94f7a"/></svg>`;
}

/** Pearl crescent and sakura, for the dark cockpit background. */
export function Emblem({ size = 180 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Mikazuki Fields emblem">
      <defs>
        <linearGradient id={`${id}-pearl`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbf6f1" />
          <stop offset="1" stopColor="#dccfc2" />
        </linearGradient>
        <radialGradient id={`${id}-petal`} cx="0.5" cy="0.95" r="1">
          <stop offset="0" stopColor="#f7a8bd" />
          <stop offset="1" stopColor="#fde4ea" />
        </radialGradient>
      </defs>
      <path d={CRESCENT} fillRule="evenodd" fill="none" stroke="#efe6dc" strokeWidth="0.8" />
      <path d={CRESCENT} fillRule="evenodd" fill={`url(#${id}-pearl)`} />
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={PETAL} transform={`translate(${F.cx} ${F.cy}) rotate(${i * 72})`} fill={`url(#${id}-petal)`} stroke="#e58fa8" strokeWidth="0.7" strokeLinejoin="round" />
      ))}
      {[0, 1, 2, 3, 4].map((i) => {
        const a = ((i * 72 + 36 - 90) * Math.PI) / 180;
        return <circle key={i} cx={F.cx + 5.2 * Math.cos(a)} cy={F.cy + 5.2 * Math.sin(a)} r="0.9" fill="#c2477a" />;
      })}
      <circle cx={F.cx} cy={F.cy} r="3.4" fill="#d94f7a" />
    </svg>
  );
}
