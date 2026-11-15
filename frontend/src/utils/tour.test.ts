import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceTourForStage, placeCard, TOUR_ORDER, visibleRefsRect } from "./tour.ts";

const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height });

test("placeCard goes under the target, above it when there is no room, and never off screen", () => {
  // Room below: centred under the target
  assert.deepEqual(placeCard(box(500, 100, 300, 150), 340, 200, 1366, 800), { left: 480, top: 262 });
  // Target near the bottom: above it
  assert.deepEqual(placeCard(box(500, 600, 300, 150), 340, 200, 1366, 800), { left: 480, top: 388 });
  // Target fills the screen height: pinned to the bottom edge
  assert.equal(placeCard(box(0, 50, 390, 700), 340, 200, 390, 800).top, 588);
  // Target scrolled below the screen: the card still shows
  assert.equal(placeCard(box(30, 1055, 330, 58), 340, 216, 390, 844).top, 616);
  // Target at the left edge of a phone: the card stays 12 px inside
  assert.equal(placeCard(box(0, 100, 60, 40), 340, 200, 390, 800).left, 12);
  assert.equal(placeCard(box(360, 100, 30, 40), 340, 200, 390, 800).left, 38);
  // Tall refs spotlight on desktop with preferSide places the card cleanly beside it without covering Mindanao.
  const sideAt = placeCard(box(660, 270, 230, 300), 390, 250, 1366, 768, { preferSide: true });
  assert.equal(sideAt.left + 390 <= 660 - 12 || sideAt.left >= 890 + 12, true);
  assert.equal(sideAt.left >= 12 && sideAt.left + 390 <= 1366 - 12, true);
  // Falls back below/above on narrow mobile screens where neither side has room.
  const narrowAt = placeCard(box(120, 200, 140, 180), 366, 220, 390, 844, { preferSide: true });
  assert.equal(narrowAt.left, 12);
  assert.equal(narrowAt.top >= 380 + 12, true);
});

test("visibleRefsRect merges visible reference markers and drops off-screen or zero-size nodes", () => {
  const merged = visibleRefsRect(
    [
      box(610, 180, 90, 18),
      box(640, 520, 110, 18),
      box(0, 0, 0, 0),
      box(1600, 300, 90, 18),
    ],
    1366,
    800,
  );
  assert.deepEqual(merged, box(610, 180, 140, 358));
  assert.equal(visibleRefsRect([box(-120, 100, 90, 18)], 1366, 800), null);
});

test("advanceTourForStage advances earlier-screen steps on direct Lock/Plant clicks and preserves Explore/skip states", () => {
  const layersIdx = TOUR_ORDER.indexOf("layers");
  const lockIdx = TOUR_ORDER.indexOf("lock");
  const settingsIdx = TOUR_ORDER.indexOf("settings");
  const routesIdx = TOUR_ORDER.indexOf("routes");
  const reportIdx = TOUR_ORDER.indexOf("report");

  assert.equal(lockIdx, layersIdx + 1);
  // Direct Lock click from any Step 02 target advances to "settings" on Step 04.
  assert.equal(advanceTourForStage(0, "plants"), settingsIdx);
  assert.equal(advanceTourForStage(layersIdx, "plants"), settingsIdx);
  assert.equal(advanceTourForStage(lockIdx, "plants"), settingsIdx);
  // Explore clicked first on "lock" already moved tour to "settings"; entering "plants" keeps it there.
  assert.equal(advanceTourForStage(settingsIdx, "plants"), settingsIdx);

  // Direct Plant click from "settings" advances to "routes" on Step 05.
  assert.equal(advanceTourForStage(settingsIdx, "planting"), routesIdx);
  // Explore clicked first on "settings" already moved tour to "routes", or later Step 05 step stays unchanged.
  assert.equal(advanceTourForStage(routesIdx, "planting"), routesIdx);
  assert.equal(advanceTourForStage(reportIdx, "planting"), reportIdx);

  // Skipped/finished tour never revives on stage transitions.
  assert.equal(advanceTourForStage(null, "plants"), null);
  assert.equal(advanceTourForStage(null, "planting"), null);
});
