import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import L from "leaflet";
import type { Preset } from "../../types";
import { prefersReducedMotion } from "../ui";

export interface TargetMapHandle {
  /** Hover down onto a farm (resolves when the camera has landed). */
  flyTo(p: Preset): Promise<void>;
  /** Climb back up to the whole-Philippines view. */
  reset(): Promise<void>;
}

const HOME: L.LatLngTuple = [12.2, 122.4];
const homeZoom = () => (window.innerWidth < 640 ? 5.1 : 5.9);

/**
 * Frames 2–3 backdrop: the real map, tinted olive like a cockpit display, with
 * target markers on the preset farms and a reticle that tracks the focused one.
 */
export function TargetMap({
  presets,
  focusId,
  locked,
  onHover,
  onPick,
  ref,
}: {
  presets: Preset[];
  focusId: string | null;
  locked: boolean;
  onHover: (id: string | null) => void;
  onPick: (id: string) => void;
  ref?: Ref<TargetMapHandle>;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<Record<string, L.Marker>>({});
  const [pt, setPt] = useState<{ x: number; y: number } | null>(null);
  const focusRef = useRef(focusId);
  focusRef.current = focusId;
  const handlers = useRef({ onHover, onPick });
  handlers.current = { onHover, onPick };

  const place = () => {
    const m = map.current;
    const p = presets.find((x) => x.id === focusRef.current);
    if (!m || !p) return setPt(null);
    const c = m.latLngToContainerPoint([p.lat, p.lon]);
    setPt({ x: c.x, y: c.y });
  };

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: false, zoomSnap: 0, minZoom: 4.5, maxZoom: 14, worldCopyJump: false, attributionControl: true });
    map.current = m;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    // Start a little high, then descend to the working altitude.
    m.setView(HOME, homeZoom() - 1.2, { animate: false });
    if (!prefersReducedMotion()) setTimeout(() => m.flyTo(HOME, homeZoom(), { duration: 1.6 }), 120);
    else m.setView(HOME, homeZoom(), { animate: false });

    presets.forEach((p) => {
      const icon = L.divIcon({ className: "", html: `<span class="tgt"><i></i><b>${p.name.split(" (")[0]}</b></span>`, iconSize: [0, 0] });
      const mk = L.marker([p.lat, p.lon], { icon, keyboard: true, title: p.name })
        .on("mouseover", () => handlers.current.onHover(p.id))
        .on("mouseout", () => handlers.current.onHover(null))
        .on("click", () => handlers.current.onPick(p.id))
        .addTo(m);
      markers.current[p.id] = mk;
    });
    m.on("move zoom resize", place);
    place();
    return () => {
      m.remove();
      map.current = null;
      markers.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(place, [focusId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    Object.entries(markers.current).forEach(([id, mk]) => {
      mk.getElement()?.querySelector(".tgt")?.classList.toggle("is-focus", id === focusId);
    });
  }, [focusId]);

  useImperativeHandle(ref, () => ({
    flyTo(p) {
      const m = map.current;
      if (!m) return Promise.resolve();
      if (prefersReducedMotion()) {
        m.setView([p.lat, p.lon], 12, { animate: false });
        return Promise.resolve();
      }
      return new Promise((done) => {
        const t = setTimeout(done, 3600);
        m.once("moveend", () => {
          clearTimeout(t);
          done();
        });
        m.flyTo([p.lat, p.lon], 12.2, { duration: 2.8, easeLinearity: 0.15 });
      });
    },
    reset() {
      const m = map.current;
      if (!m) return Promise.resolve();
      if (prefersReducedMotion()) {
        m.setView(HOME, homeZoom(), { animate: false });
        return Promise.resolve();
      }
      return new Promise((done) => {
        const t = setTimeout(done, 3000);
        m.once("moveend", () => {
          clearTimeout(t);
          done();
        });
        m.flyTo(HOME, homeZoom(), { duration: 2.1 });
      });
    },
  }));

  return (
    <div className="absolute inset-0">
      <div ref={el} className="hud-map absolute inset-0" aria-label="Map of the Philippines with 3 target farms" />
      {pt && (
        <div
          aria-hidden
          className={`reticle ${locked ? "is-locked" : ""}`}
          style={{ transform: `translate(${pt.x}px, ${pt.y}px)` }}
        >
          <span className="reticle-ring" />
          <span className="reticle-brackets" />
          <span className="reticle-cross" />
        </div>
      )}
    </div>
  );
}
