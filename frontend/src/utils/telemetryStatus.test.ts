import { test } from "node:test";
import assert from "node:assert/strict";
import { telemetryStatus } from "./telemetryStatus.ts";

test("telemetryStatus classifies heat, slope, and dry-season rain boundaries accurately", () => {
  assert.deepEqual(telemetryStatus("heat", 29.9), { level: "GOOD", advisory: null });
  assert.deepEqual(telemetryStatus("heat", 30), { level: "WATCH", advisory: "Warm afternoons; mulch to retain moisture" });
  assert.deepEqual(telemetryStatus("heat", 33), { level: "WATCH", advisory: "Warm afternoons; mulch to retain moisture" });
  assert.deepEqual(telemetryStatus("heat", 33.1), { level: "ALERT", advisory: "Heat stress risk; may reduce pollination" });

  assert.deepEqual(telemetryStatus("slope", 7.9), { level: "GOOD", advisory: null });
  assert.deepEqual(telemetryStatus("slope", 8), { level: "WATCH", advisory: "Moderate slope; contour planting advised" });
  assert.deepEqual(telemetryStatus("slope", 18), { level: "WATCH", advisory: "Moderate slope; contour planting advised" });
  assert.deepEqual(telemetryStatus("slope", 18.1), { level: "ALERT", advisory: "Steep terrain; high topsoil erosion risk" });

  assert.deepEqual(telemetryStatus("rain", 601), { level: "GOOD", advisory: null });
  assert.deepEqual(telemetryStatus("rain", 600), { level: "WATCH", advisory: "Moderate dry season; prefer drought-tolerant crops" });
  assert.deepEqual(telemetryStatus("rain", 300), { level: "WATCH", advisory: "Moderate dry season; prefer drought-tolerant crops" });
  assert.deepEqual(telemetryStatus("rain", 299), {
    level: "ALERT",
    advisory: "Severe dry deficit; supplemental irrigation or legumes needed",
  });
});
