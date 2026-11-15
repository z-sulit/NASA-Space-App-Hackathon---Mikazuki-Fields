export type TelemetryLevel = "GOOD" | "WATCH" | "ALERT";
export type TelemetryMetric = "heat" | "slope" | "rain";

export interface TelemetryBadge {
  level: TelemetryLevel;
  advisory: string | null;
}

interface ThresholdSpec {
  check: (value: number) => TelemetryLevel;
  advisory: Record<Exclude<TelemetryLevel, "GOOD">, string>;
}

const THRESHOLDS: Record<TelemetryMetric, ThresholdSpec> = {
  heat: {
    check: (v) => (v < 30 ? "GOOD" : v <= 33 ? "WATCH" : "ALERT"),
    advisory: {
      WATCH: "Warm afternoons; mulch to retain moisture",
      ALERT: "Heat stress risk; may reduce pollination",
    },
  },
  slope: {
    check: (v) => (v < 8 ? "GOOD" : v <= 18 ? "WATCH" : "ALERT"),
    advisory: {
      WATCH: "Moderate slope; contour planting advised",
      ALERT: "Steep terrain; high topsoil erosion risk",
    },
  },
  rain: {
    check: (v) => (v > 600 ? "GOOD" : v >= 300 ? "WATCH" : "ALERT"),
    advisory: {
      WATCH: "Moderate dry season; prefer drought-tolerant crops",
      ALERT: "Severe dry deficit; supplemental irrigation or legumes needed",
    },
  },
};

/** Classify key NASA heat, terrain slope, and dry-season rain metrics into plain-English statuses. */
export function telemetryStatus(metric: TelemetryMetric, value: number): TelemetryBadge {
  const spec = THRESHOLDS[metric];
  const level = spec.check(value);
  return { level, advisory: level === "GOOD" ? null : spec.advisory[level] };
}
