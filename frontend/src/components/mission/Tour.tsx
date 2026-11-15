import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { placeCard } from "../../utils/tour";

const DONE_KEY = "mf-tour-done";

export type TourTarget = "locate" | "telemetry" | "lock" | "settings" | "routes" | "timeline" | "report";

/** The walkthrough, in mission order. `target` matches a data-tour attribute; a step waits until its target is on screen. */
const STEPS: { target: TourTarget; title: string; body: string; hint?: string }[] = [
  {
    target: "locate",
    title: "Find your farm",
    body: "Search a town, tap the map to drop a pin, or switch to Draw boundary and tap corners to auto-calculate hectares.",
  },
  {
    target: "telemetry",
    title: "Read live telemetry",
    body: "Target holds 10 years of NASA POWER climate and live Open-Meteo weather; Conditions beside it shows SRTM 30 m altitude, slope, and MODIS NDVI.",
  },
  {
    target: "lock",
    title: "Lock your farm",
    body: "Confirm your site with Lock to compute crop routes and descend onto your field.",
    hint: "Finish loading telemetry, then click Lock to continue.",
  },
  {
    target: "settings",
    title: "Describe your field",
    body: "Set land size (ha), soil tests, water, goal, or toggle El Niño—routes re-plan live before you click Plant below.",
    hint: "Wait for route planning to finish, then click Plant below.",
  },
  {
    target: "routes",
    title: "Compare routes & profit",
    body: "Switch Route A, B, C, or custom rotation to regrow the 3D field and compare dual PHP / USD 3-year profit.",
  },
  {
    target: "timeline",
    title: "Walk the six seasons",
    body: "Scrub through all 6 seasons or press play to follow crop growth with rain, heat, and soil nitrogen.",
    hint: "Waiting for the drone pass to finish planting…",
  },
  {
    target: "report",
    title: "Export PDF or adjust",
    body: "Download a 2-page PDF Field Report directly, tap Change plants to tweak settings, or choose New farm to relocate.",
  },
];

const find = (step: number) => document.querySelector<HTMLElement>(`[data-tour="${STEPS[step].target}"]`);
const rectOf = (step: number): DOMRect | null => {
  const r = find(step)?.getBoundingClientRect();
  return r && r.width > 0 && r.height > 0 ? r : null;
};

/** First visit starts at step 0; a finished or skipped tour stays away until Guide replays it. */
export function firstVisitStep(): number | null {
  try {
    return localStorage.getItem(DONE_KEY) ? null : 0;
  } catch {
    return 0; // storage blocked: show it, it is one tap to skip
  }
}
/** Guide button: replay from the first step that has something to point at on this screen. */
export const stepOnScreen = () => Math.max(0, STEPS.findIndex((_, i) => rectOf(i)));

/**
 * Coach marks: a spotlight ring around one part of the screen and a card that explains it.
 * Nothing here takes pointer events except the card, so the map and the 3D field stay usable.
 */
export function Tour({
  step,
  onStep,
  onAdvance,
}: {
  step: number | null;
  onStep: (step: number | null) => void;
  onAdvance?: (nextTarget: TourTarget) => boolean;
}) {
  const [box, setBox] = useState<DOMRect | null>(null);
  const [cardH, setCardH] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  // Follow the target: panels can be dragged, and later steps appear only when their screen does.
  useEffect(() => {
    setHint(null);
    if (step === null) return setBox(null);
    let scrolled = false;
    const measure = () => {
      const el = find(step);
      // Farm settings sit below the fold on a phone: bring the target into view once.
      if (el && !scrolled) {
        scrolled = true;
        el.scrollIntoView({ block: "center" });
      }
      const seen = rectOf(step);
      setBox((old) => (old && seen && old.x === seen.x && old.y === seen.y && old.width === seen.width && old.height === seen.height ? old : seen));
    };
    measure();
    const id = setInterval(measure, 200);
    return () => clearInterval(id);
  }, [step]);

  const shown = step !== null && box !== null;
  useLayoutEffect(() => {
    if (shown) setCardH(card.current?.offsetHeight ?? 0);
  }, [shown, step, hint]);
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

  const handleNext = () => {
    if (last) return finish();
    const nextStep = step + 1;
    const nextTarget = STEPS[nextStep].target;
    if (rectOf(nextStep) || onAdvance?.(nextTarget)) {
      setHint(null);
      onStep(nextStep);
      return;
    }
    setHint(s.hint ?? "Complete this step to continue.");
  };

  return (
    <>
      <div className="tour-spot" aria-hidden style={{ left: box.left - 6, top: box.top - 6, width: box.width + 12, height: box.height + 12 }} />
      <div ref={card} className="tour-card" role="dialog" aria-labelledby={titleId} style={{ left: at.left, top: at.top, width: cardW }}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-ink/70 tabular">
            Step {step + 1} of {STEPS.length}
          </p>
          <ol className="flex items-center gap-1.5" aria-hidden="true">
            {STEPS.map((st, i) => (
              <li
                key={st.target}
                className={`h-1.5 rounded-full transition-all duration-200 ${i === step ? "w-4 bg-sakura" : i < step ? "w-1.5 bg-sakura/60" : "w-1.5 bg-ink/25"}`}
              />
            ))}
          </ol>
        </div>
        <h2 id={titleId} className="mt-0.5 font-display text-xl leading-6">
          {s.title}
        </h2>
        <p className="mt-1.5 text-sm text-ink/80">{s.body}</p>
        {hint && (
          <p className="mt-2 rounded-[6px] border border-sakura/35 bg-sakura/10 px-2.5 py-1.5 text-xs text-sakura" role="status">
            {hint}
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button type="button" className="btn btn-secondary" disabled={step === 0 || !rectOf(step - 1)} onClick={() => onStep(step - 1)}>
            Back
          </button>
          <button ref={next} type="button" className="btn btn-primary flex-1" onClick={handleNext}>
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
