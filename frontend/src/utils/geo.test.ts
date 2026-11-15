import { test } from "node:test";
import assert from "node:assert/strict";
import { ringAreaHa, ringCentroid } from "./geo.ts";

// A square of `m` metres a side with its south-west corner at (lat, lon).
const square = (lat: number, lon: number, m: number) => {
  const dLat = m / 111_195;
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  return [
    { lat, lon },
    { lat, lon: lon + dLon },
    { lat: lat + dLat, lon: lon + dLon },
    { lat: lat + dLat, lon },
  ];
};

test("ringAreaHa measures a 100 m square in Bukidnon as 1 hectare", () => {
  const ring = square(7.9, 125.09, 100);
  assert.ok(Math.abs(ringAreaHa(ring) - 1) < 0.01);
  // Winding order does not change the area
  assert.ok(Math.abs(ringAreaHa([...ring].reverse()) - 1) < 0.01);
  // 1 km square = 100 ha
  assert.ok(Math.abs(ringAreaHa(square(16.9, 121.8, 1000)) - 100) < 1);
});

test("ringAreaHa is 0 for fewer than 3 corners or corners on one line", () => {
  assert.equal(ringAreaHa([]), 0);
  assert.equal(ringAreaHa([{ lat: 8, lon: 125 }, { lat: 8.1, lon: 125 }]), 0);
});

test("ringCentroid is the middle of a square, and inside an L-shaped field", () => {
  const c = ringCentroid(square(8, 125, 200));
  assert.ok(Math.abs(c.lat - (8 + 100 / 111_195)) < 1e-6);
  // An L: the plain average of the corners is pulled toward the corner-heavy side; the area centre is not.
  const L = [
    { lat: 0, lon: 0 },
    { lat: 0, lon: 2 },
    { lat: 1, lon: 2 },
    { lat: 1, lon: 1 },
    { lat: 2, lon: 1 },
    { lat: 2, lon: 0 },
  ];
  const cl = ringCentroid(L);
  assert.ok(Math.abs(cl.lat - 5 / 6) < 1e-9 && Math.abs(cl.lon - 5 / 6) < 1e-9);
  // Corners on one line: the average, not NaN
  assert.deepEqual(ringCentroid([{ lat: 1, lon: 1 }, { lat: 3, lon: 1 }]), { lat: 2, lon: 1 });
});
