import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { PlantHandle, PlotSpec } from "../../three/plantScene";

/** React wrapper for the WebGL plantation. Shows a simple message if WebGL is missing. */
export function PlantField({ plots, plantKey, onSeason, drought = false }: { plots: PlotSpec[]; plantKey: string; onSeason: (i: number) => void; drought?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<PlantHandle | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const latest = useRef({ plots, onSeason, drought });
  latest.current = { plots, onSeason, drought };

  useEffect(() => {
    let dead = false;
    import("../../three/plantScene")
      .then(({ createPlantScene }) => {
        if (dead || !host.current) return;
        try {
          handle.current = createPlantScene(host.current);
          handle.current.plant(latest.current.plots, (i) => latest.current.onSeason(i));
          handle.current.setDrought(latest.current.drought);
          setReady(true);
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

  // El Niño look (harsh sun, dry cracked soil, blowing dust).
  useEffect(() => {
    handle.current?.setDrought(drought);
  }, [drought]);

  useEffect(() => {
    if (failed) onSeason(6);
  }, [failed, onSeason]);

  return (
    <div ref={host} className="absolute inset-0" aria-label="3D view of your field being planted, one plot per season">
      {!ready && !failed && (
        <p className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 text-sm text-ink/80">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Preparing your 3D field…
        </p>
      )}
      {failed && <p className="micro absolute top-1/2 left-1/2 -translate-x-1/2 text-ink/80">3D view needs WebGL; your field data is on the right.</p>}
    </div>
  );
}
