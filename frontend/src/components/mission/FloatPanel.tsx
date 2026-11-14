import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { ChevronDown, ChevronUp, GripHorizontal } from "lucide-react";

/** Panels stay this far inside the viewport (and below the brand bar at the top). */
const EDGE = 8;
const TOP = 52;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

type Box = { x: number; y: number; w: number; h: number | null };

/**
 * A HUD panel the farmer can move, resize and fold away, so it never sits on the part of the
 * map or 3D field they want to see.
 *
 * Until it is touched, the panel keeps its CSS layout (tilted on the canopy glass, docked on
 * phones). The first drag or resize "lifts" it: it becomes a flat absolutely-placed box at the
 * same spot, which then follows the pointer and is kept inside the viewport. Double-clicking
 * the bar puts it back.
 *
 * mode "sheet": a bottom sheet (field data on phones and tablets). The bar's handle changes the
 * sheet's height instead of moving it.
 */
export function usePanel({ minW = 240, minH = 150, collapsed: startCollapsed = false, mode = "float" }: { minW?: number; minH?: number; collapsed?: boolean; mode?: "float" | "sheet" } = {}) {
  const ref = useRef<HTMLElement | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [sheetH, setSheetH] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(startCollapsed);
  const [active, setActive] = useState(false);
  const boxRef = useRef(box);
  boxRef.current = box;
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;

  // Switching between float and sheet (crossing a breakpoint) starts from the CSS layout again.
  useEffect(() => {
    setBox(null);
    setSheetH(null);
  }, [mode]);

  /** The panel's current box, in its offset parent's coordinates. */
  const measure = useCallback((): Box | null => {
    const el = ref.current;
    if (!el) return null;
    if (boxRef.current) return boxRef.current;
    const r = el.getBoundingClientRect();
    const p = (el.offsetParent ?? document.body).getBoundingClientRect();
    // Keep the height it has now (its content scrolls inside); a folded panel stays auto.
    return { x: r.left - p.left, y: r.top - p.top, w: r.width, h: collapsedRef.current ? null : el.offsetHeight };
  }, []);
  const parentRect = () => (ref.current?.offsetParent ?? document.body).getBoundingClientRect();

  /** Keep a box inside the viewport. */
  const fit = useCallback((b: Box): Box => {
    const p = parentRect();
    const el = ref.current;
    const h = b.h ?? el?.offsetHeight ?? 0;
    const w = Math.min(b.w, innerWidth - 2 * EDGE);
    return {
      ...b,
      w,
      h: b.h === null ? null : Math.min(b.h, innerHeight - TOP - EDGE),
      x: clamp(b.x, EDGE - p.left, innerWidth - EDGE - w - p.left),
      y: clamp(b.y, TOP - p.top, innerHeight - EDGE - Math.min(h, innerHeight - TOP - EDGE) - p.top),
    };
  }, []);

  // A window resize must not strand a moved panel off-screen.
  useEffect(() => {
    if (!box) return;
    const onResize = () => setBox((b) => (b ? fit(b) : b));
    addEventListener("resize", onResize);
    return () => removeEventListener("resize", onResize);
  }, [box !== null, fit]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Follow one pointer from pointerdown to pointerup on the handle that was pressed. */
  const track = (e: PointerEvent, onMove: (dx: number, dy: number) => void) => {
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const sx = e.clientX;
    const sy = e.clientY;
    setActive(true);
    const move = (ev: globalThis.PointerEvent) => onMove(ev.clientX - sx, ev.clientY - sy);
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      setActive(false);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };

  const startDrag = (e: PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button:not([data-grip]), a, input, [role=switch], [role=radio]")) return;
    e.preventDefault();
    if (mode === "sheet") {
      const h0 = ref.current?.offsetHeight ?? 0;
      track(e, (_, dy) => setSheetH(clamp(h0 - dy, minH, innerHeight * 0.88)));
      return;
    }
    const b0 = measure();
    if (!b0) return;
    track(e, (dx, dy) => setBox(fit({ ...b0, x: b0.x + dx, y: b0.y + dy })));
  };

  const startResize = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const b0 = measure();
    const el = ref.current;
    if (!b0 || !el) return;
    const h0 = b0.h ?? el.offsetHeight;
    const r = el.getBoundingClientRect();
    track(e, (dx, dy) =>
      setBox({
        ...b0,
        w: clamp(b0.w + dx, minW, innerWidth - EDGE - r.left),
        h: clamp(h0 + dy, minH, innerHeight - EDGE - r.top),
      }),
    );
  };

  /** Keyboard: arrows on the grip move the panel; on the resize handle they resize it. */
  const nudge = (e: KeyboardEvent, kind: "move" | "size") => {
    const d = e.shiftKey ? 48 : 16;
    const dx = e.key === "ArrowRight" ? d : e.key === "ArrowLeft" ? -d : 0;
    const dy = e.key === "ArrowDown" ? d : e.key === "ArrowUp" ? -d : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    if (mode === "sheet") {
      if (kind === "move") setSheetH(clamp((sheetH ?? ref.current?.offsetHeight ?? 0) - dy, minH, innerHeight * 0.88));
      return;
    }
    const b0 = measure();
    const el = ref.current;
    if (!b0 || !el) return;
    if (kind === "move") setBox(fit({ ...b0, x: b0.x + dx, y: b0.y + dy }));
    else setBox(fit({ ...b0, w: Math.max(minW, b0.w + dx), h: Math.max(minH, (b0.h ?? el.offsetHeight) + dy) }));
  };

  const reset = () => {
    setBox(null);
    setSheetH(null);
  };

  const style: CSSProperties | undefined =
    mode === "sheet"
      ? sheetH !== null && !collapsed
        ? { height: sheetH, maxHeight: "none" }
        : undefined
      : box
        ? {
            position: "absolute",
            left: box.x,
            top: box.y,
            right: "auto",
            bottom: "auto",
            width: box.w,
            height: collapsed ? "auto" : (box.h ?? undefined),
            maxHeight: collapsed ? undefined : box.h === null ? `calc(100svh - ${TOP + EDGE}px)` : "none",
            margin: 0,
            translate: "none",
            transform: "none",
            animation: "none",
            transition: "none",
            opacity: 1,
          }
        : undefined;

  return {
    ref,
    style,
    collapsed,
    toggle: () => setCollapsed((c) => !c),
    setCollapsed,
    lifted: box !== null || sheetH !== null,
    active,
    mode,
    startDrag,
    startResize,
    nudge,
    reset,
  };
}
export type Panel = ReturnType<typeof usePanel>;

