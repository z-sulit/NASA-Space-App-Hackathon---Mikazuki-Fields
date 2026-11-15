type Box = { left: number; top: number; right: number; bottom: number; width: number };
export type RectBox = Box & { height: number };

export type TourTarget = "locate" | "refs" | "telemetry" | "layers" | "lock" | "settings" | "routes" | "timeline" | "report";

export const TOUR_ORDER: readonly TourTarget[] = [
  "locate",
  "refs",
  "telemetry",
  "layers",
  "lock",
  "settings",
  "routes",
  "timeline",
  "report",
];

/** Advances an active tour to the first step of `stage` if still on an earlier screen's step. */
export function advanceTourForStage(step: number | null, stage: "plants" | "planting"): number | null {
  if (step === null) return null;
  const entryIdx = TOUR_ORDER.indexOf(stage === "plants" ? "settings" : "routes");
  return step < entryIdx ? entryIdx : step;
}

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

/** Where the coach-mark card goes: beside a tall/side-preferred target, else under, above, or pinned to the bottom. Always on screen. */
export function placeCard(
  target: Box,
  cardW: number,
  cardH: number,
  vw: number,
  vh: number,
  options?: { preferSide?: boolean },
): { left: number; top: number } {
  const leftCentered = Math.min(Math.max(GAP, target.left + target.width / 2 - cardW / 2), Math.max(GAP, vw - cardW - GAP));
  const lowest = Math.max(GAP, vh - cardH - GAP);
  const targetH = Math.max(0, target.bottom - target.top);
  const topCentered = Math.min(Math.max(GAP, target.top + targetH / 2 - cardH / 2), lowest);

  const trySide = (): { left: number; top: number } | null => {
    const rightLeft = target.right + GAP;
    const rightFits = rightLeft + cardW <= vw - GAP;
    const leftLeft = target.left - GAP - cardW;
    const leftFits = leftLeft >= GAP;
    if (!rightFits && !leftFits) return null;
    if (rightFits && leftFits) {
      return { left: vw - target.right >= target.left ? rightLeft : leftLeft, top: topCentered };
    }
    return { left: rightFits ? rightLeft : leftLeft, top: topCentered };
  };

  if (options?.preferSide) {
    const side = trySide();
    if (side) return side;
  }
  if (vh - target.bottom >= cardH + 2 * GAP) return { left: leftCentered, top: Math.max(GAP, target.bottom + GAP) };
  if (target.top >= cardH + 2 * GAP) return { left: leftCentered, top: Math.min(lowest, target.top - GAP - cardH) };
  if (!options?.preferSide) {
    const side = trySide();
    if (side) return side;
  }
  return { left: leftCentered, top: lowest };
}
