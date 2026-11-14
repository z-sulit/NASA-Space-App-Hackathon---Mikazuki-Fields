import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import L from "leaflet";
import type { Preset } from "../../types";
import { prefersReducedMotion } from "../ui";
import { PH_BOUNDS } from "../../api/power";

export interface TargetMapHandle {
  /** Hover down onto a point (resolves when the camera has landed). */
  flyTo(lat: number, lon: number): Promise<void>;
  /** Climb back up to the whole-Philippines view. */
  reset(): Promise<void>;
  /** Glide over to a searched place at a regional zoom (stays in the targeting view). */
  glideTo(lat: number, lon: number): Promise<void>;
}

/** Leaflet flyTo that resolves on landing (or after `cap` ms if the map never reports it). */
function flight(m: L.Map, center: L.LatLngExpression, zoom: number, seconds: number, cap: number) {
  if (prefersReducedMotion()) {
    m.setView(center, zoom, { animate: false });
    return Promise.resolve();
  }
  return new Promise<void>((done) => {
    const t = setTimeout(done, cap);
    m.once("moveend", () => {
      clearTimeout(t);
      done();
    });
    m.flyTo(center, zoom, { duration: seconds, easeLinearity: 0.25 });
  });
}

export interface LatLon {
  lat: number;
  lon: number;
}

// On phones the HUD panels cover the lower half, so sit the islands higher.
const phone = () => window.innerWidth < 640;
const home = (): L.LatLngTuple => (phone() ? [9.6, 122.2] : [12.2, 122.4]);
const homeZoom = () => (phone() ? 5.0 : 5.9);

/**
 * Steps 02–03 backdrop: the real map, tinted like a cockpit display. Tap anywhere
 * in the Philippines to drop a target (or pick one of the 3 preset farms); a
 * reticle glides to the focused point.
 */
export function TargetMap({
  presets,
  focus,
  pin,
  rejected = null,
  locked,
  onHover,
  onPickPreset,
  onPickPoint,
  onTilesReady,
  ref,
}: {
  presets: Preset[];
  focus: LatLon | null;
  pin: LatLon | null;
  /** A refused tap (water, outside the Philippines): shown as a fading red mark. */
  rejected?: (LatLon & { key: number }) | null;
  locked: boolean;
  onHover: (id: string | null) => void;
  onPickPreset: (id: string) => void;
  onPickPoint: (p: LatLon) => void;
  /** The first screenful of map tiles has loaded (used to leave the loading screen). */
  onTilesReady?: () => void;
  ref?: Ref<TargetMapHandle>;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pinMarker = useRef<L.Marker | null>(null);
  const rejectMarker = useRef<L.Marker | null>(null);
  const [pt, setPt] = useState<{ x: number; y: number } | null>(null);
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const handlers = useRef({ onHover, onPickPreset, onPickPoint, locked, onTilesReady });
  handlers.current = { onHover, onPickPreset, onPickPoint, locked, onTilesReady };

  const place = () => {
    const m = map.current;
    const f = focusRef.current;
    if (!m || !f) return setPt(null);
    const c = m.latLngToContainerPoint([f.lat, f.lon]);
    setPt({ x: c.x, y: c.y });
  };

  useEffect(() => {
    if (!el.current) return;
    const bounds = L.latLngBounds([PH_BOUNDS.south - 3, PH_BOUNDS.west - 4], [PH_BOUNDS.north + 3, PH_BOUNDS.east + 4]);
    const m = L.map(el.current, { zoomControl: false, attributionControl: false, zoomSnap: 0, minZoom: 4.5, maxZoom: 14, maxBounds: bounds, maxBoundsViscosity: 0.8 });
    map.current = m;
    // Attribution is drawn by Mission above the cockpit glass (the canopy would cover Leaflet's).
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    })
      // Decode each tile as it arrives. Browsers otherwise decode lazily at first paint,
      // which (with the map hidden under the tiles) would land mid-transition as blank squares.
      .on("tileload", (e: L.TileEvent) => void (e.tile as HTMLImageElement).decode?.().catch(() => {}))
      .once("load", () => handlers.current.onTilesReady?.())
      .addTo(m);
    // Final view straight away: the map is pre-painted under the tiles, and the page
    // does the zoom-in as a GPU scale, so Leaflet never re-renders mid-transition.
    m.setView(home(), homeZoom(), { animate: false });

    presets.forEach((p) => {
      const short = p.name.split(" (")[0];
      const icon = L.divIcon({ className: "", html: `<span class="tgt"><i></i><b>${short} · Ref</b></span>`, iconSize: [0, 0] });
      L.marker([p.lat, p.lon], { icon, keyboard: true, title: `Reference site: ${p.name}`, bubblingMouseEvents: false })
        .on("mouseover", () => handlers.current.onHover(p.id))
        .on("mouseout", () => handlers.current.onHover(null))
        .on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          if (!handlers.current.locked) handlers.current.onPickPreset(p.id);
        })
        .addTo(m);
    });
    m.on("click", (e: L.LeafletMouseEvent) => {
      if (!handlers.current.locked) handlers.current.onPickPoint({ lat: e.latlng.lat, lon: e.latlng.lng });
    });
    m.on("move zoom resize", place);
    place();
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(place, [focus?.lat, focus?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  // The farmer's own pin.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    pinMarker.current?.remove();
    pinMarker.current = null;
    if (!pin) return;
    const icon = L.divIcon({ className: "", html: `<span class="tgt tgt-pin is-focus"><i></i><b>Your farm</b></span>`, iconSize: [0, 0] });
    pinMarker.current = L.marker([pin.lat, pin.lon], { icon, interactive: false }).addTo(m);
  }, [pin?.lat, pin?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refused tap: a red cross with a ripple that fades out on its own (CSS), re-added per tap.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    rejectMarker.current?.remove();
    rejectMarker.current = null;
    if (!rejected) return;
    const icon = L.divIcon({ className: "", html: `<span class="tgt-reject"><em></em><i></i></span>`, iconSize: [0, 0] });
    rejectMarker.current = L.marker([rejected.lat, rejected.lon], { icon, interactive: false, keyboard: false }).addTo(m);
  }, [rejected?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    flyTo(lat, lon) {
      const m = map.current;
      return m ? flight(m, [lat, lon], 12.2, 1.2, 2000) : Promise.resolve();
    },
    reset() {
      const m = map.current;
      return m ? flight(m, home(), homeZoom(), 0.9, 1600) : Promise.resolve();
    },
    glideTo(lat, lon) {
      const m = map.current;
      return m ? flight(m, [lat, lon], Math.max(m.getZoom(), 8.5), 0.6, 1200) : Promise.resolve();
    },
  }));

  return (
    <div className="absolute inset-0">
      <div ref={el} className="hud-map absolute inset-0" aria-label="Map of the Philippines: tap anywhere to choose a farm" />
      {pt && (
        <div aria-hidden className={`reticle ${locked ? "is-locked" : ""}`} style={{ transform: `translate(${pt.x}px, ${pt.y}px)` }}>
          <span className="reticle-ring" />
          <span className="reticle-brackets" />
          <span className="reticle-cross" />
        </div>
      )}
    </div>
  );
}