/** The panel's top bar: grab it to move (or, as a sheet, to resize), button to fold. */
export function PanelBar({ panel, label, children }: { panel: Panel; label: string; children: ReactNode }) {
  return (
    <div className="panel-bar" onPointerDown={panel.startDrag} onDoubleClick={panel.reset}>
      <button
        type="button"
        data-grip
        className="panel-grip"
        aria-label={panel.mode === "sheet" ? `Resize ${label} (arrow keys)` : `Move ${label} (arrow keys; double-click to reset)`}
        onKeyDown={(e) => panel.nudge(e, "move")}
      >
        <GripHorizontal className="size-4" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        className="panel-fold"
        onClick={panel.toggle}
        aria-expanded={!panel.collapsed}
        aria-label={panel.collapsed ? `Show ${label}` : `Fold ${label} away`}
      >
        {panel.collapsed ? <ChevronDown className="size-4" aria-hidden /> : <ChevronUp className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

/** Corner handle that resizes a floating panel (not shown on sheets). */
export function ResizeGrip({ panel, label }: { panel: Panel; label: string }) {
  if (panel.mode === "sheet" || panel.collapsed) return null;
  return (
    <button
      type="button"
      className="panel-resize"
      aria-label={`Resize ${label} (arrow keys)`}
      onPointerDown={panel.startResize}
      onKeyDown={(e) => panel.nudge(e, "size")}
    />
  );
}

/** Tracks a media query (for switching a panel between floating and sheet). */
export function useMedia(query: string) {
  const [on, setOn] = useState(() => typeof matchMedia === "function" && matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const onChange = () => setOn(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return on;
}
