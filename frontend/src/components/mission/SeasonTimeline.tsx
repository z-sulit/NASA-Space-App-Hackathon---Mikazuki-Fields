import { useEffect, useRef, type KeyboardEvent } from "react";
import { Pause, Play } from "lucide-react";
import type { SeasonResult } from "../../types";
import type { SeasonWindow } from "../../data/calendar";
import { CROP } from "../../data/crops";

/**
 * Scrubber over the 3D field: All + six season stops. Picking a stop spotlights that bed; Play walks S1 to S6, one a second.
 * The track is a keyboard slider (arrows move one stop, Home = All, End = S6).
 */
export function SeasonTimeline({
  windows,
  seasons,
  focus,
  onFocus,
  onHover,
  playing,
  onPlaying,
  rainFor,
  tmaxFor,
}: {
  windows: SeasonWindow[];
  seasons: SeasonResult[];
  focus: number | null;
  onFocus: (i: number | null) => void;
  onHover?: (i: number | null) => void;
  playing: boolean;
  onPlaying: (on: boolean) => void;
  rainFor: (i: number) => number;
  tmaxFor: (i: number) => number;
}) {
  // Play: S1 → S6, one season a second, then back to All.
  const step = useRef(focus);
  step.current = focus;
  useEffect(() => {
    if (!playing) return;
    if (step.current === null || step.current >= 5) onFocus(0);
    const id = setInterval(() => {
      const cur = step.current;
      if (cur === null || cur >= 5) {
        onFocus(null);
        onPlaying(false);
      } else onFocus(cur + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = focus === null ? 0 : focus + 1; // 0 = All, 1..6 = S1..S6
  const set = (v: number) => {
    onPlaying(false);
    onFocus(v <= 0 ? null : Math.min(6, v) - 1);
  };
  const onKey = (e: KeyboardEvent) => {
    const k = e.key;
    if (k === "ArrowRight" || k === "ArrowUp") set(value + 1);
    else if (k === "ArrowLeft" || k === "ArrowDown") set(value - 1);
    else if (k === "Home") set(0);
    else if (k === "End") set(6);
    else return;
    e.preventDefault();
  };

  const s = focus === null ? null : seasons[focus];
  const w = focus === null ? null : windows[focus];

  return (
    <div className="season-timeline" data-tour="timeline">
      {s && w && (
        <p className="season-readout" aria-live="polite">
          <span className="font-semibold">
            S{w.index + 1} · {w.range}
          </span>
          <span>{CROP[s.crop].short}</span>
          <span className="tabular">Rain {Math.round(rainFor(w.index))} mm</span>
          <span className="tabular">Heat {tmaxFor(w.index).toFixed(1)} °C</span>
          <span>Bare soil in heavy rain: {s.bareMonths.length ? s.bareMonths.join(", ") : "none"}</span>
          <span className="tabular">
            Soil N {Math.round(s.nStart)} → {Math.round(s.nEnd)}
          </span>
        </p>
      )}
      <div className="season-track-row">
        <button
          type="button"
          className="season-play"
          onClick={() => onPlaying(!playing)}
          aria-label={playing ? "Pause the season walkthrough" : "Play the 6 seasons, one a second"}
          aria-pressed={playing}
        >
          {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
        </button>
        <div
          className="season-track"
          role="slider"
          tabIndex={0}
          aria-label="Season"
          aria-valuemin={0}
          aria-valuemax={6}
          aria-valuenow={value}
          aria-valuetext={w ? `Season ${w.index + 1}, ${w.long}, ${CROP[seasons[w.index].crop].short}` : "All 6 seasons"}
          onKeyDown={onKey}
          onMouseLeave={() => onHover?.(null)}
          style={{ ["--fill" as string]: `${(value / 6) * 100}%` }}
        >
          <span className="season-rail" aria-hidden />
          {[null, ...windows].map((win, i) => (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              className={`season-stop ${value === i ? "is-on" : ""} ${i > 0 && i <= value ? "is-past" : ""}`}
              onClick={() => set(i)}
              onMouseEnter={() => onHover?.(win ? win.index : null)}
            >
              <i aria-hidden />
              <span className="micro">{win ? `S${win.index + 1}` : "All"}</span>
              <span className="season-stop-date tabular">{win ? win.stop : "3 yrs"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
