import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fieldReportFilename,
  fieldReportHeader,
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

test("fieldReportFilename and fieldReportHeader distinguish custom saved farms", () => {
  const pin = { id: "pin-15.50,120.90", name: "San Jose, Nueva Ecija", lat: 15.5, lon: 120.9 };
  const otherPin = { id: "pin-15.52,120.92", name: "San Jose, Nueva Ecija", lat: 15.52, lon: 120.92 };

  const northFile = fieldReportFilename(pin, { id: "B", custom: false }, "North Paddy");
  const southFile = fieldReportFilename(otherPin, { id: "B", custom: false }, "South Terrace");
  const unnamedFile = fieldReportFilename(pin, { id: "A", custom: true });

  assert.equal(northFile, "Mikazuki-Report-North-Paddy-San-Jose-Nueva-Ecija-RouteB.pdf");
  assert.equal(southFile, "Mikazuki-Report-South-Terrace-San-Jose-Nueva-Ecija-RouteB.pdf");
  assert.notEqual(northFile, southFile);
  assert.equal(unnamedFile, "Mikazuki-Report-San-Jose-Nueva-Ecija-Custom.pdf");

  const header = fieldReportHeader({
    farmName: "North Paddy",
    target: pin,
    landHa: 2.5,
    planName: "Rice-Mungbean",
    routeBadge: "Route B",
    span: "2026-2029",
  });
  assert.equal(header.title, "North Paddy - Crop Rotation Report");
  assert.match(header.subtitle, /15\.50° N, 120\.90° E/);
  assert.match(header.subtitle, /2\.5 ha/);
  assert.match(header.subtitle, /San Jose, Nueva Ecija/);
  assert.equal(header.locationValue, "North Paddy · San Jose, Nueva Ecija");
});
