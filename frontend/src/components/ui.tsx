import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Info, type LucideIcon } from "lucide-react";

export const peso = (v: number) => `₱${Math.round(v).toLocaleString("en-PH")}`;
export const pesoK = (v: number) => `₱${Math.round(v / 1000).toLocaleString("en-PH")}k`;

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

/** Plain-English tooltip: opens on tap, click or keyboard focus; closes on Escape or outside tap. */
/** Fades and lifts its children in the first time they scroll into view (see `.reveal` in index.css). */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} data-in={inView} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/·";

/** Cockpit-style readout: text "decodes" left to right from random glyphs. Re-runs when the text changes. */
export function useScramble(text: string, run = true, ms = 700) {
  const [out, setOut] = useState(run ? text : "");
  useEffect(() => {
    if (!run) {
      setOut("");
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

export function SectionTitle({ id, num, kicker, children }: { id: string; num: string; kicker: string; children: ReactNode }) {
  return (
    <div>
      <p className="micro text-olive">
        {num} / {kicker}
      </p>
      <h2 id={id} className="mt-1 text-[28px] leading-8 font-medium">
        {children}
      </h2>
    </div>
  );
}

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
          light ? "text-[#f4ede6]/80 hover:text-[#f4ede6]" : "text-muted-foreground hover:text-foreground"
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

type Tone = "good" | "warn" | "critical" | "neutral";
const TONE: Record<Tone, string> = {
  good: "bg-badge-good-bg text-badge-good-fg",
  warn: "bg-badge-warn-bg text-badge-warn-fg",
  critical: "bg-badge-critical-bg text-badge-critical-fg",
  neutral: "bg-muted text-muted-foreground",
};

export function Badge({ tone, icon: Icon, children }: { tone: Tone; icon?: LucideIcon; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-bold ${TONE[tone]}`}>
      {Icon && <Icon className="size-4" aria-hidden />}
      {children}
    </span>
  );
}

/** Segmented control built on real radio inputs (keyboard and screen-reader friendly). */
export function Segmented<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-bold">{legend}</legend>
      <div className="grid gap-1 rounded-md border border-input bg-card p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-11 cursor-pointer items-center justify-center rounded-sm px-2 text-center text-sm transition-colors duration-150 hover:bg-muted has-[:checked]:bg-primary has-[:checked]:font-bold has-[:checked]:text-primary-foreground has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
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

export function SourcePill({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-border bg-card px-2 py-0.5 text-xs font-bold text-muted-foreground">{children}</span>;
}
