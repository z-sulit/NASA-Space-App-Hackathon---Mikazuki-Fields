import { useEffect, useRef, useState } from "react";
import type { PlantHandle, PlotSpec } from "../../three/plantScene";

/** React wrapper for the WebGL plantation. Shows a simple message if WebGL is missing. */
export function PlantField({ plots, plantKey, onSeason }: { plots: PlotSpec[]; plantKey: string; onSeason: (i: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<PlantHandle | null>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef({ plots, onSeason });
  latest.current = { plots, onSeason };

  useEffect(() => {
    let dead = false;
    import("../../three/plantScene")
      .then(({ createPlantScene }) => {
        if (dead || !host.current) return;
        try {
          handle.current = createPlantScene(host.current);
          handle.current.plant(latest.current.plots, (i) => latest.current.onSeason(i));
        } catch {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
    return () => {
      dead = true;
      handle.current?.dispose();
      handle.current = null;
    };
  }, []);

  // Replant when the route changes; only re-wilt when the dry spell changes.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    handle.current?.plant(latest.current.plots, (i) => latest.current.onSeason(i));
  }, [plantKey]);
  const wiltKey = plots.map((p) => (p.wilt ? 1 : 0)).join("");
  useEffect(() => {
    handle.current?.setWilt(latest.current.plots.map((p) => p.wilt));
  }, [wiltKey]);

  useEffect(() => {
    if (failed) onSeason(6);
  }, [failed, onSeason]);

  return (
    <div ref={host} className="absolute inset-0" aria-label="3D view of your field being planted, one plot per season">
      {failed && <p className="micro absolute top-1/2 left-1/2 -translate-x-1/2 text-[#f6efeb]/80">3D view needs WebGL; your field data is on the right.</p>}
    </div>
  );
}
