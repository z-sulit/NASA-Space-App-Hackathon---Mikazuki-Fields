import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatReverseAddress,
  hasResolvedPinName,
  inTargetName,
  lockTargetName,
  reportTargetSlug,
  shortTargetName,
} from "./locationName.ts";

test("formatReverseAddress formats barangay, city/municipality, and province cleanly", () => {
  assert.equal(
    formatReverseAddress({
      village: "Brgy. San Isidro",
      city: "Batangas City",
      state: "Batangas",
    }),
    "Brgy. San Isidro, Batangas City, Batangas",
  );
  assert.equal(
    formatReverseAddress({
      suburb: "Ibaan",
      municipality: "Ibaan",
      province: "Batangas",
    }),
    "Ibaan, Batangas",
  );
  assert.equal(
    formatReverseAddress(undefined, "Brgy. Poblacion, Malaybalay, Bukidnon, 8700, Philippines"),
    "Brgy. Poblacion, Malaybalay, Bukidnon",
  );
  assert.equal(formatReverseAddress({}), null);
});

test("target name helpers distinguish resolved pin names from placeholder pins and presets", () => {
  const preset = { id: "batangas", name: "Batangas (Ibaan)" };
  assert.equal(shortTargetName(preset), "Batangas");
  assert.equal(inTargetName(preset), "Batangas");
  assert.equal(lockTargetName(preset), "Batangas");
  assert.equal(reportTargetSlug(preset), "Batangas");

  const placeholderPin = { id: "pin-13.76,121.06", name: "Pinned farm (13.76° N, 121.06° E)" };
  assert.equal(hasResolvedPinName(placeholderPin), false);
  assert.equal(shortTargetName(placeholderPin), "Your farm");
  assert.equal(inTargetName(placeholderPin), "your farm");
  assert.equal(lockTargetName(placeholderPin), "Your farm");
  assert.equal(reportTargetSlug(placeholderPin), "Your-Farm");

  const resolvedPin = { id: "pin-13.76,121.06", name: "Brgy. San Isidro, Batangas City, Batangas" };
  assert.equal(hasResolvedPinName(resolvedPin), true);
  assert.equal(shortTargetName(resolvedPin), "Brgy. San Isidro, Batangas City, Batangas");
  assert.equal(inTargetName(resolvedPin), "Brgy. San Isidro, Batangas City, Batangas");
  assert.equal(lockTargetName(resolvedPin), "Brgy. San Isidro");
  assert.equal(reportTargetSlug(resolvedPin), "Brgy. San Isidro, Batangas City, Batangas");
});
