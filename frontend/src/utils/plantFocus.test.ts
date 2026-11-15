import { test } from "node:test";
import assert from "node:assert/strict";
import { DIMMED_PLOT_OPACITY, nextPlotCropAppearance } from "./plantFocus.ts";

test("nextPlotCropAppearance keeps focused plot opaque, fades non-selected plots to 0.18, and restores when focus clears", () => {
  assert.deepEqual(nextPlotCropAppearance(1, 2, 2), {
    opacity: 1,
    transparent: false,
    depthWrite: true,
  });

  let op = 1;
  for (let i = 0; i < 40; i++) {
    const res = nextPlotCropAppearance(op, 0, 2);
    assert.equal(res.transparent, true);
    assert.equal(res.depthWrite, false);
    op = res.opacity;
  }
  assert.ok(Math.abs(op - DIMMED_PLOT_OPACITY) < 1e-4);

  for (let i = 0; i < 40; i++) {
    op = nextPlotCropAppearance(op, 0, -1).opacity;
  }
  assert.deepEqual(nextPlotCropAppearance(op, 0, -1), {
    opacity: 1,
    transparent: false,
    depthWrite: true,
  });
});
