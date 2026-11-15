type Box = { left: number; top: number; right: number; bottom: number; width: number };

const GAP = 12;

/** Where the coach-mark card goes: under its target, else above it, else pinned to the bottom of the screen. Always on screen. */
export function placeCard(target: Box, cardW: number, cardH: number, vw: number, vh: number): { left: number; top: number } {
  const left = Math.min(Math.max(GAP, target.left + target.width / 2 - cardW / 2), Math.max(GAP, vw - cardW - GAP));
  const lowest = Math.max(GAP, vh - cardH - GAP);
  if (vh - target.bottom >= cardH + 2 * GAP) return { left, top: Math.max(GAP, target.bottom + GAP) };
  if (target.top >= cardH + 2 * GAP) return { left, top: Math.min(lowest, target.top - GAP - cardH) };
  return { left, top: lowest };
}
