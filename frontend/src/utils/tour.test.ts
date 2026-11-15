import { test } from "node:test";
import assert from "node:assert/strict";
import { placeCard } from "./tour.ts";

const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, right: left + width, bottom: top + height });

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
});
