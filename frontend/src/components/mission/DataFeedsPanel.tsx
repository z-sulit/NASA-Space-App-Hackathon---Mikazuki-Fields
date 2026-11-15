import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Radio } from "lucide-react";
import type { DataSource } from "../../api/client";
import type { Weather } from "../../api/weather";
import type { Preset } from "../../types";

type FeedTone = "live" | "cached" | "offline";

interface FeedItem {
  name: string;
  label: string;
  tone: FeedTone;
}

const DOT_CLASS: Record<FeedTone, string> = {
  live: "bg-emerald-400",
  cached: "bg-amber-400",
  offline: "bg-[#f87171]",
};

const LABEL_CLASS: Record<FeedTone, string> = {
  live: "text-emerald-300",
  cached: "text-amber-300",
  offline: "text-[#fca5a5]",
};

export interface DataFeedsPanelProps {
  farmSource: DataSource;
  focus: Pick<Preset, "id" | "placeholders">;
  pinVia: "api" | "browser" | "nearest" | null;
  altitudeFrom?: string | null;
  weather: Weather | null | undefined;
  gibsOffline: boolean;
}

/** Standalone, easily removable telemetry feed status drawer (reuses existing app state). */
export function DataFeedsPanel({ farmSource, focus, pinVia, altitudeFrom, weather, gibsOffline }: DataFeedsPanelProps) {
  const [open, setOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 && window.innerHeight >= 780 : false,
  );
  const [online, setOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine !== false : true));

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const isPin = focus.id.startsWith("pin-");
  const powerLabel = isPin ? (pinVia === "nearest" ? "Cached ref" : "Live") : farmSource === "api" ? "Live / Cached" : "Cached";
  const powerTone: FeedTone = isPin ? (pinVia === "nearest" ? "cached" : "live") : farmSource === "api" ? "live" : "cached";
  const srtmLive = altitudeFrom === "SRTM" && !focus.placeholders?.includes("slope_pct");
  const gibsDown = !online || gibsOffline;

  const feeds: FeedItem[] = [
    {
      name: "Mikazuki API",
      label: farmSource === "api" ? "Online" : farmSource === "bundle" ? "Offline bundle" : "In-browser",
      tone: farmSource === "api" ? "live" : "cached",
    },
    { name: "NASA POWER Climate", label: powerLabel, tone: powerTone },
    { name: "SRTM 30m Terrain", label: srtmLive ? "Live" : "Cached ref", tone: srtmLive ? "live" : "cached" },
    { name: "Open-Meteo Weather", label: weather ? "Live" : "Offline", tone: weather ? "live" : "offline" },
    { name: "NASA GIBS / Satellite", label: gibsDown ? "Offline" : "Online", tone: gibsDown ? "offline" : "live" },
  ];

  const liveCount = feeds.filter((f) => f.tone === "live").length;

  return (
    <aside
      aria-label="Data feeds status"
      className="pointer-events-auto fixed bottom-[18px] left-3 z-30 max-w-[calc(100vw-24px)] sm:bottom-4 sm:left-4"
    >
      {open && (
        <div className="mb-1.5 w-[min(232px,calc(100vw-24px))] rounded-xl border border-ink/16 bg-[#141a06]/90 px-3 py-2 text-[11px] text-ink shadow-[0_12px_32px_rgb(0_0_0/0.45)] backdrop-blur-md">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-semibold tracking-wider text-ink/60 uppercase">
            <span>Data feeds</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Collapse data feeds panel"
              className="rounded p-0.5 text-ink/70 hover:bg-ink/10 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
            >
              <ChevronDown className="size-3.5" aria-hidden />
            </button>
          </div>
          <ul className="space-y-1">
            {feeds.map((f) => (
              <li key={f.name} className="flex items-center justify-between gap-2">
                <span className="truncate text-ink/80">{f.name}</span>
                <span className={`inline-flex shrink-0 items-center gap-1.5 font-medium ${LABEL_CLASS[f.tone]}`}>
                  <span className={`size-1.5 rounded-full ${DOT_CLASS[f.tone]}`} aria-hidden />
                  {f.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Data feeds: ${liveCount} of ${feeds.length} live`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-7 items-center gap-1 rounded-full border border-ink/16 bg-[#141a06]/86 px-2 py-1 text-[10.5px] font-semibold text-ink/85 shadow-sm backdrop-blur-md transition-colors hover:border-ink/30 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink sm:gap-1.5 sm:px-2.5 sm:text-[11px]"
      >
        <Radio className="size-3 text-sakura" aria-hidden />
        <span className="hidden sm:inline">Feeds</span>
        <span className="text-ink/60 tabular">{liveCount}/{feeds.length}</span>
        {open ? <ChevronDown className="size-3 text-ink/60" aria-hidden /> : <ChevronUp className="size-3 text-ink/60" aria-hidden />}
      </button>
    </aside>
  );
}
