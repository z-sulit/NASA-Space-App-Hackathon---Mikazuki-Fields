/**
 * Calendar dates for the 6 planning seasons. The model is anchored to the Philippine
 * wet season (Jun–Nov) and dry season (Dec–May), so S1 starts at the next June:
 * this year's if it has not passed yet, otherwise next year's.
 */
import type { SeasonKind } from "../types";

export interface SeasonWindow {
  index: number;
  kind: SeasonKind;
  /** "Jun–Nov" / "Dec–May" */
  months: string;
  /** "'27" / "'27–'28" */
  years: string;
  /** "Jun'27" / "Dec'27" (slider stops) */
  stop: string;
  /** "Jun 2027 – Nov 2027" */
  range: string;
  /** "June 2027 – November 2027" */
  long: string;
}

export function planStartYear(today = new Date()): number {
  // Jan–Jun: this June is still the upcoming wet season. Jul–Dec: plan for next June.
  return today.getMonth() <= 5 ? today.getFullYear() : today.getFullYear() + 1;
}

export function seasonWindows(startYear: number): SeasonWindow[] {
  return Array.from({ length: 6 }, (_, i) => {
    const y = startYear + Math.floor(i / 2);
    const yy = (n: number) => `'${String(n).slice(2)}`;
    return i % 2 === 0
      ? { index: i, kind: "wet", months: "Jun–Nov", years: yy(y), stop: `Jun${yy(y)}`, range: `Jun ${y} – Nov ${y}`, long: `June ${y} – November ${y}` }
      : {
          index: i,
          kind: "dry",
          months: "Dec–May",
          years: `${yy(y)}–${yy(y + 1)}`,
          stop: `Dec${yy(y)}`,
          range: `Dec ${y} – May ${y + 1}`,
          long: `December ${y} – May ${y + 1}`,
        };
  });
}

/** "Jun 2027 – May 2030" */
export const planSpan = (startYear: number) => `Jun ${startYear} – May ${startYear + 3}`;
