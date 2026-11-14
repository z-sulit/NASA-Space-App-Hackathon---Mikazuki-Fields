import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";

export { PHP_PER_USD, formatPhpUsd, formatPhpUsdInText } from "../utils/currency";

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Counts a number to its new value over 400 ms (instant with reduced motion). */
export function useCountUp(value: number, ms = 400) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(a + (value - a) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, ms]);
  return shown;
}

/** A number that tweens to its new value, so changes (El Niño, settings) are seen, not just swapped. */
export function CountUp({ value, format, ms = 300 }: { value: number; format: (v: number) => string; ms?: number }) {
  const shown = useCountUp(value, ms);
  return <span className="tabular">{format(shown)}</span>;
}

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/·";

/** Decodes `text` with random glyphs over `ms` each time it changes while `run` is true; shows it as-is otherwise. */
export function useScramble(text: string, run = true, ms = 700) {
  const [out, setOut] = useState(text);
  useEffect(() => {
    if (!run) {
      setOut(text);
      return;
    }
    if (prefersReducedMotion()) {
      setOut(text);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      const done = Math.floor(k * text.length);
      const rest = Array.from(text.slice(done), (ch) => (ch === " " ? " " : GLYPHS[Math.floor(Math.random() * GLYPHS.length)])).join("");
      setOut(text.slice(0, done) + rest);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, run, ms]);
  return out;
}

/** Plain-English tooltip: opens on tap, click or keyboard focus; closes on Escape or outside tap. */
export function InfoTip({
  label,
  children,
  align = "left",
  light = false,
}: {
  label: string;
  children: ReactNode;
  align?: "left" | "right";
  light?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label={`What is ${label}?`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false);
        }}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className={`-m-2.5 inline-flex size-11 items-center justify-center rounded-full transition-colors duration-150 ${
          light ? "text-ink/80 hover:text-ink" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Info className="size-[18px]" aria-hidden />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`absolute top-full z-30 mt-2 w-64 max-w-[80vw] rounded-md border border-border bg-popover p-3 text-left text-sm font-normal normal-case tracking-normal text-popover-foreground shadow-[0_1px_2px_rgb(31_42_30/0.08)] ${align === "right" ? "right-0" : "left-0"}`}
        >
          {children}
        </span>
      )}
    </span>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors duration-200 ease-field ${checked ? "border-sun bg-sun" : "border-input bg-muted"}`}
    >
      <span className={`inline-block size-6 rounded-full bg-card shadow-sm transition-transform duration-200 ease-field ${checked ? "translate-x-7" : "translate-x-1"}`} />
    </button>
  );
}
