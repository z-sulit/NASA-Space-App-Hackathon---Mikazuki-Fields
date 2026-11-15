import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { placeCard } from "../../utils/tour";

const DONE_KEY = "mf-tour-done";

/** The walkthrough, in mission order. `target` matches a data-tour attribute; a step waits until its target is on screen. */
const STEPS = [
  {
    target: "locate",
    title: "Find your farm",
    body: "Search a town, tap the map to drop a pin, or switch to Draw boundary and tap each corner of your field to get its size in hectares.",
  },
  {
    target: "telemetry",
    title: "Read the site",
    body: "The Target panel holds 10 years of NASA POWER climate for the spot. Altitude, slope and green cover are in the Conditions panel, each marked live or from a reference site. Lock the farm to go on.",
  },
  {
    target: "settings",
    title: "Describe your field",
    body: "Open Farm settings to set soil, water and goal, and what a soil test told you. The routes re-plan as you change them. Pick a route and plant it to go on.",
  },
  {
    target: "routes",
    title: "Compare the routes",
    body: "Switch between Route A, B, C and your own. The field regrows, and profit, soil and risk update. The El Niño switch below replays the 2015–16 drought.",
  },
  {
    target: "timeline",
    title: "Walk the six seasons",
    body: "Press play or pick a season to see its crop, rain and soil nitrogen on the field.",
  },
];

const find = (step: number) => document.querySelector<HTMLElement>(`[data-tour="${STEPS[step].target}"]`);

/** First visit starts at step 0; a finished or skipped tour stays away until Guide replays it. */
export function firstVisitStep(): number | null {
  try {
    return localStorage.getItem(DONE_KEY) ? null : 0;
  } catch {
    return 0; // storage blocked: show it, it is one tap to skip
  }
}
/** Guide button: replay from the first step that has something to point at on this screen. */
export const stepOnScreen = () => Math.max(0, STEPS.findIndex((_, i) => find(i)));

/**
 * Coach marks: a spotlight ring around one part of the screen and a card that explains it.
 * Nothing here takes pointer events except the card, so the map and the 3D field stay usable.
 */
export function Tour({ step, onStep }: { step: number | null; onStep: (step: number | null) => void }) {
  const [box, setBox] = useState<DOMRect | null>(null);
  const [cardH, setCardH] = useState(0);
  const card = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  // Follow the target: panels can be dragged, and later steps appear only when their screen does.
  useEffect(() => {
    if (step === null) return setBox(null);
    let scrolled = false;
    const measure = () => {
      const el = find(step);
      // Farm settings sit below the fold on a phone: bring the target into view once.
      if (el && !scrolled) {
        scrolled = true;
        el.scrollIntoView({ block: "center" });
      }
      const r = el?.getBoundingClientRect();
      const seen = r && r.width > 0 && r.height > 0 ? r : null;
      setBox((old) => (old && seen && old.x === seen.x && old.y === seen.y && old.width === seen.width && old.height === seen.height ? old : seen));
    };
    measure();
    const id = setInterval(measure, 200);
    return () => clearInterval(id);
  }, [step]);

  const shown = step !== null && box !== null;
  useLayoutEffect(() => {
    if (shown) setCardH(card.current?.offsetHeight ?? 0);
  }, [shown, step]);
  useEffect(() => {
    if (shown) next.current?.focus({ preventScroll: true });
  }, [shown, step]);

  const finish = () => {
    try {
      localStorage.setItem(DONE_KEY, "1");
    } catch {
      /* private mode: the tour shows again next visit */
    }
    onStep(null);
  };
  // Esc skips the tour before the mission's own Esc (back a step) sees it.
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      finishRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [shown]);

  if (!shown) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  const cardW = Math.min(340, window.innerWidth - 24);
  const at = placeCard(box, cardW, cardH, window.innerWidth, window.innerHeight);

  return (
    <>
      <div className="tour-spot" aria-hidden style={{ left: box.left - 6, top: box.top - 6, width: box.width + 12, height: box.height + 12 }} />
      <div ref={card} className="tour-card" role="dialog" aria-labelledby={titleId} style={{ left: at.left, top: at.top, width: cardW }}>
        <p className="text-xs text-ink/70 tabular">
          Step {step + 1} of {STEPS.length}
        </p>
        <h2 id={titleId} className="mt-0.5 font-display text-xl leading-6">
          {s.title}
        </h2>
        <p className="mt-1.5 text-sm text-ink/80">{s.body}</p>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" className="btn btn-secondary" disabled={step === 0 || !find(step - 1)} onClick={() => onStep(step - 1)}>
            Back
          </button>
          <button ref={next} type="button" className="btn btn-primary flex-1" onClick={() => (last ? finish() : onStep(step + 1))}>
            {last ? "Finish" : "Next"}
          </button>
          {!last && (
            <button type="button" className="tour-skip" onClick={finish}>
              Skip tour
            </button>
          )}
        </div>
      </div>
    </>
  );
}
