import { useCallback } from "react";
import { Mission } from "./components/mission/Mission";
import presetsJson from "./data/presets.json";
import type { Preset } from "./types";

const PRESETS = presetsJson as Preset[];

/** One screen, no page scroll: the mission walks through every step in order. */
export default function App() {
  const onReady = useCallback(() => {}, []);

  return (
    <div className="h-[100svh] overflow-clip">
      <Mission presets={PRESETS} onReady={onReady} />
    </div>
  );
}
