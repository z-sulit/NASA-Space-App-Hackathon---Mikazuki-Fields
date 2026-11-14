import { useEffect, useRef, useState } from "react";
import type { TileHandle } from "../three/tileScene";
import { Tile3D } from "./Tile3D";
import { prefersReducedMotion } from "./ui";

function supportsWebGL() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * The hero tile. Shows the CSS slab straight away, then swaps in the WebGL
 * version (lit, beveled, logo embossed) once three.js has loaded in its own chunk.
 * Stays on the CSS slab with reduced motion, without WebGL, or if the GPU context is lost.
 */
export function HeroTile({ size = 176, ready }: { size?: number; ready: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<TileHandle | null>(null);
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const [gl, setGl] = useState(false);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion() || !supportsWebGL()) return;
    let dead = false;
    import("../three/tileScene")
      .then(({ createTileScene }) => {
        if (dead || !host.current) return;
        const fail = () => {
          handle.current?.dispose();
          handle.current = null;
          setGl(false);
        };
        try {
          handle.current = createTileScene(host.current, setFlipped, fail);
          setGl(true);
          if (readyRef.current) handle.current.enter();
        } catch {
          fail();
        }
      })
      .catch(() => {
        /* chunk failed to load (offline): keep the CSS tile */
      });
    return () => {
      dead = true;
      handle.current?.dispose();
      handle.current = null;
    };
  }, []);

  useEffect(() => {
    if (ready) handle.current?.enter();
  }, [ready]);

  const canvasSize = Math.round(size * 1.9);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {!gl && <Tile3D size={size} />}
      <div
        ref={host}
        role="button"
        tabIndex={gl ? 0 : -1}
        aria-hidden={!gl}
        aria-pressed={flipped}
        aria-label={flipped ? "Mikazuki Fields tile, back side. Drag to spin, press Enter to flip." : "Mikazuki Fields tile. Drag to spin, press Enter to flip."}
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${gl ? "" : "pointer-events-none opacity-0"}`}
        style={{ width: canvasSize, height: canvasSize }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handle.current?.flip();
          }
        }}
      />
      {gl && <span aria-hidden className="tile3d-shadow" />}
    </div>
  );
}
