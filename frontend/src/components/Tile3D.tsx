import { useEffect, useRef, useState } from "react";
import { Emblem } from "./Emblem";
import { prefersReducedMotion } from "./ui";

const DEPTH = 18; // tile thickness in px
const SLICES = Array.from({ length: DEPTH - 1 }, (_, i) => i - (DEPTH - 2) / 2); // z positions between the faces

/**
 * The hero "product": a real 3D slab (CSS 3D, no WebGL) with the emblem on the front
 * and a spec plate on the back. Drag to spin it, click or press Enter to flip it;
 * left alone it sways and leans toward the pointer, then springs back to a face.
 */
export function Tile3D({ size = 176 }: { size?: number }) {
  const scene = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const st = useRef({ rx: 0, ry: 0, vx: 0, vy: 0, face: 0, dragging: false, moved: 0, lastX: 0, lastY: 0, px: 0, py: 0, visible: true });
  const [flipped, setFlipped] = useState(false);

  const apply = () => {
    const el = body.current;
    if (!el) return;
    const s = st.current;
    el.style.setProperty("--rx", `${s.rx.toFixed(2)}deg`);
    el.style.setProperty("--ry", `${s.ry.toFixed(2)}deg`);
    // Highlight slides across the face as the tile turns, like light on metal.
    const lean = Math.sin((s.ry * Math.PI) / 180);
    el.style.setProperty("--lx", `${(50 - lean * 45).toFixed(1)}%`);
    el.style.setProperty("--ly", `${(30 + s.rx * 0.8).toFixed(1)}%`);
  };

  useEffect(() => {
    const s = st.current;
    if (prefersReducedMotion()) {
      apply();
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!s.visible) return;
      if (!s.dragging) {
        const t = (now - t0) / 1000;
        const targetRy = s.face * 180 + Math.sin(t * 0.8) * 9 + s.px * 16;
        const targetRx = Math.sin(t * 0.6) * 4 - s.py * 12;
        s.vy = (s.vy + (targetRy - s.ry) * 0.045) * 0.86;
        s.vx = (s.vx + (targetRx - s.rx) * 0.045) * 0.86;
        s.ry += s.vy;
        s.rx += s.vx;
      }
      apply();
    };
    raf = requestAnimationFrame(tick);

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || s.dragging) return;
      s.px = (e.clientX / window.innerWidth) * 2 - 1;
      s.py = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove);
    const io = new IntersectionObserver(([entry]) => (s.visible = entry.isIntersecting));
    if (scene.current) io.observe(scene.current);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      io.disconnect();
    };
  }, []);

  const settle = (face: number) => {
    const s = st.current;
    s.face = face;
    setFlipped(Math.abs(face) % 2 === 1);
    if (prefersReducedMotion()) {
      s.ry = face * 180;
      s.rx = 0;
      apply();
    }
  };

  return (
    <div ref={scene} className="tile3d-scene relative" style={{ width: size, height: size }}>
      <div
        ref={body}
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        aria-label={flipped ? "Mikazuki Fields tile, back side. Drag to spin, press Enter to flip." : "Mikazuki Fields tile. Drag to spin, press Enter to flip."}
        className="tile3d cursor-grab touch-none select-none active:cursor-grabbing"
        style={{ width: size, height: size }}
        onPointerDown={(e) => {
          const s = st.current;
          e.currentTarget.setPointerCapture(e.pointerId);
          s.dragging = true;
          s.moved = 0;
          s.lastX = e.clientX;
          s.lastY = e.clientY;
        }}
        onPointerMove={(e) => {
          const s = st.current;
          if (!s.dragging) return;
          const dx = e.clientX - s.lastX;
          const dy = e.clientY - s.lastY;
          s.lastX = e.clientX;
          s.lastY = e.clientY;
          s.moved += Math.abs(dx) + Math.abs(dy);
          s.ry += dx * 0.6;
          s.rx = Math.max(-55, Math.min(55, s.rx - dy * 0.4));
          s.vy = Math.max(-14, Math.min(14, dx * 0.6)); // carried into the spring as a flick
          s.vx = 0;
          if (prefersReducedMotion()) apply();
        }}
        onPointerUp={() => {
          const s = st.current;
          if (!s.dragging) return;
          s.dragging = false;
          // A tap flips; a drag settles on whichever face is nearest (plus the flick's momentum).
          settle(s.moved < 6 ? s.face + 1 : Math.round((s.ry + s.vy * 8) / 180));
        }}
        onPointerCancel={() => {
          st.current.dragging = false;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            settle(st.current.face + 1);
          }
        }}
      >
        {SLICES.map((z) => (
          <span key={z} className="tile3d-slice" style={{ transform: `translateZ(${z}px)` }} />
        ))}
        <span className="tile3d-face" style={{ transform: `translateZ(${DEPTH / 2}px)` }}>
          <Emblem size={size} className="block" />
          <span className="tile3d-shine" />
        </span>
        <span className="tile3d-face tile3d-back" style={{ transform: `rotateY(180deg) translateZ(${DEPTH / 2}px)` }} aria-hidden={!flipped}>
          <span className="micro block text-chartreuse">Unit 01</span>
          <span className="mt-1 block font-display text-[22px] leading-6 tracking-[-0.02em]">
            Mikazuki
            <br />
            Fields
          </span>
          <span className="micro mt-auto block text-[#f4ede6]/75">
            3 routes · 6 seasons
            <br />
            8 crops · 3 farms
            <br />
            NASA POWER · SRTM · MODIS
          </span>
          <span className="tile3d-shine" />
        </span>
      </div>
      <span aria-hidden className="tile3d-shadow" />
    </div>
  );
}
