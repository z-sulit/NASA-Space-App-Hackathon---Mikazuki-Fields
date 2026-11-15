type Box = { left: number; top: number; right: number; bottom: number; width: number };
export type RectBox = Box & { height: number };

const GAP = 12;

/** Bounding union across visible reference-site marker nodes inside the viewport. */
export function visibleRefsRect(rects: readonly RectBox[], vw: number, vh: number): RectBox | null {
  const inView = rects.filter(
    (r) => r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh,
  );
  if (inView.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const r of inView) {
    if (r.left < left) left = r.left;
    if (r.top < top) top = r.top;
    if (r.right > right) right = r.right;
    if (r.bottom > bottom) bottom = r.bottom;
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/** Where the coach-mark card goes: under its target, else above it, else pinned to the bottom of the screen. Always on screen. */
export function placeCard(target: Box, cardW: number, cardH: number, vw: number, vh: number): { left: number; top: number } {
  const left = Math.min(Math.max(GAP, target.left + target.width / 2 - cardW / 2), Math.max(GAP, vw - cardW - GAP));
  const lowest = Math.max(GAP, vh - cardH - GAP);
  if (vh - target.bottom >= cardH + 2 * GAP) return { left, top: Math.max(GAP, target.bottom + GAP) };
  if (target.top >= cardH + 2 * GAP) return { left, top: Math.min(lowest, target.top - GAP - cardH) };
  return { left, top: lowest };
}
